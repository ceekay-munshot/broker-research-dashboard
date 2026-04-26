// ─────────────────────────────────────────────────────────────────────────
// Module 26 — Pilot instrumentation + usage analytics + ROI domain.
//
// Lightweight, privacy-conscious telemetry. Each `UsageEvent` is a
// structured record that the client emits and the server aggregates.
// No free-text user input, no PII — just event types + entity ids +
// surface context.
//
// Usage flows:
//   client emits batch → POST /v1/usage/events
//                       → repo.appendUsageEvent
//   operator inspects   ← GET /v1/usage/snapshot   (org-level rollup)
//                       ← GET /v1/usage/roi        (pilot ROI bundle)
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, UserId } from './ids'
import type { Iso8601 } from './common'
import type { SourceHealthStatus } from './sources'
import type { DeliveryChannel, DeliveryContentKind } from './delivery'

declare const brand: unique symbol
export type UsageEventId   = string & { readonly [brand]: 'UsageEventId' }
export type UsageSessionId = string & { readonly [brand]: 'UsageSessionId' }

/** What the user actually did. Keep this list short — adding a new
 *  type requires a counter migration on the aggregator. */
export const USAGE_EVENT_TYPES = [
  'view_tab',
  'open_report',
  'open_alert',
  'open_catalyst',
  'open_brief',
  'open_post_event_review',
  'open_delivery',
  'click_through_delivery',
  'compare_toggle',
  'filter_change',
  'sort_change',
] as const
export type UsageEventType = typeof USAGE_EVENT_TYPES[number]

/** The dashboard surface where the event happened. Mirrors `tabs.ts`. */
export const USAGE_SURFACES = [
  'mybook', 'briefing', 'worklog', 'dashboard', 'broker', 'stock',
  'divergence', 'sector', 'calibration', 'catalysts', 'sources', 'inbox',
  'usage',
] as const
export type UsageSurface = typeof USAGE_SURFACES[number]

/** Which ranking mode was active when the event happened (Module 23
 *  context). The aggregator buckets opens by this. */
export type UsageRankingMode = 'baseline' | 'adaptive' | 'compare'

/** A single instrumented event. */
export interface UsageEvent {
  readonly id: UsageEventId
  readonly orgId: OrgId
  readonly userId: UserId | null
  readonly sessionId: UsageSessionId
  readonly eventType: UsageEventType
  readonly surface: UsageSurface
  readonly contentKind: DeliveryContentKind | 'report' | 'alert' | 'catalyst' | 'pre_event_brief' | 'post_event_review' | null
  /** Entity id the event refers to (reportId, alertId, catalystId, deliveryAttemptId). */
  readonly entityId: string | null
  /** Where the user came from when the event fired ("worklog" → "report_detail"). */
  readonly fromSurface: UsageSurface | null
  readonly rankingMode: UsageRankingMode
  /** Coarse health rollup at event time so usage is interpretable in
   *  light of degraded periods. */
  readonly sourceHealth: SourceHealthStatus
  readonly occurredAt: Iso8601
  /** Optional structured extras (filter name, sort key). Kept small. */
  readonly meta: Readonly<Record<string, string | number | boolean>>
}

/** A grouping of events from the same browser session. Sessions are
 *  client-generated and bookend a single dashboard mount. */
export interface UsageSession {
  readonly id: UsageSessionId
  readonly orgId: OrgId
  readonly userId: UserId | null
  readonly startedAt: Iso8601
  readonly endedAt: Iso8601 | null
  readonly eventCount: number
}

/** Per-content-kind engagement summary. */
export interface ContentEngagement {
  readonly contentKind: UsageEvent['contentKind']
  readonly opens: number
  readonly distinctEntities: number
  readonly distinctUsers: number
  readonly fromSurfaces: ReadonlyMap<UsageSurface, number>
}

/** Per-delivery (per content kind × channel) engagement. Drives
 *  delivery open-rate, click-through rate, and time-to-first-open. */
