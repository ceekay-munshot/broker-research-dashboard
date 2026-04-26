// ─────────────────────────────────────────────────────────────────────────
// Daily Worklog view-model types.
//
// A `WorklogItem` is one *actionable* row for the analyst. It is derived
// deterministically from a (ResearchReport × Ticker) pair. A single-ticker
// earnings_review produces one WorklogItem; a two-ticker morning note
// produces two digest-split items.
//
// Nothing here is persisted. Everything is a pure transform of the
// canonical domain layer. See `./builder.ts` for the orchestration.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BrokerId, ReportId, SectorId, StockTicker,
  Stance, Rating, Iso8601, IsoCurrency, EmailId,
  PortfolioRelevance, PortfolioMembership,
} from '../../domain'
import type { ReportChangeSet } from '../brokerMemory/types'

/** How the worklog item was produced from the upstream. */
export type WorklogOrigin =
  | 'direct_attachment'   // single-ticker report with a PDF / attachment
  | 'direct_body'         // single-ticker report, body-only (no attachment)
  | 'digest_split'        // multi-ticker report split into per-ticker items

/** Buckets reflect the priority score. See `./priority.ts` for rules. */
export type PriorityBucket = 'high' | 'medium' | 'low'

/** Each fired rule contributes a point delta and a short human-readable
 *  reason. Reasons surface verbatim in the UI + docs + console. */
export interface PriorityReason {
  readonly code: string
  readonly text: string
  readonly points: number
}

export interface WorklogPriority {
  readonly bucket: PriorityBucket
  readonly score: number
  readonly reasons: readonly PriorityReason[]
}

export interface WorklogSource {
  readonly parentEmailId: EmailId | null
  readonly parentSubject: string | null
  readonly isSplitFromDigest: boolean
  /** Other worklog item ids that collapsed into this one as duplicates. */
  readonly collapsedIds: readonly string[]
  /** Count of collapsed duplicates, for UI badges. */
  readonly duplicateCount: number
}

export interface WorklogItem {
  /** Stable composite id: `${reportId}:${ticker}`. */
  readonly id: string
  readonly reportId: ReportId
  readonly ticker: StockTicker | null

  // Broker
  readonly brokerId: BrokerId
  readonly brokerName: string
  readonly brokerShortName: string
  readonly brokerColor: string | null

  // Taxonomy
  readonly sectorId: SectorId | null
  readonly sectorName: string | null
  readonly stockName: string | null

  // Timing
  readonly receivedAt: Iso8601
  readonly publishedAt: Iso8601
  /** ISO yyyy-mm-dd in UTC — used for "today" / grouping. */
  readonly utcDate: string

  // Content
  readonly reportType: string
  readonly title: string
  readonly headline: string
  readonly summaryShort: string

  // Signal
  readonly stance: Stance
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: IsoCurrency | null
  /** Absolute delta vs prior; null if no prior target. */
  readonly targetChangeAbs: number | null
  /** Percentage change vs prior. Null if no prior or zero prior. */
  readonly targetChangePct: number | null

  // Lineage
  readonly origin: WorklogOrigin
  readonly source: WorklogSource
  readonly hasAttachment: boolean

  // Enrichments
  readonly evidenceCount: number
  readonly hasDivergence: boolean

  // Deterministic priority
  readonly priority: WorklogPriority

  /** Optional broker-memory view of what this report changed vs the
   *  prior comparable note from the same broker. Null when the
   *  broker-memory layer hasn't produced a linkage (e.g. ticker is null
   *  or degraded mode). See `src/viewModels/brokerMemory/`. */
  readonly change: ReportChangeSet | null

  /** Portfolio overlay (Module 18). Null when no portfolio is configured;
   *  membership/relevance are populated when one is. */
  readonly book: WorklogBookOverlay | null

  /** Module 23 — calibration-aware adaptive-ranking annotation. Always
   *  present so consumers can branch on `applied`. */
  readonly adaptive: WorklogAdaptiveAnnotation | null
}

/** The portfolio decoration on a single worklog item. */
export interface WorklogBookOverlay {
  readonly membership: PortfolioMembership
  readonly relevance: PortfolioRelevance
}

/** Optional Module-23 adaptive-ranking annotation. Always present on
 *  the item; null when adaptive ranking is off or no signal applied. */
export type WorklogAdaptiveAnnotation = import('../adaptiveRanking').AdaptiveAnnotation

// ── Daily summary header ─────────────────────────────────────────────────

export interface DailyWorklogSummary {
  readonly utcDate: string
  readonly totalItems: number
  readonly totalItemsRaw: number         // pre-dedup
  readonly highPriority: number
  readonly activeBrokers: number
  readonly mentionedStocks: number
  readonly ratingChangeItems: number
  readonly targetChangeItems: number
  readonly divergenceItems: number
}

// ── Filters + grouping ───────────────────────────────────────────────────

export type WorklogDateWindow = 'today' | 'last3' | 'last7' | 'all'
export type WorklogGrouping   = 'chronological' | 'broker' | 'stock' | 'priority' | 'book'

/** Book-aware filter mode. `any` means no portfolio filtering. */
export type WorklogBookFilter =
  | 'any'
  | 'held'
  | 'watchlist'
  | 'book'         // held + watchlist
  | 'uncovered'    // adjacent or none
  | 'against'      // broker view opposes the position

export interface WorklogFiltersState {
  readonly dateWindow: WorklogDateWindow
  readonly brokerIds: readonly BrokerId[]
  readonly tickers: readonly StockTicker[]
  readonly sectorIds: readonly SectorId[]
  readonly reportTypes: readonly string[]
  readonly stances: readonly Stance[]
  readonly ratings: readonly Rating[]
  readonly priorityBuckets: readonly PriorityBucket[]
  readonly origins: readonly WorklogOrigin[]
  /** If true, only items with a non-null target change are included. */
  readonly hasTargetChange: boolean
  readonly hasDivergence: boolean
  readonly hasEvidence: boolean
  readonly grouping: WorklogGrouping
  /** Portfolio-aware filter. `any` is the no-portfolio default. */
  readonly bookFilter: WorklogBookFilter
  /** When true and a portfolio is loaded, items are sorted with
   *  book-relevance dominating the priority score. */
  readonly bookFirst: boolean
}

export const DEFAULT_WORKLOG_FILTERS: WorklogFiltersState = {
  dateWindow: 'today',
  brokerIds: [],
  tickers: [],
  sectorIds: [],
  reportTypes: [],
  stances: [],
  ratings: [],
  priorityBuckets: [],
  origins: [],
  hasTargetChange: false,
  hasDivergence: false,
  hasEvidence: false,
  grouping: 'chronological',
  bookFilter: 'any',
  bookFirst: false,
}

// ── Grouped output ───────────────────────────────────────────────────────

export interface WorklogGroup {
  /** Group label: broker short name, ticker, bucket name, or ISO date. */
  readonly key: string
  readonly label: string
  readonly items: readonly WorklogItem[]
}

export interface DailyWorklogViewModel {
  /** Today's summary header. */
  readonly summary: DailyWorklogSummary
  /** All items after filtering + dedup, sorted by priority then recency. */
  readonly items: readonly WorklogItem[]
  /** Items grouped per the active `grouping` filter. */
  readonly groups: readonly WorklogGroup[]
  /** Resource-level degradation notes so the UI can surface gaps. */
  readonly degradations: readonly string[]
}
