// ─────────────────────────────────────────────────────────────────────────
// Portfolio / watchlist domain (Module 18).
//
// A `PortfolioSnapshot` is the org's current book + watchlist as of `asOf`.
// Every field beyond the bare ticker + direction is optional so a partial
// upstream feed (or a CSV-only dev fixture) still produces a usable
// snapshot. The relevance + coverage engines tolerate missing fields and
// degrade their reasoning accordingly.
//
// This layer is read-only: the dashboard never mutates portfolio state.
// Future write actions (rebalances, trade tickets) belong on a separate
// PortfolioWriteAdapter so the read surface stays observable + cacheable.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, UserId, PortfolioId, StockTicker } from './ids'
import type { Iso8601 } from './common'

/** Position direction. `hedge` covers paired exposures (e.g. index hedge). */
export type PortfolioDirection = 'long' | 'short' | 'hedge'

/** Conviction bucket from the PM/analyst. Independent of weight. */
export type PortfolioConviction = 'high' | 'medium' | 'low'

/** Free-form tag. The engine only uses tags as boolean flags
 *  (e.g. `core`, `tactical`, `event_driven`, `restricted`). */
export type PositionTag = string

export interface PortfolioPosition {
  readonly portfolioId: PortfolioId
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly direction: PortfolioDirection
  /** Gross weight in % of NAV. Null when not provided by upstream. */
  readonly weightPct: number | null
  /** Cost basis per share in the position currency. Null when unknown. */
  readonly costBasis: number | null
  readonly conviction: PortfolioConviction | null
  readonly tags: readonly PositionTag[]
  /** Analyst owner if the firm tracks it. */
  readonly ownerUserId: UserId | null
  readonly openedAt: Iso8601 | null
  /** Free-form note (one-liner thesis the PM associates with the position). */
  readonly note: string | null
}

export interface WatchlistEntry {
  readonly portfolioId: PortfolioId
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly addedAt: Iso8601
  readonly tags: readonly PositionTag[]
  readonly ownerUserId: UserId | null
  readonly note: string | null
}

/** Top-level snapshot. One per (orgId, asOf). */
export interface PortfolioSnapshot {
  readonly id: PortfolioId
  readonly orgId: OrgId
  readonly asOf: Iso8601
  /** Human label for the source ("aranya_fund_a_2026q2", "csv:upload-..."). */
  readonly source: string
  readonly positions: readonly PortfolioPosition[]
  readonly watchlist: readonly WatchlistEntry[]
  /** Total gross exposure in % of NAV (∑ |weightPct|). Null when unknown. */
  readonly totalGrossExposurePct: number | null
  /** True when the snapshot was loaded from a real source (not a placeholder
   *  empty fixture). The UI uses this to distinguish "no portfolio configured"
   *  from "portfolio configured but currently empty". */
  readonly isConfigured: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Selector / engine outputs
// ─────────────────────────────────────────────────────────────────────────

/** Where a ticker sits relative to the book.
 *
 *   held       — there is an active position in the book
 *   watchlist  — on the watchlist but not held
 *   adjacent   — same sector as a held name, but not held/watchlisted
 *   none       — neither held, watchlisted, nor sector-adjacent
 */
export type PortfolioMembership = 'held' | 'watchlist' | 'adjacent' | 'none'

/** Coarse, deterministic relevance bucket. Reasons explain *why*. */
export type PortfolioRelevanceBucket = 'critical' | 'high' | 'medium' | 'low' | 'none'

export interface PortfolioRelevanceReason {
  readonly code: string
  readonly text: string
  readonly points: number
}

/** One row of the relevance map: a (report × ticker) pair scored against
 *  the active book. */
export interface PortfolioRelevance {
  readonly bucket: PortfolioRelevanceBucket
  readonly score: number
  readonly reasons: readonly PortfolioRelevanceReason[]
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  /** One-line "why this matters to the book" line. */
  readonly bookSummary: string
}

/** Risk flags surfaced for a given position by the coverage engine. */
export type PositionRiskFlag =
  | 'no_coverage'
  | 'single_broker_coverage'
  | 'stale_coverage'
  | 'unresolved_divergence'
  | 'broker_outlier'
  | 'recent_significant_change'

export interface PositionResearchActivity {
  readonly ticker: StockTicker
  readonly reportsLast24h: number
  readonly reportsLast3d: number
  readonly reportsLast7d: number
  readonly distinctBrokersLast7d: number
  /** Days since the most-recent report. Null when there is none. */
  readonly daysSinceLastReport: number | null
  /** ISO of the most-recent report. Null when none. */
  readonly lastReportAt: Iso8601 | null
}

export interface PortfolioCoverageSummary {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  readonly activity: PositionResearchActivity
  readonly distinctBrokersAllTime: number
  readonly hasUnresolvedDivergence: boolean
  readonly hasOutlier: boolean
  /** Most-recent significant change bucket on this ticker, if any.
   *  ('major' | 'moderate' | 'first_coverage' | 'minor' | null) */
  readonly recentChangeBucket: string | null
  readonly riskFlags: readonly PositionRiskFlag[]
}
