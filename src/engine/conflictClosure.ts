import type {
  BrokerStockOpinion, ReportSummary, EvidenceSnippet, Broker,
  StockTicker, BrokerId, EvidenceId, Stance, Rating,
} from '../domain'
import type {
  ConflictClosure, ConsensusPoint, DisagreementPoint, DisagreementDimension,
  OutlierClassification, OutlierReason, ResultantState,
  StrengthBand, ConfidenceDetail, TargetStats,
} from './types'
import { classifyTheme, topicForDimension } from './classifiers'
import { computeTargetStats, clamp, unique } from './stats'

// ─── Tuneable thresholds (all documented in docs/closure-logic.md) ────

const OUTLIER_Z_THRESHOLD         = 1.25
const STANCE_CONSENSUS_PCT        = 0.75  // ≥75% of brokers aligned
const STANCE_MAJORITY_PCT         = 0.66  // ≥66% is a stance majority
const RATING_MAJORITY_PCT         = 0.66
const TARGET_CONSENSUS_SPREAD_PCT = 15    // spread <15% → consensus on valuation
const TARGET_DISAGREEMENT_PCT     = 25    // spread ≥25% → material disagreement
const CONFIDENCE_STRONG           = 0.70
const CONFIDENCE_MODERATE         = 0.40

// ─── Public API ───────────────────────────────────────────────────────

export interface ConflictClosureInputs {
  readonly ticker: StockTicker
  readonly opinions: readonly BrokerStockOpinion[]
  readonly summaries: readonly ReportSummary[]
  readonly brokers: readonly Broker[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly asOf?: string
}

/**
 * Deterministic conflict-closure builder. Pure function: given the same
 * inputs it always returns the same output. No randomness, no LLM calls,
 * no hidden heuristics. Every rule lives in this file or in classifiers.ts;
 * plain-English documentation is in docs/closure-logic.md.
 */
export function buildConflictClosure(inputs: ConflictClosureInputs): ConflictClosure {
  const { ticker, opinions, summaries, brokers } = inputs
  const asOf = inputs.asOf ?? new Date().toISOString()

  const stanceDistribution = stanceDist(opinions)
  const ratingDistribution = ratingDist(opinions)
  const targets = opinions.map((o) => o.targetPrice).filter((x): x is number => x !== null)
  const targetStats = computeTargetStats(targets)

  const { consensus, disagreements } = analyzeDimensions(opinions, summaries, targetStats)
  const outliers = detectOutliers(opinions, targetStats, stanceDistribution, ratingDistribution)
  const state = computeResultantState(opinions, stanceDistribution, outliers)
  const strength = computeStrengthBand(opinions.length, stanceDistribution)
  const confidence = computeConfidence(opinions.length, stanceDistribution, targetStats.spreadPct)
  const narrative = buildNarrative(state, stanceDistribution, targetStats, outliers, brokers)
  const keyDrivers = extractKeyDrivers(consensus)
  const openQuestions = extractOpenQuestions(disagreements)

  return {
    ticker,
    asOf,
    brokerCount: opinions.length,
    brokerIds: opinions.map((o) => o.brokerId),
    lastReportIds: opinions.map((o) => o.lastReportId),
    stanceDistribution,
    ratingDistribution,
    targetStats,
    consensus,
    disagreements,
    outliers,
    resultant: { ticker, state, strength, narrative, keyDrivers, openQuestions, asOf },
    confidence,
  }
}

// ─── Distribution helpers ─────────────────────────────────────────────

function stanceDist(opinions: readonly BrokerStockOpinion[]): Record<Stance, number> {
  const out: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 }
  for (const o of opinions) out[o.stance] += 1
  return out
}

function ratingDist(opinions: readonly BrokerStockOpinion[]): Partial<Record<Rating, number>> {
  const out: Partial<Record<Rating, number>> = {}
  for (const o of opinions) {
    if (o.rating) out[o.rating] = (out[o.rating] ?? 0) + 1
  }
  return out
}

// ─── Dimensional analysis ─────────────────────────────────────────────
// For each canonical dimension we collect signals (broker, polarity,
// supporting text, evidence) from opinion + summary data. If all signals
// share one polarity it's a ConsensusPoint; if both bullish AND bearish
// signals are present it's a DisagreementPoint.