export interface DeliveryEngagement {
  readonly contentKind: DeliveryContentKind
  readonly channel: DeliveryChannel
  readonly delivered: number
  readonly opened: number
  readonly clickedThrough: number
  /** Median seconds from delivered → first open (in-app). Null when no opens. */
  readonly medianTimeToFirstOpenSeconds: number | null
}

/** Per-surface usage. */
export interface SurfaceUsageSummary {
  readonly surface: UsageSurface
  readonly views: number
  readonly distinctUsers: number
  readonly opensFromSurface: number
}

/** Org-level rollup. */
export interface OrgUsageSnapshot {
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  readonly windowStart: Iso8601
  readonly windowEnd: Iso8601
  readonly windowDays: number
  readonly totals: {
    readonly events: number
    readonly sessions: number
    readonly distinctUsers: number
    readonly opens: number
  }
  readonly dau: number
  readonly wau: number
  readonly surfaces: readonly SurfaceUsageSummary[]
  readonly contentEngagement: readonly ContentEngagement[]
  readonly deliveryEngagement: readonly DeliveryEngagement[]
  readonly rankingExperiment: RankingExperimentSummary
  /** Share of events that occurred while sources were healthy / degraded. */
  readonly sourceHealthMix: Readonly<Record<SourceHealthStatus, number>>
}

/** Baseline-vs-adaptive open behaviour (Module 23 ↔ Module 26). */
export interface RankingExperimentSummary {
  readonly mode: 'observed' | 'insufficient_signal'
  readonly baselineOpens: number
  readonly adaptiveOpens: number
  readonly compareModeOpens: number
  /** Opens within the first 5 surfaced items (baseline vs adaptive). */
  readonly top5Opens: { readonly baseline: number; readonly adaptive: number }
  readonly top10Opens: { readonly baseline: number; readonly adaptive: number }
  /** Median time from `view_tab` (worklog/briefing) → first open in
   *  baseline vs adaptive ranking modes. */
  readonly medianTimeToFirstOpenSeconds: {
    readonly baseline: number | null
    readonly adaptive: number | null
  }
  /** A short, hedged note ("Adaptive opens are 12% faster on the worklog;
   *  sample size is small. Treat as directional."). */
  readonly note: string
}

/** Per-channel engagement for the operator UI. */
export interface ChannelEngagementSummary {
  readonly channel: DeliveryChannel
  readonly delivered: number
  readonly opened: number
  readonly openRate: number | null
  readonly clickThroughRate: number | null
}

/** Open-depth: from a delivery / surface, how many further opens followed. */
export interface ReadDepthSummary {
  readonly source: 'inbox' | 'briefing' | 'worklog' | 'mybook' | 'catalysts'
  readonly sessionsWithOpens: number
  readonly medianOpensPerSession: number
  readonly p90OpensPerSession: number
}

/** ROI snapshot — the pilot review bundle. */
export interface PilotRoiSnapshot {
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  readonly windowDays: number
  readonly windowStart: Iso8601
  readonly windowEnd: Iso8601
  readonly metrics: {
    readonly morningBriefOpenRate: number | null
    readonly intradayCriticalOpenRate: number | null
    readonly clickThroughRate: number | null
    readonly avgOpensPerActiveDay: number
    readonly medianTimeToFirstImportantOpenSeconds: number | null
    readonly heldNameCriticalAlertOpenRate: number | null
    readonly heldNameReviewedBeforeCatalystRate: number | null
    readonly postEventReviewUsageRate: number | null
  }
  readonly channelEngagement: readonly ChannelEngagementSummary[]
  readonly readDepth: readonly ReadDepthSummary[]
  /** Hedged narrative for the pilot readout. */
  readonly headlines: readonly string[]
  /** Caveats — degraded source periods, low sample size, etc. */
  readonly caveats: readonly string[]
}
