// ─────────────────────────────────────────────────────────────────────────
// Module 25 — Delivery + workflow integration domain.
//
// Wraps the system's outputs (briefings, alerts, catalyst briefs, source
// incidents) in a uniform delivery model so they can be scheduled,
// routed, retried, deduped, and inspected across in-app / email / slack
// / webhook channels.
//
// The dashboard reads `DeliveryAttempt`s for the in-app inbox; the
// server-side `Scheduler` produces `DeliveryRun`s on a tick.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, UserId } from './ids'
import type { Iso8601 } from './common'
import type { SourceKind } from './sources'
import type { AlertSeverity, DeliveryChannel } from './alerts'

export type { DeliveryChannel }

declare const brand: unique symbol

export type DeliveryScheduleId  = string & { readonly [brand]: 'DeliveryScheduleId' }
export type DeliveryRunId       = string & { readonly [brand]: 'DeliveryRunId' }
export type DeliveryAttemptId   = string & { readonly [brand]: 'DeliveryAttemptId' }
export type DeliveryTargetId    = string & { readonly [brand]: 'DeliveryTargetId' }
export type SubscriptionId      = string & { readonly [brand]: 'SubscriptionId' }
export type SuppressionId       = string & { readonly [brand]: 'SuppressionId' }

/** What kind of artifact this delivery represents. The renderer maps
 *  one-to-one with these. */
export const DELIVERY_CONTENT_KINDS = [
  'morning_book_brief',
  'intraday_critical',
  'coverage_hygiene',
  'weekly_catalyst_brief',
  'source_health_incident',
] as const
export type DeliveryContentKind = typeof DELIVERY_CONTENT_KINDS[number]

/** Subset of `DeliveryChannel` (defined in alerts.ts) that the Module-25
 *  workflow layer actually drives. The shared type also includes 'cli'
 *  used elsewhere; we don't dispatch to it here. */
export const DELIVERY_WORKFLOW_CHANNELS = ['in_app', 'email', 'slack', 'webhook'] as const

/** Where to send: a typed recipient endpoint. The shape is per-channel. */
export interface DeliveryTarget {
  readonly id: DeliveryTargetId
  readonly orgId: OrgId
  readonly channel: DeliveryChannel
  /** Free-form display label for the operator UI. */
  readonly label: string
  /** Per-channel address: email address, slack channel, webhook url, user id. */
  readonly address: string
  /** Optional in-app user id when channel === 'in_app'. */
  readonly userId: UserId | null
  /** Whether this target is currently active. */
  readonly enabled: boolean
}

/** Channel-level secrets/config. Loaded from env. The actual secret
 *  value is NEVER persisted in the Repo — we only persist the env-var
 *  name. */
export interface DeliveryChannelConfig {
  readonly channel: DeliveryChannel
  readonly enabled: boolean
  /** Env var name carrying the secret (e.g. "SLACK_WEBHOOK_URL"). */
  readonly secretEnvName: string | null
  /** Free-form base URL or host for HTTP-shape channels. */
  readonly baseUrl: string | null
}

/** Subscription = "this org wants this content kind delivered to these
 *  targets, filtered by these conditions". Resolved from env at startup. */
export interface WorkflowSubscription {
  readonly id: SubscriptionId
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  /** All targets that should receive the content. */
  readonly targets: readonly DeliveryTarget[]
  readonly filters: SubscriptionFilters
  readonly enabled: boolean
}

export interface SubscriptionFilters {
  /** Floor severity (intraday only). */
  readonly minSeverity?: AlertSeverity
  /** Restrict to held-only positions where applicable. */
  readonly heldOnly?: boolean
  /** Allow watchlist names too. Default true unless heldOnly is set. */
  readonly watchlistAllowed?: boolean
}

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'suppressed'         // fingerprint matched a recent delivery
  | 'retrying'
  | 'skipped_freshness'  // source dependencies were failing
  | 'skipped_empty'      // template returned no payload (nothing to say)

/** Cron-ish schedule. We don't run a real cron — schedules are evaluated
 *  by the Scheduler when `runDue(now)` is invoked (CLI today, daemon
 *  tomorrow). The shape is intentionally minimal. */
export interface DeliverySchedule {
  readonly id: DeliveryScheduleId
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  /** Human-readable schedule. Operators read this; the scheduler reads
   *  the parsed `cadence` below. */
  readonly cadenceLabel: string
  readonly cadence: ScheduleCadence
  readonly enabled: boolean
  readonly lastFiredAt: Iso8601 | null
  readonly nextDueAt: Iso8601 | null
  /** Created/updated timestamps. */
  readonly createdAt: Iso8601
  readonly updatedAt: Iso8601
}