interface DimensionalSignal {
  readonly dimension: DisagreementDimension
  readonly brokerId: BrokerId
  readonly polarity: Stance
  readonly claim: string
  readonly evidenceIds: readonly EvidenceId[]
}

function analyzeDimensions(
  opinions: readonly BrokerStockOpinion[],
  summaries: readonly ReportSummary[],
  targetStats: TargetStats,
): { consensus: ConsensusPoint[]; disagreements: DisagreementPoint[] } {
  const summaryByReport = new Map(summaries.map((s) => [s.reportId as string, s]))
  const signals: DimensionalSignal[] = []

  for (const op of opinions) {
    const sum = summaryByReport.get(op.lastReportId as string)
    if (!sum) continue

    // Stance is its own dimension — the polarity IS the stance.
    signals.push({
      dimension: 'stance',
      brokerId: op.brokerId,
      polarity: op.stance,
      claim: sum.thesis,
      evidenceIds: sum.evidenceIds.slice(0, 1),
    })

    // Rating dimension — polarity derived from the stance the rating
    // implies (the opinion's own stance field).
    if (op.rating) {
      signals.push({
        dimension: 'rating',
        brokerId: op.brokerId,
        polarity: op.stance,
        claim: op.rating,
        evidenceIds: [],
      })
    }

    // Theme-derived signals. Each summary.themes entry that matches a
    // keyword rule emits a signal whose polarity is the summary's stance.
    for (const theme of sum.themes) {
      const dim = classifyTheme(theme)
      if (!dim) continue
      signals.push({
        dimension: dim,
        brokerId: op.brokerId,
        polarity: sum.stance,
        claim: theme,
        evidenceIds: sum.evidenceIds,
      })
    }

    // Key points can also be classified. They carry richer context, but
    // we limit to those that match a dimension keyword.
    for (let i = 0; i < sum.keyPoints.length; i++) {
      const kp = sum.keyPoints[i]!
      const dim = classifyTheme(kp)
      if (!dim) continue
      signals.push({
        dimension: dim,
        brokerId: op.brokerId,
        polarity: sum.stance,
        claim: kp,
        evidenceIds: sum.evidenceIds,
      })
    }
  }

  // Aggregate by dimension.
  const byDim = new Map<DisagreementDimension, DimensionalSignal[]>()
  for (const sig of signals) {
    const bucket = byDim.get(sig.dimension)
    if (bucket) bucket.push(sig)
    else byDim.set(sig.dimension, [sig])
  }

  const consensus: ConsensusPoint[] = []
  const disagreements: DisagreementPoint[] = []

  for (const [dim, sigs] of byDim) {
    if (dim === 'target_price') continue // handled separately below using numbers
    const bulls = sigs.filter((s) => s.polarity === 'bullish')
    const bears = sigs.filter((s) => s.polarity === 'bearish')
    const neutrals = sigs.filter((s) => s.polarity === 'neutral')

    const hasBull = bulls.length > 0
    const hasBear = bears.length > 0

    if (hasBull && hasBear) {
      disagreements.push({
        dimension: dim,
        topic: topicForDimension(dim),
        bullClaims: unique(bulls.map((s) => s.claim)),
        bearClaims: unique(bears.map((s) => s.claim)),
        bullBrokerIds: unique(bulls.map((s) => s.brokerId)),
        bearBrokerIds: unique(bears.map((s) => s.brokerId)),
        bullEvidenceIds: unique(bulls.flatMap((s) => s.evidenceIds)),
        bearEvidenceIds: unique(bears.flatMap((s) => s.evidenceIds)),
      })
    } else if (hasBull && !hasBear) {
      consensus.push({
        dimension: dim,
        topic: topicForDimension(dim),
        claim: consensusClaim(dim, 'bullish', bulls.length + neutrals.length),
        polarity: 'bullish',
        supportingBrokerIds: unique([...bulls, ...neutrals].map((s) => s.brokerId)),
        supportingClaims: unique(bulls.map((s) => s.claim)),
        evidenceIds: unique([...bulls, ...neutrals].flatMap((s) => s.evidenceIds)),
      })
    } else if (!hasBull && hasBear) {
      consensus.push({
        dimension: dim,
        topic: topicForDimension(dim),
        claim: consensusClaim(dim, 'bearish', bears.length + neutrals.length),
        polarity: 'bearish',
        supportingBrokerIds: unique([...bears, ...neutrals].map((s) => s.brokerId)),
        supportingClaims: unique(bears.map((s) => s.claim)),
        evidenceIds: unique([...bears, ...neutrals].flatMap((s) => s.evidenceIds)),
      })
    }
    // all-neutral → no signal emitted
  }

  // Target-price dimension: numeric, decided by spread thresholds.
  if (targetStats.spreadPct !== null && targetStats.count >= 2) {
    if (targetStats.spreadPct < TARGET_CONSENSUS_SPREAD_PCT) {
      consensus.push({
        dimension: 'target_price',
        topic: topicForDimension('target_price'),
        claim: `Targets cluster within ${targetStats.spreadPct.toFixed(0)}% spread (tight)`,
        polarity: 'neutral',
        supportingBrokerIds: opinions.map((o) => o.brokerId),
        supportingClaims: [],
        evidenceIds: [],
      })
    } else if (targetStats.spreadPct >= TARGET_DISAGREEMENT_PCT) {
      const bulls = opinions.filter((o) => o.stance === 'bullish')
      const bears = opinions.filter((o) => o.stance === 'bearish')
      disagreements.push({
        dimension: 'target_price',
        topic: topicForDimension('target_price'),
        bullClaims: bulls.map((o) => `Target ${o.targetPrice?.toLocaleString()}`),
        bearClaims: bears.map((o) => `Target ${o.targetPrice?.toLocaleString()}`),
        bullBrokerIds: bulls.map((o) => o.brokerId),
        bearBrokerIds: bears.map((o) => o.brokerId),
        bullEvidenceIds: [],
        bearEvidenceIds: [],
      })
    }
  }

  return { consensus, disagreements }
}

