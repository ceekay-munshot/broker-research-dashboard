// Plain-English insight composition for the Disagreements tab. Pure,
// deterministic transforms — no LLM call, no server field. Every sentence
// is derived from structured signals already present in the view-models,
// so the tab ships without any dependency on the extraction server.

import type { DivergenceCardViewModel } from './divergence'
import type { BrokerCalibrationSummary, ConfidenceBand } from '../domain'
import { formatPrice } from './shared'

// ── Broker track-record tier ──────────────────────────────────────────
// A coarse bucket over the calibration score, used to annotate broker
// names inside a disagreement so the reader can see which side is backed
// by historically-accurate brokers. Thresholds mirror the score buckets
// already used by BrokerCalibrationCard (>=30 / >=10 / >=-10) so the tab
// stays internally consistent with the admin Calibration view.

export type BrokerTier = 'strong' | 'solid' | 'mixed' | 'weak' | 'unproven'

/** Below this many scored calls a broker's score is not yet meaningful. */
const MIN_SCORED_CALLS = 3

export function brokerTier(
  score: number,
  confidence: ConfidenceBand,
  sampleSize: number,
): BrokerTier {
  if (sampleSize < MIN_SCORED_CALLS || confidence === 'very_low') return 'unproven'
  if (score >= 30) return 'strong'
  if (score >= 10) return 'solid'
  if (score >= -10) return 'mixed'
  return 'weak'
}

export const TIER_LABEL: Readonly<Record<BrokerTier, string>> = {
  strong:   'Strong track record',
  solid:    'Solid track record',
  mixed:    'Mixed track record',
  weak:     'Weak track record — has tended to be wrong',
  unproven: 'Track record not yet established',
}

// ── Helpers ───────────────────────────────────────────────────────────

function priceOf(n: number | null, currency: string): string {
  return n === null ? '—' : formatPrice(n, currency, 0)
}

function roundPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`
}

/** The most substantive disagreement topic — theme dimensions ranked by
 *  citation volume. Stance / rating / target_price are excluded: those
 *  are surfaced through the verdict badge and the target-price scale. */
function dominantTopic(c: DivergenceCardViewModel) {
  return [...c.disagreements]
    .filter((d) =>
      d.dimension !== 'stance'
      && d.dimension !== 'rating'
      && d.dimension !== 'target_price')
    .sort((a, b) =>
      (b.bullCitationCount + b.bearCitationCount)
      - (a.bullCitationCount + a.bearCitationCount))[0] ?? null
}

// ── Company disagreement insight ──────────────────────────────────────

/**
 * One plain-English sentence explaining the crux of a disagreement.
 * Priority order: an outlier distorting an otherwise-aligned Street →
 * a wide valuation gap → a substantive topical split → a divided stance
 * → no decisive view → a near-consensus with one dissenter.
 */
export function composeDisagreementInsight(c: DivergenceCardViewModel): string {
  const { bullish, bearish } = c.stanceDistribution
  const total = c.brokerCount
  const targetCount = c.targetStats.count
  const spread = c.targetStats.spreadPct
  const ccy = c.currency
  const topic = dominantTopic(c)

  // 1 — An outlier broker is distorting an otherwise-aligned Street.
  if (c.resultant.state === 'outlier_driven' && c.outliers.length > 0) {
    const o = c.outliers[0]!
    const others = c.outliers.length - 1
    const who = others > 0
      ? `${o.brokerName} and ${others} other${others === 1 ? '' : 's'}`
      : o.brokerName
    return `Strip out ${who} and the Street largely agrees — that single ${o.direction} outlier is what stretches the target spread to ${roundPct(spread)}.`
  }

  // 2 — A wide valuation gap is the headline.
  if (spread !== null && spread >= 25) {
    const range = `${priceOf(c.targetStats.low, ccy)}–${priceOf(c.targetStats.high, ccy)}`
    if (c.resultant.state === 'consensus_bullish' || c.resultant.state === 'consensus_bearish') {
      const call = c.resultant.state === 'consensus_bullish' ? 'a buy' : 'a cautious call'
      return `Brokers agree it's ${call}, but not on what it's worth — the ${targetCount} published targets span ${range}, a ${roundPct(spread)} spread.`
    }
    if (topic) {
      return `Targets span ${range} — a ${roundPct(spread)} gap that traces back to a split on ${topic.topic.toLowerCase()}.`
    }
    return `No agreement on fair value — ${targetCount} broker targets span ${range}, a ${roundPct(spread)} spread.`
  }

  // 3 — A substantive topical split is the headline.
  if (topic) {
    const bn = topic.bullBrokers.length
    const rn = topic.bearBrokers.length
    return `Bulls and bears split on ${topic.topic.toLowerCase()} — ${bn} broker${bn === 1 ? '' : 's'} constructive, ${rn} cautious.`
  }

  // 4 — A divided stance with no single crux.
  if (c.resultant.state === 'mixed_constructive' || c.resultant.state === 'mixed_cautious') {
    return `The Street is divided — ${bullish} bullish against ${bearish} bearish across ${total} brokers, with no single point of contention.`
  }

  // 5 — No decisive view.
  if (c.resultant.state === 'unresolved') {
    return `No clear Street view yet — ${total} broker${total === 1 ? '' : 's'} covering, with no decisive lean.`
  }

  // 6 — A near-consensus stance, but coverage isn't unanimous.
  const call = c.resultant.state === 'consensus_bearish' ? 'cautious' : 'constructive'
  return `${total} brokers are broadly ${call}, but coverage isn't unanimous — at least one broker breaks from the pack.`
}

// ── Broker track-record insight ───────────────────────────────────────

/** One plain-English sentence summarising a broker's calibration record. */
export function composeBrokerInsight(b: BrokerCalibrationSummary): string {
  if (b.sampleSize < MIN_SCORED_CALLS) {
    return `Only ${b.sampleSize} scored call${b.sampleSize === 1 ? '' : 's'} so far — too little history to judge this broker yet.`
  }
  const hit = b.hitRate !== null ? `${Math.round(b.hitRate * 100)}% of directional calls landed` : null
  const mean = `${b.meanReturnPct >= 0 ? '+' : ''}${b.meanReturnPct.toFixed(1)}% mean return`
  const stats = hit ? `${hit}, ${mean} over ${b.sampleSize} events` : `${mean} over ${b.sampleSize} events`

  if (b.score >= 30) return `A reliable read — ${stats}. Worth weighting this broker's view.`
  if (b.score >= 10) return `A useful but uneven signal — ${stats}.`
  if (b.score >= -10) return `Roughly coin-flip historically — ${stats}. Treat its calls as noise.`
  return `A fade signal so far — calls have tended to be wrong (${stats}).`
}
