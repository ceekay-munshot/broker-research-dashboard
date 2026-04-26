// ─────────────────────────────────────────────────────────────────────────
// Calibration-aware ranking engine (Module 23).
//
// Pure transform. Same inputs → same adjustment. No I/O, no clock. The
// engine consumes:
//   - the existing baseline score (from each surface's own ranker)
//   - per-broker calibration (Module 20)
//   - per-alert-kind effectiveness (Module 20)
//   - per-catalyst-type performance (Module 22 calibration feedback)
//   - per-broker post-event correctness (Module 22)
//
// And produces a `RankAdjustment` with:
//   - baselineScore + adjustedScore + delta + applied flag
//   - reason chips ("Broker calibration +6 (medium, n=18)")
//   - per-source contribution + suppression notes
//
// Bounded by design: each source is capped, the global delta is capped,
// and adjustments below `medium` confidence are suppressed entirely.
//
// The engine never mutates the inputs. Callers decide whether to apply
// `adjustedScore` based on the feature flag (see adaptiveRankingFlags.ts).
// ─────────────────────────────────────────────────────────────────────────

import type {
  AlertEffectivenessSummary, BrokerCalibrationSummary,
  CalibrationSnapshot, ConfidenceBand,
  AlertTriggerKind, BrokerId, CatalystType, PostEventReview,
} from '../domain'

// ── Caps + thresholds ────────────────────────────────────────────────────

/** Max nudge from any single source. */
const CAPS = {
  brokerCalibration: 10,
  alertKindEffectiveness: 8,
  catalystTypePerformance: 5,
  postEventBrokerCorrectness: 5,
} as const

/** Hard cap on the global delta — no item can move more than ±15 vs baseline. */
const GLOBAL_CAP = 15

/** Confidence bands at-or-above which a calibration source contributes. */
const MIN_CONFIDENCE_RANK: Record<ConfidenceBand, number> = {
  very_low: 0, low: 1, medium: 2, high: 3,
}
const MIN_BROKER_BAND: ConfidenceBand = 'medium'
const MIN_ALERT_BAND: ConfidenceBand = 'medium'

// ── Reasons + adjustment shape ───────────────────────────────────────────

export type AdjustmentSource =
  | 'broker_calibration'
  | 'alert_kind_effectiveness'
  | 'catalyst_type_performance'
  | 'post_event_broker_correctness'

export interface AdjustmentReason {
  readonly source: AdjustmentSource
  readonly text: string
  /** Signed contribution before the global cap. */
  readonly delta: number
  /** True when the contribution was clipped to its source cap. */
  readonly clamped: boolean
}

export interface SuppressionReason {
  readonly source: AdjustmentSource
  readonly text: string
}

export interface RankAdjustment {
  readonly baselineScore: number
  /** Sum of contributions, then clipped to ±GLOBAL_CAP. */
  readonly adjustedScore: number
  readonly delta: number
  /** True when at least one contribution made it into the adjustment. */
  readonly applied: boolean
  readonly reasons: readonly AdjustmentReason[]
  readonly suppressed: readonly SuppressionReason[]
}

/** Convenience: a fully zero adjustment for surfaces that opt out or
 *  for items where no signal applies. */
export const NO_ADJUSTMENT = (baselineScore: number): RankAdjustment => ({
  baselineScore,
  adjustedScore: baselineScore,
  delta: 0,
  applied: false,
  reasons: [],
  suppressed: [],
})

// ── Per-source contribution functions ────────────────────────────────────
//
// Each function is "pure" and returns either a positive AdjustmentReason
// or a SuppressionReason explaining why nothing contributed.

interface BrokerSourceInputs {
  readonly brokerId: BrokerId | null
  readonly calibration: CalibrationSnapshot | null
}

function brokerCalibrationContribution(input: BrokerSourceInputs): AdjustmentReason | SuppressionReason | null {
  if (!input.brokerId) return null
  if (!input.calibration) return null
  const summary: BrokerCalibrationSummary | undefined =
    input.calibration.brokerCalibrations.find((b) => b.brokerId === input.brokerId)
  if (!summary || summary.sampleSize === 0) return null
  if (MIN_CONFIDENCE_RANK[summary.confidence] < MIN_CONFIDENCE_RANK[MIN_BROKER_BAND]) {
    return {
      source: 'broker_calibration',
      text: `Broker calibration suppressed (${summary.confidence}, n=${summary.sampleSize})`,
    }
  }
  // Map score in [-100, 100] to delta in [-CAP, +CAP] linearly.
  const raw = (summary.score / 100) * CAPS.brokerCalibration
  const clamped = Math.abs(raw) > CAPS.brokerCalibration
  const delta = clamp(raw, -CAPS.brokerCalibration, CAPS.brokerCalibration)
  if (Math.round(delta * 10) / 10 === 0) return null
  const sign = delta >= 0 ? '+' : ''
  return {
    source: 'broker_calibration',
    text: `Broker calibration ${sign}${delta.toFixed(1)} (${summary.confidence}, n=${summary.sampleSize})`,
    delta,
    clamped,
  }
}