function consensusClaim(dim: DisagreementDimension, polarity: Stance, brokerCount: number): string {
  const verb = polarity === 'bullish' ? 'constructive on' : polarity === 'bearish' ? 'cautious on' : 'aligned on'
  return `${brokerCount} broker${brokerCount === 1 ? '' : 's'} ${verb} ${topicForDimension(dim).toLowerCase()}`
}

// ─── Outlier detection ────────────────────────────────────────────────

function detectOutliers(
  opinions: readonly BrokerStockOpinion[],
  targetStats: TargetStats,
  stanceDistribution: Record<Stance, number>,
  ratingDistribution: Partial<Record<Rating, number>>,
): OutlierClassification[] {
  const total = opinions.length
  if (total === 0) return []

  const results: OutlierClassification[] = []

  // Dominant stance (if any) for stance-contrary detection.
  let dominantStance: Stance | null = null
  let dominantStanceCount = 0
  ;(['bullish', 'neutral', 'bearish'] as const).forEach((s) => {
    if (stanceDistribution[s] > dominantStanceCount) {
      dominantStance = s
      dominantStanceCount = stanceDistribution[s]
    }
  })
  const dominantStanceRate = dominantStanceCount / total

  // Dominant rating bucket (Buy/Overweight count as "positive", Sell/
  // Underweight as "negative") for rating-contrary detection.
  const bullyRatings: Rating[] = ['Buy', 'Overweight']
  const bearyRatings: Rating[] = ['Sell', 'Underweight']
  const bullyRatingCount = bullyRatings.reduce((n, r) => n + (ratingDistribution[r] ?? 0), 0)
  const bearyRatingCount = bearyRatings.reduce((n, r) => n + (ratingDistribution[r] ?? 0), 0)
  const bullyRate = bullyRatingCount / total
  const bearyRate = bearyRatingCount / total

  for (const op of opinions) {
    const reasons: OutlierReason[] = []

    // Target z-score — only meaningful with ≥3 brokers and positive stdev.
    let targetZ: number | null = null
    if (total >= 3 && targetStats.stdev !== null && targetStats.stdev > 0 && op.targetPrice !== null && targetStats.mean !== null) {
      targetZ = (op.targetPrice - targetStats.mean) / targetStats.stdev
      if (Math.abs(targetZ) > OUTLIER_Z_THRESHOLD) reasons.push('target_price_z')
    }

    // Stance contrary — at least 66% of the group aligned on a stance,
    // and this broker's stance contradicts it.
    if (
      dominantStance !== null
      && dominantStanceRate >= STANCE_MAJORITY_PCT
      && op.stance !== dominantStance
      && op.stance !== 'neutral'
    ) {
      reasons.push('stance_contrary')
    }

    // Rating contrary — broker is a bear in a group that is ≥66% Buy/
    // Overweight, or vice versa.
    if (op.rating !== null) {
      if (bullyRate >= RATING_MAJORITY_PCT && bearyRatings.includes(op.rating)) {
        reasons.push('rating_contrary')
      } else if (bearyRate >= RATING_MAJORITY_PCT && bullyRatings.includes(op.rating)) {
        reasons.push('rating_contrary')
      }
    }

    if (reasons.length === 0) continue

    const direction: 'bullish' | 'bearish' = op.stance === 'bullish'
      ? 'bullish'
      : op.stance === 'bearish'
        ? 'bearish'
        : (targetZ !== null && targetZ > 0 ? 'bullish' : 'bearish')

    results.push({
      brokerId: op.brokerId,
      reasons,
      primaryReason: reasons[0]!,
      direction,
      targetZScore: targetZ,
      notes: buildOutlierNotes(reasons, targetZ, op),
    })
  }

  return results
}

