// ─────────────────────────────────────────────────────────────────────────
// Broker calibration + signal effectiveness + event-study domain (Module 20).
//
// This module closes the feedback loop between research/alerts and
// market outcomes. Every type here is canonical: the server-side
// calibration engine emits these records and the /v1 API + the UI
// consume them.
//
// Methodology overview (full version: docs/calibration.md):
//
//   - A `SignalEvent` is a (kind, ticker, asOfClose, expectedDirection)
//     row derived from canonical reports + alerts.
//   - For each event we compute `SignalOutcome`s over fixed windows
//     {1d, 3d, 5d, 10d, 20d}: raw return, benchmark-relative return when
//     a benchmark is wired, and `directionallyCorrect` when the event
//     carries an expected direction.
//   - Aggregations roll up to per-broker, per-alert-kind, and per-ticker
//     summaries with hit rate, mean / median return, sample size, and
//     a calibration `score` + `confidence` band.
//
// Calibration metadata is **exposed but does NOT silently change
// existing ranking** — gating happens behind a feature flag (see
// docs/calibration.md). All shapes here are pure data; the engine is
// pure transform; the UI tab is read-only.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, BrokerId, ReportId, StockTicker, SectorId,
  AlertId, BenchmarkId, CalibrationSnapshotId, SignalEventId,
} from './ids'
import type { Iso8601, IsoCurrency } from './common'
import type { AlertTriggerKind } from './alerts'

// ── Market data primitives ───────────────────────────────────────────────

/** A single daily close. Open/high/low are optional and reserved for
 *  future intraday/event-time-of-day analysis. */
export interface DailyPricePoint {
  readonly ticker: StockTicker
  /** UTC ISO date — `YYYY-MM-DD`. */
  readonly date: string
  readonly close: number
  readonly currency: IsoCurrency
  readonly open?: number
  readonly high?: number
  readonly low?: number
  readonly volume?: number
}

/** Higher-resolution bar. Returned by future intraday providers. */
export type PriceBar = DailyPricePoint

/** Daily benchmark close series (e.g. NIFTY50 for INR-listed names). */
export interface BenchmarkSeries {
  readonly id: BenchmarkId
  readonly name: string
  readonly currency: IsoCurrency
  readonly points: readonly DailyPricePoint[]
}

// ── Event windows ────────────────────────────────────────────────────────

export type ReturnWindow = '1d' | '3d' | '5d' | '10d' | '20d'

export const RETURN_WINDOWS: readonly ReturnWindow[] = ['1d', '3d', '5d', '10d', '20d']

/** Window in trading-day count. */
export const WINDOW_DAYS: Readonly<Record<ReturnWindow, number>> = {
  '1d': 1, '3d': 3, '5d': 5, '10d': 10, '20d': 20,
}

// Alias for the exported "EventStudyWindow" name the spec calls out.
export type EventStudyWindow = ReturnWindow

// ── Signal events derived from canonical artifacts ───────────────────────

export type SignalEventKind =
  | 'broker_report'
  | 'rating_change'
  | 'target_change'
  | 'against_position_alert'
  | 'significant_change_alert'
  | 'unresolved_divergence_alert'
  | 'broker_outlier_alert'
  | 'pile_in_alert'
  | 'watchlist_fresh_alert'
  | 'stale_coverage_alert'
  | 'digest_inclusion'

export const SIGNAL_EVENT_KINDS: readonly SignalEventKind[] = [
  'broker_report', 'rating_change', 'target_change',
  'against_position_alert', 'significant_change_alert',
  'unresolved_divergence_alert', 'broker_outlier_alert',
  'pile_in_alert', 'watchlist_fresh_alert', 'stale_coverage_alert',
  'digest_inclusion',
]

export type ExpectedDirection = 'up' | 'down' | 'flat' | null

/** Membership the position had at event time (frozen for stable replays). */
export type EventBookContext = 'held_long' | 'held_short' | 'watchlist' | 'adjacent' | 'none'

/** A canonical signal moment. Stable id; deterministic from inputs. */
export interface SignalEvent {
  readonly id: SignalEventId
  readonly orgId: OrgId
  readonly kind: SignalEventKind
  readonly ticker: StockTicker
  readonly sectorId: SectorId | null
  readonly brokerId: BrokerId | null
  readonly reportId: ReportId | null
  readonly alertId: AlertId | null
  readonly alertKind: AlertTriggerKind | null
  /** Expected direction at the time of the event, derived deterministically
   *  (e.g. rating upgrade ⇒ 'up'; target raised ⇒ 'up'; bearish stance on
   *  a long held position ⇒ 'down' for the position thesis). Null when the
   *  event carries no directional view. */
  readonly expectedDirection: ExpectedDirection
  readonly bookContext: EventBookContext
  /** Wall-clock timestamp the source artifact was published at. */
  readonly occurredAt: Iso8601
  /** ISO date of the close used as event-time anchor (`YYYY-MM-DD`). */
  readonly asOfDate: string
  /** Price at the anchor close, when available. */
  readonly anchorPrice: number | null
  readonly currency: IsoCurrency | null
}

// ── Outcomes ─────────────────────────────────────────────────────────────

export interface SignalOutcome {
  readonly eventId: SignalEventId
  readonly window: ReturnWindow
  /** Forward raw return in % over the window. Null if no terminal price. */
  readonly rawReturnPct: number | null
  /** Benchmark-relative return (asset − benchmark) when a benchmark
   *  series is available; null otherwise. */
  readonly benchmarkRelReturnPct: number | null
  readonly benchmarkId: BenchmarkId | null
  /** True when `expectedDirection` matched the realized return sign;
   *  null when expectedDirection is null or rawReturnPct is null. */
  readonly directionallyCorrect: boolean | null
  /** True when the absolute return is small enough to be considered
   *  "no move" (≤ 25 bps in 1d, scaled by window). */
  readonly flatNoise: boolean
}

