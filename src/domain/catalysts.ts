// ─────────────────────────────────────────────────────────────────────────
// Catalyst calendar + expectation monitor + pre/post-event briefing
// (Module 21).
//
// A `CatalystEvent` is a future (or just-past) corporate moment that
// matters to the book — earnings, guidance, AGM, investor day,
// regulatory decision, capital-markets day, etc. The catalyst layer
// reads canonical research + the portfolio overlay + the calibration
// layer and produces:
//
//   - a portfolio-aware calendar
//   - per-catalyst `ExpectationSnapshot`s ("what brokers are saying
//     into the event")
//   - `EventExpectationDelta`s (what changed in 7d / 30d into the event)
//   - `PreEventBrief`s for analyst pre-read
//   - `PostEventReview` scaffolding for the next module to fill
//
// Methodology overview lives in docs/catalysts.md. Same rules as
// Module 19/20: deterministic engine first, optional LLM prose only
// for section blurbs, never for selection.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, BrokerId, ReportId, StockTicker, SectorId,
  CatalystId, PreEventBriefId, PostEventReviewId,
  AlertId,
} from './ids'
import type { Iso8601 } from './common'
import type {
  PortfolioMembership, PortfolioDirection, PortfolioConviction,
} from './portfolio'
import type { ConfidenceBand } from './calibration'

// ── Taxonomy ─────────────────────────────────────────────────────────────

export type CatalystType =
  | 'earnings'
  | 'guidance_update'
  | 'investor_day'
  | 'capital_markets_day'
  | 'product_launch'
  | 'agm'
  | 'regulatory_decision'
  | 'mna'
  | 'other'

export const CATALYST_TYPES: readonly CatalystType[] = [
  'earnings', 'guidance_update', 'investor_day', 'capital_markets_day',
  'product_launch', 'agm', 'regulatory_decision', 'mna', 'other',
]

/** Date confidence around an upcoming event. */
export type CatalystStatus =
  | 'scheduled'       // exact date / time confirmed
  | 'estimated'       // date is upstream's best estimate
  | 'overdue'         // past `expectedDate` but not yet marked completed
  | 'completed'
  | 'cancelled'

export type CatalystImportance = 'critical' | 'high' | 'medium' | 'low'

/** Extra severity flags surfaced in the calendar. */
export type EventRiskFlag =
  | 'thin_coverage'              // few brokers covering the name into the event
  | 'widening_divergence'        // Street view dispersing as the event approaches
  | 'against_position_pressure'  // recent against-position alerts cluster
  | 'stale_coverage'             // no broker note in the staleness window
  | 'high_calibration_brokers_silent'  // top brokers haven't published recently
  | 'outlier_active'             // a calibration-known outlier is leading

export type EventMonitoringWindow = '24h' | '3d' | '7d' | '14d' | '30d'

export const EVENT_MONITORING_WINDOWS: readonly EventMonitoringWindow[] =
  ['24h', '3d', '7d', '14d', '30d']

// ── Source / lineage ─────────────────────────────────────────────────────

export interface CatalystSource {
  /** Stable upstream identifier ("aranya_calendar_q2_2026", "manual_fixture"). */
  readonly id: string
  readonly label: string
  /** 0..1 confidence in the date being correct. */
  readonly confidence: number
}

// ── Core event ───────────────────────────────────────────────────────────

export interface CatalystEvent {
  readonly id: CatalystId
  readonly orgId: OrgId
  readonly type: CatalystType
  readonly status: CatalystStatus
  readonly importance: CatalystImportance
  /** Primary ticker the catalyst belongs to. */
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly sectorId: SectorId | null
  /** Headline (e.g. "Q4 FY26 earnings" or "JLR product strategy day"). */
  readonly headline: string
  readonly description: string
  /** Wall-clock timestamp the event is scheduled to happen at. */
  readonly expectedAt: Iso8601
  /** ISO date for grouping / display. */
  readonly expectedDate: string
  /** Whether the time-of-day is meaningful (vs purely a date placeholder). */
  readonly hasIntradayTime: boolean
  readonly source: CatalystSource
  /** When the catalyst record was last updated (e.g. date moved). */
  readonly updatedAt: Iso8601
  readonly tags: readonly string[]
}

// ── Calendar entry (per-org, decorated for ranking) ──────────────────────

export interface CatalystCalendarEntry {
  readonly catalyst: CatalystEvent
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  /** Days until expected event (negative for overdue). */
  readonly daysUntil: number
  /** Composite urgency score: blends days-to-event + importance + book weight. */
  readonly urgencyScore: number
  /** Composite priority (urgency × importance × position weight). */
  readonly priorityScore: number
  readonly riskFlags: readonly EventRiskFlag[]
  /** Stable reasons explaining the rank. */
  readonly reasons: readonly { code: string; text: string }[]
}

// ── Expectation snapshot (the "what brokers say into the event" frame) ───