function buildOutlierNotes(
  reasons: readonly OutlierReason[],
  targetZ: number | null,
  op: BrokerStockOpinion,
): string {
  const parts: string[] = []
  if (reasons.includes('target_price_z') && targetZ !== null) {
    parts.push(`target ${targetZ > 0 ? '+' : ''}${targetZ.toFixed(2)}σ from mean`)
  }
  if (reasons.includes('stance_contrary')) {
    parts.push(`${op.stance} against a ≥66% opposing-stance majority`)
  }
  if (reasons.includes('rating_contrary')) {
    parts.push(`rated ${op.rating} against a ≥66% opposing-rating group`)
  }
  return parts.join('; ')
}

// ─── Resultant state ──────────────────────────────────────────────────

function computeResultantState(
  opinions: readonly BrokerStockOpinion[],
  stanceDistribution: Record<Stance, number>,
  outliers: readonly OutlierClassification[],
): ResultantState {
  const total = opinions.length
  if (total === 0) return 'unresolved'
  const { bullish, neutral, bearish } = stanceDistribution

  // Hard consensus — ≥75% of a side OR the whole group minus neutrals
  // leans the same way.
  if (bullish / total >= STANCE_CONSENSUS_PCT) return 'consensus_bullish'
  if (bearish / total >= STANCE_CONSENSUS_PCT) return 'consensus_bearish'
  if (bullish >= 2 && bearish === 0) return 'consensus_bullish'
  if (bearish >= 2 && bullish === 0) return 'consensus_bearish'

  // Outlier-driven: if removing outliers makes the remaining group
  // unanimous on direction, label the state that way.
  const outlierIds = new Set(outliers.map((o) => o.brokerId as string))
  if (outliers.length > 0 && total - outliers.length >= 2) {
    const rest = opinions.filter((o) => !outlierIds.has(o.brokerId as string))
    const restStances = new Set(rest.map((o) => o.stance))
    const nonNeutral = [...restStances].filter((s) => s !== 'neutral')
    if (nonNeutral.length === 1) return 'outlier_driven'
  }

  if (bullish > bearish) return 'mixed_constructive'
  if (bearish > bullish) return 'mixed_cautious'
  if (bullish === bearish && bullish === 0 && neutral > 0) return 'unresolved'
  return 'unresolved'
}

// ─── Strength band ────────────────────────────────────────────────────

function computeStrengthBand(
  brokerCount: number,
  stanceDistribution: Record<Stance, number>,
): StrengthBand {
  if (brokerCount === 0) return 'weak'
  const dominant = Math.max(stanceDistribution.bullish, stanceDistribution.neutral, stanceDistribution.bearish)
  const rate = dominant / brokerCount
  if (brokerCount >= 3 && rate >= STANCE_CONSENSUS_PCT) return 'strong'
  if (brokerCount >= 2 && rate >= 0.6) return 'moderate'
  return 'weak'
}

// ─── Confidence ───────────────────────────────────────────────────────

