// Hit Rate view-model types. Pure projections over the canonical
// CalibrationSnapshot — the same per-broker scorecards the (hidden) admin
// Calibration tab uses, reshaped into the plain, customer-facing "how often
// is this analyst right?" leaderboard.

import type { BrokerId, ConfidenceBand, Iso8601 } from '../../domain'

/** One analyst (research house) row in the Hit Rate leaderboard. */
export interface AnalystHitRateRow {
  readonly brokerId: BrokerId
  readonly shortName: string
  readonly color: string | null
  /** Overall hit rate as a 0..1 fraction; null when no directional calls. */
  readonly hitRate: number | null
  /** Number of scored calls behind the rate — the honesty gate. */
  readonly sampleSize: number
  readonly meanReturnPct: number
  readonly confidence: ConfidenceBand
  /** Hit rate on bullish (Buy/Overweight) calls, when there are enough. */
  readonly longHitRate: number | null
  /** Hit rate on bearish (Sell/Underweight) calls, when there are enough. */
  readonly shortHitRate: number | null
}

export interface HitRateLeaderboardViewModel {
  readonly hasData: boolean
  /** Analysts with a non-zero sample, best hit rate first. */
  readonly rows: readonly AnalystHitRateRow[]
  /** Plain-language note shown when there's no track record to show yet. */
  readonly emptyMessage: string | null
  readonly generatedAt: Iso8601 | null
}