export interface ExpectationStanceMix {
  readonly bullish: number
  readonly neutral: number
  readonly bearish: number
}

export interface ExpectationBrokerOpinion {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly rating: string | null
  readonly stance: 'bullish' | 'neutral' | 'bearish'
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: string | null
  /** Forward upside vs spot, in %. Null when no target or no spot. */
  readonly impliedUpsidePct: number | null
  readonly lastReportId: ReportId
  readonly lastUpdatedAt: Iso8601
  readonly calibrationScore: number | null
  readonly calibrationConfidence: ConfidenceBand | null
}

export interface ExpectationSnapshot {
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly catalystId: CatalystId
  /** As-of timestamp. Snapshots are stable for replay if asOf is specified. */
  readonly asOf: Iso8601
  readonly distinctBrokers: number
  readonly stanceMix: ExpectationStanceMix
  readonly avgTargetPrice: number | null
  readonly medianTargetPrice: number | null
  readonly targetSpreadPct: number | null
  readonly avgImpliedUpsidePct: number | null
  /** True when the conflict-closure layer reports unresolved divergence
   *  on this name as of the snapshot. */
  readonly hasDivergence: boolean
  /** Sorted opinions ranked by calibration score desc, then last-updated. */
  readonly opinions: readonly ExpectationBrokerOpinion[]
  /** One-line text describing the current Street tilt. */
  readonly tiltSummary: string
}

// ── Expectation delta (snapshot vs snapshot) ─────────────────────────────

export type ExpectationDeltaSign = 'more_bullish' | 'more_cautious' | 'flat' | 'mixed'

export interface EventExpectationDelta {
  readonly catalystId: CatalystId
  readonly window: EventMonitoringWindow
  readonly priorAsOf: Iso8601
  readonly currentAsOf: Iso8601
  /** Net stance shift across brokers in window. */
  readonly stanceShift: ExpectationDeltaSign
  /** Mean target Δ% across brokers active in the window. */
  readonly meanTargetChangePct: number | null
  /** Number of distinct broker opinion updates in window. */
  readonly opinionUpdates: number
  /** Number of opinion updates that were rating downgrades. */
  readonly ratingDowngrades: number
  readonly ratingUpgrades: number
  /** Whether divergence widened / narrowed / unchanged in the window. */
  readonly divergenceShift: 'widened' | 'narrowed' | 'unchanged'
  /** Number of against-position alerts that fired in the window. */
  readonly againstPositionAlerts: number
  readonly outlierEmergence: number
  /** Coverage intensity change: positive = more brokers active. */
  readonly coverageIntensityDelta: number
  readonly reasons: readonly { code: string; text: string }[]
}

// ── Pre-event brief ──────────────────────────────────────────────────────

export interface PreEventBriefSection {
  readonly key:
    | 'event_summary'
    | 'why_it_matters'
    | 'expectation_snapshot'
    | 'recent_changes'
    | 'unresolved_questions'
    | 'top_reads'
    | 'calibration_context'
    | 'risk_flags'
  readonly title: string
  readonly subtitle: string
  /** Optional LLM-written prose. Falls back to deterministic text. */
  readonly prose: string | null
  readonly proseFromLlm: boolean
  /** Reports referenced by the section (top reads / changes). */
  readonly reportIds: readonly ReportId[]
  /** Alerts referenced by the section (against-position, divergence). */
  readonly alertIds: readonly AlertId[]
  /** Plain-text bullets when the section is bullet-shaped (recent changes,
   *  unresolved questions, risk flags). */
  readonly bullets: readonly string[]
}

export interface PreEventBrief {
  readonly id: PreEventBriefId
  readonly orgId: OrgId
  readonly catalystId: CatalystId
  readonly generatedAt: Iso8601
  readonly daysUntilEvent: number
  readonly snapshot: ExpectationSnapshot
  readonly delta7d: EventExpectationDelta | null
  readonly delta30d: EventExpectationDelta | null
  readonly sections: readonly PreEventBriefSection[]
  readonly riskFlags: readonly EventRiskFlag[]
  readonly executiveSummary: string | null
  readonly executiveSummaryFromLlm: boolean
}

// ── Post-event review (scaffold) ─────────────────────────────────────────

export interface PostEventReview {
  readonly id: PostEventReviewId
  readonly orgId: OrgId
  readonly catalystId: CatalystId
  readonly generatedAt: Iso8601
  /** Snapshot taken just before the event — what brokers said going in. */
  readonly preEventSnapshot: ExpectationSnapshot
  /** Snapshot taken right after the event with newly-arrived research. */
  readonly postEventSnapshot: ExpectationSnapshot | null
  /** Brokers whose pre-event stance matched the realized direction. */
  readonly directionallyRightBrokerIds: readonly BrokerId[]
  /** Brokers whose pre-event stance opposed the realized direction. */
  readonly directionallyWrongBrokerIds: readonly BrokerId[]
  readonly divergenceResolved: boolean
  readonly notes: readonly string[]
}