export type ScheduleCadence =
  | { readonly kind: 'daily';   readonly atUtcHour: number; readonly atUtcMinute: number }
  | { readonly kind: 'weekly';  readonly atUtcHour: number; readonly atUtcMinute: number; readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { readonly kind: 'interval'; readonly everySeconds: number }
  | { readonly kind: 'event_driven' }   // fires only when an upstream event occurs

/** A scheduler tick that produced one rendered payload + N attempts. */
export interface DeliveryRun {
  readonly id: DeliveryRunId
  readonly orgId: OrgId
  readonly scheduleId: DeliveryScheduleId | null
  readonly contentKind: DeliveryContentKind
  readonly trigger: 'scheduled' | 'cli' | 'event' | 'retry'
  readonly startedAt: Iso8601
  readonly finishedAt: Iso8601
  readonly durationMs: number
  /** A stable hash of the rendered payload — used for dedup/suppression. */
  readonly fingerprint: string
  /** Snapshot of source-health gating at run time. */
  readonly freshnessGate: FreshnessGateOutcome
  readonly attemptIds: readonly DeliveryAttemptId[]
  readonly status: 'success' | 'partial' | 'failed' | 'suppressed' | 'skipped_freshness' | 'skipped_empty'
  /** Optional human-readable note (e.g. "all targets suppressed"). */
  readonly note: string | null
}

export interface FreshnessGateOutcome {
  readonly checked: boolean
  /** Source kinds the template depends on. */
  readonly dependsOn: readonly SourceKind[]
  /** Source kinds whose health blocked the run (`failing` defers). */
  readonly blockingFailing: readonly SourceKind[]
  /** Source kinds whose health degraded the payload (`stale` annotates). */
  readonly degradingStale: readonly SourceKind[]
  /** Final decision. */
  readonly decision: 'proceed' | 'proceed_degraded' | 'defer'
}

/** One attempt against one (run, target). Retries append more attempts. */
export interface DeliveryAttempt {
  readonly id: DeliveryAttemptId
  readonly runId: DeliveryRunId
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  readonly channel: DeliveryChannel
  readonly target: DeliveryTarget
  readonly attemptNumber: number
  readonly status: DeliveryStatus
  readonly fingerprint: string
  readonly enqueuedAt: Iso8601
  readonly sentAt: Iso8601 | null
  readonly latencyMs: number | null
  readonly errorCategory: DeliveryErrorCategory | null
  readonly errorMessage: string | null
  /** When status === 'retrying'. */
  readonly nextRetryAt: Iso8601 | null
  /** A short, channel-aware payload preview for the inbox. */
  readonly payloadSummary: DeliveryPayloadSummary
  /** Optional in-app body; null for non-in-app channels (the rich payload
   *  isn't persisted to keep the Repo small). */
  readonly inAppBody: string | null
  /** Optional click-through within the dashboard. */
  readonly clickThrough: DeliveryClickThrough | null
}

export type DeliveryErrorCategory =
  | 'transient_network'
  | 'transient_5xx'
  | 'auth'
  | 'rate_limit'
  | 'channel_disabled'
  | 'config'
  | 'render'
  | 'unknown'

/** A short, structured summary of what was delivered. Surfaced in the
 *  in-app inbox + the operator CLI. */
export interface DeliveryPayloadSummary {
  readonly title: string
  readonly subtitle: string
  /** A handful of leading bullet lines; renderers cap to ~5. */
  readonly bullets: readonly string[]
  /** Numeric counts the inbox can chip-render (e.g. "12 alerts · 3 critical"). */
  readonly counts: Readonly<Record<string, number>>
  /** Optional badge text (e.g. "DEGRADED", "STALE"). */
  readonly badges: readonly string[]
}

/** Where in the dashboard the delivered content corresponds to. The
 *  inbox uses this to deep-link. */
export interface DeliveryClickThrough {
  readonly tab: 'briefing' | 'mybook' | 'catalysts' | 'sources' | 'worklog'
  /** Optional id payload — `reportId`, `catalystId`, `sourceKind`. */
  readonly entityId: string | null
}

/** Full rendered payload — produced by templates, consumed by channels. */
export interface DeliveryPayload {
  readonly fingerprint: string
  readonly contentKind: DeliveryContentKind
  readonly subject: string
  readonly summary: DeliveryPayloadSummary
  /** Plain-text body (channel-agnostic). */
  readonly text: string
  /** Optional channel-specific blocks (markdown, html, slack blocks). */
  readonly markdown: string | null
  readonly slackBlocks: unknown[] | null
  readonly webhookJson: unknown | null
  readonly clickThrough: DeliveryClickThrough | null
}

/** Suppression record — keeps us from re-sending the same payload. */
export interface DeliverySuppression {
  readonly id: SuppressionId
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  readonly channel: DeliveryChannel
  readonly targetId: DeliveryTargetId
  readonly fingerprint: string
  readonly suppressedAt: Iso8601
  readonly expiresAt: Iso8601
  readonly reason: 'fingerprint_match' | 'manual' | 'rate_limit'
}

/** Dry-run shape — no attempts created, no suppression updated. */
export interface DeliveryPreview {
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  readonly generatedAt: Iso8601
  readonly freshnessGate: FreshnessGateOutcome
  readonly payload: DeliveryPayload | null
  /** What targets WOULD be hit. */
  readonly wouldDeliverTo: readonly DeliveryTarget[]
  /** What targets WOULD be suppressed. */
  readonly wouldSuppressFor: readonly DeliveryTarget[]
  /** Any reason no payload was rendered (e.g. "no critical alerts"). */
  readonly reason: string | null
}

/** Compatibility alias matching the spec wording. */
export type DeliveryRule = WorkflowSubscription

/** Compatibility alias matching the spec wording — the renderer config. */
export interface DeliveryTemplate {
  readonly contentKind: DeliveryContentKind
  readonly displayName: string
  readonly dependsOnSources: readonly SourceKind[]
  readonly suppressionTtlSeconds: number
}
