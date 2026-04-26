// ─────────────────────────────────────────────────────────────────────────
// Alert / digest / notification domain (Module 19).
//
// Alerts are deterministic, structured events emitted by the server-side
// trigger engine when a canonical record + the org's portfolio overlay
// satisfies a rule (e.g. "new research on a held name with a >7% target
// move opposing the position"). Every alert carries reason strings so it
// is fully explainable.
//
// Digests are deterministic roll-ups of alerts within a window, organized
// into named sections (Morning Book Brief, Intraday Critical, Coverage
// Hygiene). Optional LLM prose fills section headlines/blurbs but never
// participates in alert selection.
//
// Notifications are delivery records — one per (alert, channel). The
// in-app channel is the persistent on-page feed; webhook/email/slack are
// stubs for future integration.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, BrokerId, ReportId, StockTicker, UserId,
  AlertId, AlertRuleId, DigestId, DigestRunId, NotificationId,
} from './ids'
import type { Iso8601 } from './common'
import type {
  PortfolioMembership, PortfolioDirection, PortfolioConviction,
} from './portfolio'

// ── Severity ─────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export const ALERT_SEVERITIES: readonly AlertSeverity[] =
  ['critical', 'high', 'medium', 'low', 'info']

// ── Trigger taxonomy ─────────────────────────────────────────────────────

/** Every alert kind. New triggers are additive — never reuse a code. */
export type AlertTriggerKind =
  | 'new_research_held'
  | 'new_research_watchlist'
  | 'significant_change_held'
  | 'against_position'
  | 'unresolved_divergence_held'
  | 'broker_outlier_held'
  | 'pile_in_book'
  | 'stale_coverage_high_conviction'
  | 'stale_coverage_held'
  | 'stale_coverage_watchlist'
  | 'watchlist_fresh_candidate'
  | 'correction_replay_change'

export const ALERT_TRIGGER_KINDS: readonly AlertTriggerKind[] = [
  'new_research_held',
  'new_research_watchlist',
  'significant_change_held',
  'against_position',
  'unresolved_divergence_held',
  'broker_outlier_held',
  'pile_in_book',
  'stale_coverage_high_conviction',
  'stale_coverage_held',
  'stale_coverage_watchlist',
  'watchlist_fresh_candidate',
  'correction_replay_change',
]

// ── Delivery / audience ──────────────────────────────────────────────────

export type DeliveryChannel = 'in_app' | 'cli' | 'webhook' | 'email' | 'slack'

export type AlertAudience = 'pm' | 'analyst' | 'team' | 'all'

export type DigestKind = 'morning_brief' | 'intraday_critical' | 'coverage_hygiene'

// ── Reason strings ───────────────────────────────────────────────────────

export interface AlertReason {
  /** Stable code (e.g. `pf_against`, `target_15pct`). */
  readonly code: string
  /** Short human-readable text. */
  readonly text: string
  /** Optional severity contribution (positive = raises severity). */
  readonly severityDelta?: number
}

// ── Book context attached to alerts ──────────────────────────────────────

export interface AlertBookContext {
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
}

// ── Lineage / provenance ─────────────────────────────────────────────────

export interface AlertLineage {
  readonly reportId: ReportId | null
  readonly brokerId: BrokerId | null
  readonly ticker: StockTicker | null
  /** Other alert ids this alert supersedes (kept for replay). */
  readonly supersedes: readonly AlertId[]
}

// ── AlertEvent ───────────────────────────────────────────────────────────

export interface AlertEvent {
  readonly id: AlertId
  readonly orgId: OrgId
  readonly kind: AlertTriggerKind
  readonly severity: AlertSeverity
  readonly audience: AlertAudience
  readonly headline: string
  readonly body: string
  readonly reasons: readonly AlertReason[]
  readonly bookContext: AlertBookContext | null
  readonly lineage: AlertLineage
  /** Stable dedup key — same fingerprint within a suppression window
   *  collapses to a single alert. */
  readonly fingerprint: string
  readonly generatedAt: Iso8601
  readonly expiresAt: Iso8601 | null
  /** True when the rule fired but suppression collapsed it into a prior
   *  alert. The persisted record is kept so suppression can be inspected. */
  readonly suppressed: boolean
  readonly suppressedReason: string | null
}

// ── AlertRule ────────────────────────────────────────────────────────────

/** A rule registered in the trigger engine. Today rules are static (one
 *  per AlertTriggerKind) but the shape is extensible so an admin surface
 *  can later toggle/tune them per org. */
export interface AlertRule {
  readonly id: AlertRuleId
  readonly kind: AlertTriggerKind
  readonly enabled: boolean
  readonly defaultSeverity: AlertSeverity
  readonly audience: AlertAudience
  readonly suppressionWindowMinutes: number
  readonly description: string
}

// ── Digest ───────────────────────────────────────────────────────────────

export interface DigestSection {
  /** Stable section key (e.g. `today_on_book`, `significant_changes`). */
  readonly key: string
  readonly title: string
  readonly subtitle: string
  /** Alert ids in display order. */
  readonly alertIds: readonly AlertId[]
  /** Optional LLM-written one-liner. Always grounded in the section's
   *  alerts; falls back to deterministic text when LLM is disabled. */
  readonly prose: string | null
  /** Set to true when the prose came from the LLM (not a deterministic
   *  fallback). The digest UI shows a small badge so this is auditable. */
  readonly proseFromLlm: boolean
}

export interface AlertDigest {
  readonly id: DigestId
  readonly runId: DigestRunId
  readonly orgId: OrgId
  readonly kind: DigestKind
  readonly title: string
  readonly subtitle: string
  readonly generatedAt: Iso8601
  /** Inclusive lower bound of the digest window, ISO. */
  readonly windowStart: Iso8601
  readonly windowEnd: Iso8601
  readonly sections: readonly DigestSection[]
  /** Total alert count materialized into the digest (across all sections). */
  readonly alertCount: number
  /** Top severity present in the digest. */
  readonly topSeverity: AlertSeverity | null
  /** Optional LLM-written executive summary. */
  readonly executiveSummary: string | null
  readonly executiveSummaryFromLlm: boolean
}

// ── DigestRun ────────────────────────────────────────────────────────────

export interface DigestRun {
  readonly id: DigestRunId
  readonly orgId: OrgId
  readonly kind: DigestKind
  readonly startedAt: Iso8601
  readonly finishedAt: Iso8601 | null
  readonly status: 'pending' | 'success' | 'failed'
  readonly alertsEvaluated: number
  readonly alertsEmitted: number
  readonly alertsSuppressed: number
  readonly digestId: DigestId | null
  readonly llmCallCount: number
  readonly llmCostUsd: number | null
  readonly error: string | null
  /** Scheduler trigger source: 'cli' | 'cron' | 'fixture' | 'replay'. */
  readonly source: string
}

// ── Notification ─────────────────────────────────────────────────────────

export interface NotificationRecord {
  readonly id: NotificationId
  readonly orgId: OrgId
  readonly alertId: AlertId
  readonly channel: DeliveryChannel
  readonly recipientUserId: UserId | null
  readonly status: 'queued' | 'sent' | 'failed' | 'skipped' | 'delivered'
  readonly attemptedAt: Iso8601
  readonly deliveredAt: Iso8601 | null
  readonly error: string | null
}
