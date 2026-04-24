// ─────────────────────────────────────────────────────────────────────────
// Broker memory — "what changed vs the previous note from the same broker
// on the same stock?" — as a structured, deterministic data layer.
//
// Every `ReportChangeSet` is a view-model; nothing is persisted. It is
// produced purely from the canonical domain (ResearchReport +
// ReportSummary + EvidenceSnippet) by `./builder.ts`. No LLMs, no fuzzy
// semantic matching — all deltas are arithmetic or set-based on existing
// fields.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BrokerId, ReportId, StockTicker, Stance, Rating, Iso8601,
} from '../../domain'

/** How confident we are that the prior report is a valid comparable. */
export type Comparability =
  | 'high'           // same broker, same ticker, same report-type family
  | 'medium'         // same broker + ticker, different type family
  | 'low'            // same broker + ticker, but one side is a multi-ticker digest
  | 'first_coverage' // no prior note from this broker on this ticker

/** Significance rolls up magnitude of change across fields. */
export type SignificanceBucket =
  | 'major'
  | 'moderate'
  | 'minor'
  | 'first_coverage'

/** Thematic delta availability. `unavailable` when both reports have
 *  empty or missing summaries/themes — we don't pretend to compute deltas
 *  we can't ground. */
export type ThematicDeltaAvailability = 'available' | 'partial' | 'unavailable'

export interface SignificanceReason {
  readonly code: string
  readonly text: string
  readonly points: number
}

export interface Significance {
  readonly bucket: SignificanceBucket
  readonly score: number
  readonly reasons: readonly SignificanceReason[]
}

/**
 * A current report compared to its immediately-prior comparable from the
 * same broker on the same ticker. Keyed by (reportId, ticker) — a
 * multi-ticker morning note produces one change-set per ticker, each
 * linked independently.
 */
export interface ReportChangeSet {
  // Identity
  readonly key: string              // `${reportId}:${ticker}` or `${reportId}:`
  readonly currentReportId: ReportId
  readonly currentTicker: StockTicker | null
  readonly currentBrokerId: BrokerId
  readonly currentPublishedAt: Iso8601

  // Prior anchor
  readonly priorReportId: ReportId | null
  readonly priorPublishedAt: Iso8601 | null
  readonly daysSincePrior: number | null
  readonly comparability: Comparability

  // Metadata deltas (always available when prior is linked)
  readonly reportTypeBefore: string | null
  readonly reportTypeAfter: string
  readonly reportTypeChanged: boolean

  // Rating / stance
  readonly ratingBefore: Rating | null
  readonly ratingAfter: Rating | null
  readonly ratingChanged: boolean
  readonly stanceBefore: Stance | null
  readonly stanceAfter: Stance | null
  readonly stanceChanged: boolean

  // Target price
  readonly targetBefore: number | null
  readonly targetAfter: number | null
  readonly targetChangeAbs: number | null
  readonly targetChangePct: number | null

  // Thematic + risk deltas (set-based on lowercase-normalized strings)
  readonly thematic: ThematicDeltaAvailability
  readonly themesAdded: readonly string[]
  readonly themesDropped: readonly string[]
  readonly themesRetained: readonly string[]
  readonly risksAdded: readonly string[]
  readonly risksDropped: readonly string[]
  readonly risksRetained: readonly string[]

  // Structural richness
  readonly keyPointsBefore: number
  readonly keyPointsAfter: number
  readonly evidenceBefore: number
  readonly evidenceAfter: number

  // Roll-up
  readonly significance: Significance
  /** One-line human-readable summary of the change, e.g. "Target cut
   *  12.5% · Rating Hold → Sell · 2 new risks". */
  readonly headline: string
}

// ── Broker-level aggregate: "what has broker X changed recently?" ────────

export interface BrokerRecentChange {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly reportId: ReportId
  readonly receivedAt: Iso8601
  readonly change: ReportChangeSet
}

export interface BrokerRecentChangesSummary {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly biggestTargetRaises: readonly BrokerRecentChange[]     // ≤ 3, desc by pct
  readonly biggestTargetCuts: readonly BrokerRecentChange[]       // ≤ 3, asc by pct
  readonly ratingChanges: readonly BrokerRecentChange[]           // any rating change
  readonly majorViewChanges: readonly BrokerRecentChange[]        // bucket === 'major'
  readonly repeatedThesis: readonly BrokerRecentChange[]          // bucket === 'minor' with prior
  readonly totalCompared: number
  readonly windowDays: number
}

// ── Stock-level aggregate: "who changed what on this ticker?" ────────────

export interface StockBrokerLatestChange {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly latestReportId: ReportId
  readonly latestPublishedAt: Iso8601
  readonly priorReportId: ReportId | null
  readonly priorPublishedAt: Iso8601 | null
  readonly change: ReportChangeSet
}

export interface StockBrokerChangesSummary {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly brokerEntries: readonly StockBrokerLatestChange[]
  readonly majorCount: number
  readonly moderateCount: number
  readonly unchangedCount: number
  readonly firstCoverageCount: number
}

// ── Full broker-memory view-model ────────────────────────────────────────

/** One pass over the adapter-loaded data produces this view-model. The
 *  UI slices what it needs from the maps. All builders are pure. */
export interface BrokerMemoryViewModel {
  /** All change-sets, keyed by `WorklogItem.id` (`reportId:ticker` or
   *  bare `reportId`). */
  readonly changeByKey: ReadonlyMap<string, ReportChangeSet>
  /** Stock-level aggregates, keyed by ticker. */
  readonly stockSummaries: ReadonlyMap<string, StockBrokerChangesSummary>
  /** Broker-level aggregates, keyed by brokerId. */
  readonly brokerSummaries: ReadonlyMap<string, BrokerRecentChangesSummary>
  /** Resource-level degradation notes surfaced in the UI. */
  readonly degradations: readonly string[]
}
