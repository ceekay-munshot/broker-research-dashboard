// ─────────────────────────────────────────────────────────────────────────
// arb.ts — the per-stock "ARB" (broker-disagreement) verdict.
//
// Pure derivations over a ConflictClosure: the ARB band (how much the Street
// disagrees), the consensus rating, and which broker holds the high/low
// target. Shared by the By Stock matrix and the Street-view drawer so the two
// surfaces can never drift.
//
// "ARB" is presented as a BAND — Low / Moderate / High, plus "No broker
// comparison" for single-broker names — never a fabricated 0–100 score.
// ─────────────────────────────────────────────────────────────────────────

import type { Rating, BrokerId } from '../domain'
import type { ConflictClosure, ResultantState } from '../engine/types'
import { TONE_CHIP_CLASS, getArbTone } from '../lib/semanticColor'

// ── ARB band ─────────────────────────────────────────────────────────────

/** `none` = a single broker — nothing to compare, never a disagreement. */
export type ArbBand = 'none' | 'low' | 'moderate' | 'high'

export interface ArbVerdict {
  readonly band: ArbBand
  /** Raw target-price spread — supporting detail only, never the headline. */
  readonly spreadPct: number | null
  /** The finished human line shown under the band chip. */
  readonly subtext: string
}

export const ARB_LABEL: Readonly<Record<ArbBand, string>> = {
  none:     'No broker comparison',
  low:      'Low ARB',
  moderate: 'Moderate ARB',
  high:     'High ARB',
}

// Chip classes per ARB band, projected from the central semantic-tone system.
// Low disagreement is reassuring (green), high is a risk (red), a moderate gap
// is a caution (amber), and a single-broker name has nothing to compare (grey).
export const ARB_COLOR: Readonly<Record<ArbBand, string>> = {
  none:     TONE_CHIP_CLASS[getArbTone('none')],
  low:      TONE_CHIP_CLASS[getArbTone('low')],
  moderate: TONE_CHIP_CLASS[getArbTone('moderate')],
  high:     TONE_CHIP_CLASS[getArbTone('high')],
}

/** Sort weight — High first; single-broker / no-comparison always last. */
export const ARB_RANK: Readonly<Record<ArbBand, number>> = {
  high: 0, moderate: 1, low: 2, none: 3,
}

/** Verbatim, customer-approved tooltip. */
export const ARB_TOOLTIP =
  'This combines broker rating disagreement and target-price spread. ' +
  'It is a directional ARB signal, not a precise score.'

/** Short, plain state label for the verdict subtext. */
const STATE_LABEL: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:  'Bullish consensus',
  consensus_bearish:  'Bearish consensus',
  mixed_constructive: 'Mixed views',
  mixed_cautious:     'Mixed views',
  unresolved:         'No clear lean',
  outlier_driven:     'Outlier-driven',
}

/** Engine's own material-spread threshold (mirrors conflictClosure.ts). */
const MATERIAL_SPREAD_PCT = 25
/** Engine's own tight-consensus threshold. */
const TIGHT_SPREAD_PCT = 15

/**
 * The ARB verdict for one stock. Guards run first:
 *   • a single broker → `none` (nothing to compare),
 *   • multiple brokers but no closure yet → `moderate` at most,
 * then a real closure is banded by state + target spread. High ARB is reached
 * only on genuine evidence — an outlier-driven state, mixed broker views, or a
 * material (≥25%) target spread. `unresolved` is never auto-High.
 */
export function deriveArbVerdict(
  closure: ConflictClosure | null,
  brokerCount: number,
): ArbVerdict {
  if (brokerCount <= 1) {
    return { band: 'none', spreadPct: null, subtext: 'Only 1 broker view available' }
  }
  if (!closure) {
    return { band: 'moderate', spreadPct: null, subtext: 'Comparison incomplete' }
  }

  const state = closure.resultant.state
  const spreadPct = closure.targetStats.spreadPct
  const materialSpread = spreadPct !== null && spreadPct >= MATERIAL_SPREAD_PCT
  const tightSpread = spreadPct === null || spreadPct < TIGHT_SPREAD_PCT
  const isConsensus = state === 'consensus_bullish' || state === 'consensus_bearish'
  const isMixed = state === 'mixed_constructive' || state === 'mixed_cautious'

  let band: ArbBand
  if (state === 'outlier_driven' || isMixed || materialSpread) {
    band = 'high'
  } else if (isConsensus && tightSpread) {
    band = 'low'
  } else {
    band = 'moderate' // unresolved, or a consensus state with a 15–25% spread
  }

  const spreadText = spreadPct !== null ? `${Math.round(spreadPct)}%` : '—'
  return { band, spreadPct, subtext: `Target spread: ${spreadText} · ${STATE_LABEL[state]}` }
}

// ── Consensus rating ─────────────────────────────────────────────────────

/** A tie is reported as a tie — never collapsed into a fake winner. */
export type ConsensusRating =
  | { readonly kind: 'none' }
  | { readonly kind: 'clear'; readonly rating: Rating; readonly agree: number; readonly total: number }
  | {
      readonly kind: 'tie'
      readonly total: number
      readonly leaders: readonly { readonly rating: Rating; readonly count: number }[]
    }

/** Fixed order — used only to list tied leaders stably, never to break a tie. */
const RATING_ORDER: readonly Rating[] = [
  'Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'Not Rated',
]

/**
 * The Street's consensus rating from `ratingDistribution`. Exactly one rating
 * at the top count → `clear`. Two or more tied at the top → `tie`, carrying
 * every tied leader — no winner is invented, because a fake consensus on a tie
 * would hide the disagreement this page exists to surface. No ratings → `none`.
 */
export function deriveConsensusRating(closure: ConflictClosure): ConsensusRating {
  const dist = closure.ratingDistribution
  const entries = RATING_ORDER
    .map((rating) => ({ rating, count: dist[rating] ?? 0 }))
    .filter((e) => e.count > 0)
  if (entries.length === 0) return { kind: 'none' }

  const total = entries.reduce((sum, e) => sum + e.count, 0)
  const maxCount = Math.max(...entries.map((e) => e.count))
  const leaders = entries.filter((e) => e.count === maxCount)

  if (leaders.length === 1) {
    return { kind: 'clear', rating: leaders[0]!.rating, agree: maxCount, total }
  }
  return { kind: 'tie', total, leaders }
}

// ── High / low target broker ─────────────────────────────────────────────

export interface TargetExtremes {
  /** Broker(s) holding the highest target — array handles ties. */
  readonly highIds: readonly BrokerId[]
  readonly lowIds: readonly BrokerId[]
  readonly highTarget: number | null
  readonly lowTarget: number | null
}

/**
 * Recover which broker(s) hold the high/low target. The closure stores only
 * the high/low *values*, so callers pass a broker→target map (brokers with no
 * target are simply absent). Ties return every matching broker id.
 */
export function targetExtremesFromMap(
  targetByBroker: ReadonlyMap<string, number>,
): TargetExtremes {
  const entries = [...targetByBroker.entries()]
  if (entries.length === 0) {
    return { highIds: [], lowIds: [], highTarget: null, lowTarget: null }
  }
  const targets = entries.map(([, t]) => t)
  const high = Math.max(...targets)
  const low = Math.min(...targets)
  return {
    highIds: entries.filter(([, t]) => t === high).map(([id]) => id as BrokerId),
    lowIds:  entries.filter(([, t]) => t === low).map(([id]) => id as BrokerId),
    highTarget: high,
    lowTarget: low,
  }
}