interface AlertKindSourceInputs {
  readonly alertKind: AlertTriggerKind | null
  readonly calibration: CalibrationSnapshot | null
}

function alertKindContribution(input: AlertKindSourceInputs): AdjustmentReason | SuppressionReason | null {
  if (!input.alertKind) return null
  if (!input.calibration) return null
  const summary: AlertEffectivenessSummary | undefined =
    input.calibration.alertEffectiveness.find((a) => a.kind === input.alertKind)
  if (!summary || summary.sampleSize === 0) return null
  if (MIN_CONFIDENCE_RANK[summary.confidence] < MIN_CONFIDENCE_RANK[MIN_ALERT_BAND]) {
    return {
      source: 'alert_kind_effectiveness',
      text: `Alert-kind effectiveness suppressed (${summary.confidence}, n=${summary.sampleSize})`,
    }
  }
  const raw = (summary.score / 100) * CAPS.alertKindEffectiveness
  const clamped = Math.abs(raw) > CAPS.alertKindEffectiveness
  const delta = clamp(raw, -CAPS.alertKindEffectiveness, CAPS.alertKindEffectiveness)
  if (Math.round(delta * 10) / 10 === 0) return null
  const sign = delta >= 0 ? '+' : ''
  return {
    source: 'alert_kind_effectiveness',
    text: `Alert-kind effectiveness ${sign}${delta.toFixed(1)} (${summary.confidence}, n=${summary.sampleSize})`,
    delta,
    clamped,
  }
}

interface CatalystTypeSourceInputs {
  readonly catalystType: CatalystType | null
  readonly postEventReviews: readonly PostEventReview[] | null
  readonly brokerId: BrokerId | null
}

function catalystTypeContribution(input: CatalystTypeSourceInputs): AdjustmentReason | SuppressionReason | null {
  if (!input.catalystType) return null
  if (!input.postEventReviews || input.postEventReviews.length === 0) return null
  // Aggregate across post-event reviews of this catalyst type.
  let right = 0
  let wrong = 0
  let inconclusive = 0
  for (const r of input.postEventReviews) {
    if (r.calibrationFeedback.catalystTypePerformance.type !== input.catalystType) continue
    right += r.calibrationFeedback.catalystTypePerformance.directionallyRight
    wrong += r.calibrationFeedback.catalystTypePerformance.directionallyWrong
    inconclusive += r.calibrationFeedback.catalystTypePerformance.inconclusive
  }
  const total = right + wrong
  if (total < 4) {
    return {
      source: 'catalyst_type_performance',
      text: `Catalyst-type performance suppressed (n=${total} on ${input.catalystType})`,
    }
  }
  const hitRate = right / total
  // Map hit-rate vs 50% to ±CAP linearly, scaled by sample-size discount.
  const sampleFactor = Math.min(1, total / 12)
  const raw = (hitRate - 0.5) * 2 * CAPS.catalystTypePerformance * sampleFactor
  const clamped = Math.abs(raw) > CAPS.catalystTypePerformance
  const delta = clamp(raw, -CAPS.catalystTypePerformance, CAPS.catalystTypePerformance)
  if (Math.round(delta * 10) / 10 === 0) return null
  const sign = delta >= 0 ? '+' : ''
  // Optional broker dimension is left for the post-event-broker source.
  void input.brokerId
  void inconclusive
  return {
    source: 'catalyst_type_performance',
    text: `Catalyst-type performance ${sign}${delta.toFixed(1)} (${(hitRate * 100).toFixed(0)}% on n=${total} ${input.catalystType.replace(/_/g, ' ')})`,
    delta,
    clamped,
  }
}

interface PostEventBrokerSourceInputs {
  readonly brokerId: BrokerId | null
  readonly postEventReviews: readonly PostEventReview[] | null
  /** When set, only reviews of this catalyst type contribute. */
  readonly catalystType?: CatalystType | null
}