function computeConfidence(
  brokerCount: number,
  stanceDistribution: Record<Stance, number>,
  spreadPct: number | null,
): ConfidenceDetail {
  if (brokerCount === 0) {
    return { score: 0, band: 'weak', rationale: ['No broker coverage'] }
  }
  const dominant = Math.max(stanceDistribution.bullish, stanceDistribution.neutral, stanceDistribution.bearish)
  const stanceSkew = dominant / brokerCount
  const brokerCountFactor = Math.min(brokerCount / 5, 1)
  const spreadFactor = spreadPct === null ? 0.5 : clamp(1 - spreadPct / 60, 0, 1)

  const score = 0.4 * stanceSkew + 0.3 * brokerCountFactor + 0.3 * spreadFactor
  const band: StrengthBand = score >= CONFIDENCE_STRONG ? 'strong' : score >= CONFIDENCE_MODERATE ? 'moderate' : 'weak'

  const rationale: string[] = [
    `Stance concordance: ${(stanceSkew * 100).toFixed(0)}% of ${brokerCount} broker${brokerCount === 1 ? '' : 's'} aligned`,
    `Coverage depth: ${brokerCount} broker${brokerCount === 1 ? '' : 's'} (factor ${brokerCountFactor.toFixed(2)})`,
    spreadPct !== null
      ? `Target dispersion: ${spreadPct.toFixed(0)}% spread (factor ${spreadFactor.toFixed(2)})`
      : `Target dispersion: not applicable with ${brokerCount === 1 ? 'single data point' : 'no targets'}`,
  ]

  return { score, band, rationale }
}

// ─── Narrative ────────────────────────────────────────────────────────

function buildNarrative(
  state: ResultantState,
  stanceDistribution: Record<Stance, number>,
  targetStats: TargetStats,
  outliers: readonly OutlierClassification[],
  brokers: readonly Broker[],
): string {
  const brokerName = (id: BrokerId) =>
    brokers.find((b) => b.id === id)?.shortName ?? (id as unknown as string).toUpperCase()
  const total = stanceDistribution.bullish + stanceDistribution.neutral + stanceDistribution.bearish
  const spread = targetStats.spreadPct !== null ? `${targetStats.spreadPct.toFixed(0)}% spread` : 'insufficient targets for spread'
  const median = targetStats.median !== null ? `median ${targetStats.median.toLocaleString()}` : 'no median target'

  switch (state) {
    case 'consensus_bullish':
      return `Consensus Buy across ${total} covering broker${total === 1 ? '' : 's'} (${median}; ${spread}).`
    case 'consensus_bearish':
      return `Consensus caution across ${total} covering broker${total === 1 ? '' : 's'} (${median}; ${spread}).`
    case 'mixed_constructive':
      return `Mixed with constructive tilt: ${stanceDistribution.bullish} bull vs ${stanceDistribution.bearish} bear (${stanceDistribution.neutral} neutral); ${spread}.`
    case 'mixed_cautious':
      return `Mixed with cautious tilt: ${stanceDistribution.bearish} bear vs ${stanceDistribution.bullish} bull (${stanceDistribution.neutral} neutral); ${spread}.`
    case 'outlier_driven': {
      const names = outliers.map((o) => brokerName(o.brokerId)).join(', ')
      const dir = outliers[0]?.direction ?? 'bearish'
      return `Street aligned ex-${names}; ${names} ${dir} vs the rest (${spread}).`
    }
    case 'unresolved':
      return `Unresolved: ${stanceDistribution.bullish} bull / ${stanceDistribution.neutral} neutral / ${stanceDistribution.bearish} bear (${spread}).`
  }
}

// ─── Key drivers + open questions ─────────────────────────────────────

function extractKeyDrivers(consensus: readonly ConsensusPoint[]): string[] {
  return consensus
    .filter((c) => c.dimension !== 'stance' && c.dimension !== 'rating')
    .flatMap((c) => c.supportingClaims.slice(0, 2).map((s) => `[${topicForDimension(c.dimension)}] ${s}`))
    .slice(0, 5)
}

function extractOpenQuestions(disagreements: readonly DisagreementPoint[]): string[] {
  return disagreements
    .filter((d) => d.dimension !== 'stance' && d.dimension !== 'rating')
    .map((d) => {
      const bull = d.bullClaims[0] ?? 'bull view'
      const bear = d.bearClaims[0] ?? 'bear view'
      return `${d.topic}: ${bull}  vs.  ${bear}`
    })
    .slice(0, 5)
}