// ── Aggregate window stats ───────────────────────────────────────────────

export interface OutcomeWindowResult {
  readonly window: ReturnWindow
  readonly sampleSize: number
  /** Hit rate over events that carried an expectedDirection. Null if
   *  the underlying sample is empty. */
  readonly hitRate: number | null
  readonly meanReturnPct: number
  readonly medianReturnPct: number
  readonly p25ReturnPct: number
  readonly p75ReturnPct: number
  readonly upsideAvgPct: number
  readonly downsideAvgPct: number
  readonly stddevPct: number
  readonly meanRelReturnPct: number | null
  readonly directionalSampleSize: number
}

// ── Confidence + sample-size bands ───────────────────────────────────────

export type ConfidenceBand = 'very_low' | 'low' | 'medium' | 'high'

export interface CalibrationReason {
  readonly code: string
  readonly text: string
}

// ── Broker calibration ───────────────────────────────────────────────────

export interface BrokerSectorBreakdown {
  readonly sectorId: SectorId
  readonly sectorName: string | null
  readonly sampleSize: number
  readonly hitRate: number | null
  readonly meanReturnPct: number
}

export interface BrokerCalibrationSummary {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly sampleSize: number
  /** Bottom-line "usefulness" score in [-100, 100]. Positive ⇒ broker has
   *  added information vs the org's book; near zero ⇒ noisy; negative ⇒
   *  fade signal historically. */
  readonly score: number
  readonly confidence: ConfidenceBand
  /** Hit rate across all directional events for this broker (null when
   *  no directional sample). */
  readonly hitRate: number | null
  readonly meanReturnPct: number
  /** Per-window window stats. */
  readonly byWindow: readonly OutcomeWindowResult[]
  /** Held-name only window stats (when sample size permits). */
  readonly heldByWindow: readonly OutcomeWindowResult[]
  /** Per-sector breakdown for the broker. */
  readonly bySector: readonly BrokerSectorBreakdown[]
  /** Long vs short context split. Some entries may be null when sample is too small. */
  readonly longHitRate: number | null
  readonly shortHitRate: number | null
  /** Track record of "against position" alerts authored by this broker. */
  readonly againstPositionHitRate: number | null
  readonly againstPositionSampleSize: number
  readonly reasons: readonly CalibrationReason[]
  readonly generatedAt: Iso8601
}

// ── Alert-kind effectiveness ─────────────────────────────────────────────

export type AlertEffectivenessMembership = 'all' | 'held' | 'watchlist'

export interface AlertEffectivenessByMembership {
  readonly membership: AlertEffectivenessMembership
  readonly sampleSize: number
  readonly hitRate: number | null
  readonly meanReturnPct: number
}

export interface AlertEffectivenessSummary {
  readonly orgId: OrgId
  readonly kind: AlertTriggerKind
  readonly sampleSize: number
  readonly score: number
  readonly confidence: ConfidenceBand
  readonly hitRate: number | null
  readonly meanReturnPct: number
  readonly byWindow: readonly OutcomeWindowResult[]
  readonly byMembership: readonly AlertEffectivenessByMembership[]
  readonly reasons: readonly CalibrationReason[]
  readonly generatedAt: Iso8601
}

// ── Per-ticker coverage signal result ────────────────────────────────────

export interface CoverageSignalResult {
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly sampleSize: number
  readonly score: number | null
  readonly confidence: ConfidenceBand
  readonly hitRate: number | null
  readonly meanReturnPct: number
  /** Top brokers by score on this ticker (sample-size gated). */
  readonly topBrokers: readonly {
    readonly brokerId: BrokerId
    readonly brokerShortName: string
    readonly sampleSize: number
    readonly score: number
    readonly hitRate: number | null
  }[]
  readonly recentAlertEffectivenessNote: string | null
  readonly reasons: readonly CalibrationReason[]
  readonly generatedAt: Iso8601
}

// ── Aggregate event-study output ─────────────────────────────────────────

export interface EventStudyResult {
  readonly orgId: OrgId
  /** Filter that produced this study (`broker:brk_kotak`,
   *  `alertKind:against_position`, `ticker:TCS`, etc.). Stable for
   *  reproducibility. */
  readonly bucket: string
  readonly bucketLabel: string
  readonly sampleSize: number
  readonly hitRate: number | null
  readonly meanReturnPct: number
  readonly byWindow: readonly OutcomeWindowResult[]
  readonly generatedAt: Iso8601
}

// ── Snapshot + run metadata ──────────────────────────────────────────────

export type CalibrationSource = 'cli' | 'cron' | 'fixture' | 'replay' | 'bootstrap'

export interface CalibrationSnapshot {
  readonly id: CalibrationSnapshotId
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  /** Methodology version. Bumps when the engine or window set changes
   *  in a way that would break before/after comparisons. */
  readonly methodologyVersion: string
  readonly source: CalibrationSource
  readonly brokerCalibrations: readonly BrokerCalibrationSummary[]
  readonly alertEffectiveness: readonly AlertEffectivenessSummary[]
  readonly coverageByTicker: readonly CoverageSignalResult[]
  /** Top-of-funnel counters for the methodology page. */
  readonly counters: {
    readonly events: number
    readonly outcomes: number
    readonly directionalEvents: number
    readonly priceCoveredTickers: number
    readonly benchmarkCoveredTickers: number
    readonly skippedNoPrice: number
  }
}