function postEventBrokerContribution(input: PostEventBrokerSourceInputs): AdjustmentReason | SuppressionReason | null {
  if (!input.brokerId) return null
  if (!input.postEventReviews || input.postEventReviews.length === 0) return null
  let right = 0
  let wrong = 0
  for (const r of input.postEventReviews) {
    if (input.catalystType && r.calibrationFeedback.catalystTypePerformance.type !== input.catalystType) continue
    for (const c of r.calibrationFeedback.brokerCorrectness) {
      if (c.brokerId !== input.brokerId) continue
      right += c.correct
      wrong += c.wrong
    }
  }
  const n = right + wrong
  if (n < 3) {
    return {
      source: 'post_event_broker_correctness',
      text: `Post-event broker correctness suppressed (n=${n})`,
    }
  }
  const hitRate = right / n
  const sampleFactor = Math.min(1, n / 8)
  const raw = (hitRate - 0.5) * 2 * CAPS.postEventBrokerCorrectness * sampleFactor
  const clamped = Math.abs(raw) > CAPS.postEventBrokerCorrectness
  const delta = clamp(raw, -CAPS.postEventBrokerCorrectness, CAPS.postEventBrokerCorrectness)
  if (Math.round(delta * 10) / 10 === 0) return null
  const sign = delta >= 0 ? '+' : ''
  return {
    source: 'post_event_broker_correctness',
    text: `Event-driven broker correctness ${sign}${delta.toFixed(1)} (${right}/${n} right${input.catalystType ? ` on ${input.catalystType.replace(/_/g, ' ')}` : ''})`,
    delta,
    clamped,
  }
}

// ── Top-level builder ────────────────────────────────────────────────────

export interface AdjustmentInputs {
  readonly baselineScore: number
  readonly brokerId: BrokerId | null
  readonly alertKind: AlertTriggerKind | null
  readonly catalystType: CatalystType | null
  readonly calibration: CalibrationSnapshot | null
  readonly postEventReviews: readonly PostEventReview[] | null
}

/**
 * Compute the adjustment for one item. Pure. Returns a fully populated
 * `RankAdjustment` even when nothing contributed (delta=0, applied=false).
 */
export function computeRankAdjustment(input: AdjustmentInputs): RankAdjustment {
  const reasons: AdjustmentReason[] = []
  const suppressed: SuppressionReason[] = []
  let totalDelta = 0

  const sources = [
    brokerCalibrationContribution({ brokerId: input.brokerId, calibration: input.calibration }),
    alertKindContribution({ alertKind: input.alertKind, calibration: input.calibration }),
    catalystTypeContribution({
      catalystType: input.catalystType,
      postEventReviews: input.postEventReviews,
      brokerId: input.brokerId,
    }),
    postEventBrokerContribution({
      brokerId: input.brokerId,
      postEventReviews: input.postEventReviews,
      catalystType: input.catalystType,
    }),
  ]

  for (const c of sources) {
    if (!c) continue
    if (isAdjustmentReason(c)) {
      reasons.push(c)
      totalDelta += c.delta
    } else {
      suppressed.push(c)
    }
  }

  // Hard global cap: regardless of how many sources contributed, the
  // total adjustment can never move the score by more than ±GLOBAL_CAP.
  const finalDelta = clamp(totalDelta, -GLOBAL_CAP, GLOBAL_CAP)
  if (Math.abs(totalDelta) > GLOBAL_CAP) {
    suppressed.push({
      source: 'broker_calibration',
      text: `Global cap applied — sum ${totalDelta.toFixed(1)} clamped to ${finalDelta >= 0 ? '+' : ''}${finalDelta.toFixed(1)}.`,
    })
  }

  return {
    baselineScore: input.baselineScore,
    adjustedScore: round2(input.baselineScore + finalDelta),
    delta: round2(finalDelta),
    applied: reasons.length > 0 && Math.abs(finalDelta) > 0,
    reasons,
    suppressed,
  }
}

/** Compare-mode helper: given two ordered lists of ids, return the rank
 *  delta for each id. Used by surfaces to render `rank ▲2`. */
export function rankDeltasById<TId extends string>(args: {
  readonly baseline: readonly TId[]
  readonly adjusted: readonly TId[]
}): ReadonlyMap<TId, number> {
  const baselineIdx = new Map<TId, number>()
  args.baseline.forEach((id, i) => baselineIdx.set(id, i))
  const adjustedIdx = new Map<TId, number>()
  args.adjusted.forEach((id, i) => adjustedIdx.set(id, i))
  const out = new Map<TId, number>()
  for (const [id, b] of baselineIdx) {
    const a = adjustedIdx.get(id)
    if (a === undefined) continue
    // positive = item moved UP (lower index = higher rank).
    out.set(id, b - a)
  }
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isAdjustmentReason(c: AdjustmentReason | SuppressionReason): c is AdjustmentReason {
  return typeof (c as AdjustmentReason).delta === 'number'
}
