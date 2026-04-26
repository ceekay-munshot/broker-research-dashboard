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

// ── Post-event review (Module 22 — full version) ────────────────────────

/** Per-window realized return after the event. Mirrors the calibration
 *  layer's window vocabulary so the two systems can compose. */
export interface RealizedOutcomeWindow {
  /** Trading-day offset window. */
  readonly window: '1d' | '3d' | '5d' | '10d'
  /** Raw return % from the event-anchor close to the close at +N days.
   *  Null when terminal price coverage is missing. */
  readonly rawReturnPct: number | null
  /** Benchmark-relative return (asset − benchmark) when a benchmark is
   *  wired for the ticker; null otherwise. */
  readonly benchmarkRelReturnPct: number | null
  /** Direction inferred from `rawReturnPct` (or `benchmarkRelReturnPct`
   *  when no raw is available). 'flat' when |return| ≤ 25 bps × N. */
  readonly direction: 'up' | 'down' | 'flat' | 'unknown'
}

export interface RealizedOutcome {
  readonly ticker: StockTicker
  /** ISO date of the close used as the event anchor. */
  readonly anchorDate: string
  readonly anchorPrice: number | null
  readonly anchorCurrency: string | null
  readonly windows: readonly RealizedOutcomeWindow[]
  /** Synthesized "headline" direction across windows — the sign that
   *  most windows agreed on, or 'mixed'. Used by broker-verdict logic. */
  readonly headlineDirection: 'up' | 'down' | 'flat' | 'mixed' | 'unknown'
  /** Whether market data was available at all for the ticker. */
  readonly hasCoverage: boolean
  /** Note string surfaced when coverage is missing or partial. */
  readonly coverageNote: string | null
}

/** Verdict on a single broker's pre-event stance vs realized direction. */
export type BrokerVerdictKind = 'right' | 'wrong' | 'inconclusive' | 'no_view'

export interface BrokerVerdict {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  /** Pre-event stance + rating + target. */
  readonly preStance: 'bullish' | 'neutral' | 'bearish'
  readonly preRating: string | null
  readonly preTargetPrice: number | null
  /** Realized headline direction reused from `RealizedOutcome`. */
  readonly realizedDirection: RealizedOutcome['headlineDirection']
  readonly verdict: BrokerVerdictKind
  /** Calibration score at review time, when available. */
  readonly calibrationScore: number | null
  /** Whether the broker had a directional view (`bullish` / `bearish`). */
  readonly hadDirectionalView: boolean
  /** Short reason string. */
  readonly reason: string
}

/** Divergence resolution after the event. */
export type DivergenceResolutionKind =
  | 'resolved'
  | 'persisted'
  | 'widened'
  | 'outlier_vindicated'
  | 'outlier_invalidated'
  | 'no_divergence_pre'

export interface DivergenceResolution {
  readonly kind: DivergenceResolutionKind
  /** Pre-event closure state ("mixed_constructive", "consensus_bullish", …). */
  readonly preClosureState: string | null
  readonly postClosureState: string | null
  /** Brokers who were outliers pre-event. */
  readonly preOutlierBrokerIds: readonly BrokerId[]
  /** Outliers that turned out to be directionally right. */
  readonly vindicatedOutlierBrokerIds: readonly BrokerId[]
  /** Outliers that turned out to be wrong. */
  readonly invalidatedOutlierBrokerIds: readonly BrokerId[]
  readonly note: string
}

/** Where the pre-event expectation broke down. */
export type ExpectationErrorKind =
  | 'overly_bullish'
  | 'overly_cautious'
  | 'target_dispersion_too_wide'
  | 'target_dispersion_too_narrow'
  | 'high_calibration_brokers_wrong'
  | 'outlier_was_right'
  | 'thin_coverage_pre_event'
  | 'against_position_useful'
  | 'against_position_not_useful'
  | 'no_significant_error'

export interface ExpectationError {
  readonly kind: ExpectationErrorKind
  readonly text: string
  /** 0..100 magnitude of the error contribution. */
  readonly magnitude: number
}

/** Calibration feedback metadata produced by a single review.
 *  Snapshot-shaped so the calibration layer (Module 20) can absorb it
 *  without invariants leaking. */
export interface CalibrationFeedback {
  /** Per-broker correctness on this catalyst. */
  readonly brokerCorrectness: readonly {
    readonly brokerId: BrokerId
    readonly correct: number   // 0 or 1 — single observation
    readonly wrong: number     // 0 or 1
    readonly inconclusive: number
  }[]
  /** Catalyst-type rolled-up correctness. */
  readonly catalystTypePerformance: {
    readonly type: CatalystType
    readonly directionallyRight: number
    readonly directionallyWrong: number
    readonly inconclusive: number
  }
  /** Pre-event alert usefulness deltas (e.g. against-position alerts
   *  that lined up with realized direction). */
  readonly preEventAlertUsefulness: readonly {
    readonly alertId: AlertId
    readonly useful: boolean
    readonly note: string
  }[]
  /** Distinguishes event-driven usefulness from non-event when sample
   *  size is meaningful. Marker; consumed by the calibration absorber. */
  readonly eventDriven: boolean
  /** Methodology version so consumers can reject mismatched feedback. */
  readonly methodologyVersion: string
}

export type PostEventReviewConfidenceBand = 'very_low' | 'low' | 'medium' | 'high'

export interface PostEventReview {
  readonly id: PostEventReviewId
  readonly orgId: OrgId
  readonly catalystId: CatalystId
  readonly generatedAt: Iso8601
  /** When the system marked the event as "completed" / actionable. */
  readonly reviewedAt: Iso8601
  /** Snapshot taken just before the event — what brokers said going in. */
  readonly preEventSnapshot: ExpectationSnapshot
  /** Snapshot taken after the event with newly-arrived research, when
   *  enough post-event reports have landed. Null until then. */
  readonly postEventSnapshot: ExpectationSnapshot | null
  /** Realized market outcome — the deterministic anchor for verdicts. */
  readonly realizedOutcome: RealizedOutcome
  /** Per-broker verdicts indexed by brokerId. Always covers every broker
   *  that held a directional view in the pre-event snapshot. */
  readonly brokerVerdicts: readonly BrokerVerdict[]
  /** Convenience id lists derived from `brokerVerdicts`. */
  readonly directionallyRightBrokerIds: readonly BrokerId[]
  readonly directionallyWrongBrokerIds: readonly BrokerId[]
  readonly inconclusiveBrokerIds: readonly BrokerId[]
  readonly divergenceResolution: DivergenceResolution
  readonly expectationErrors: readonly ExpectationError[]
  /** Top reports that landed *after* the event — the natural follow-up read list. */
  readonly topPostEventReportIds: readonly ReportId[]
  readonly calibrationFeedback: CalibrationFeedback
  /** One-line summary suitable for the Completed Events row + panel header. */
  readonly outcomeSummary: string
  /** Confidence band reflecting sample size + market-data coverage. */
  readonly confidence: PostEventReviewConfidenceBand
  readonly notes: readonly string[]
  readonly executiveSummary: string | null
  readonly executiveSummaryFromLlm: boolean
}
