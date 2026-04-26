// ─────────────────────────────────────────────────────────────────────────
// Module 24 — Source integrations + production health model.
//
// Every external input the system reads (raw research upstream, portfolio
// snapshots, catalyst calendars, market data) is registered as a
// `SourceIntegration` and tracked through a uniform health/freshness
// model. The dashboard reads `SourcesHealthSnapshot` via the canonical
// adapter interface; the server-side `SourceManager` populates it from
// `SourceSyncRun` history and `SourceWatermark` checkpoints.
//
// These types are the wire contract — they cross /v1 like any other
// domain type. Add cautiously.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId } from './ids'
import type { Iso8601 } from './common'

declare const brand: unique symbol

export type SourceId      = string & { readonly [brand]: 'SourceId' }
export type SyncRunId     = string & { readonly [brand]: 'SyncRunId' }
export type BackfillJobId = string & { readonly [brand]: 'BackfillJobId' }

/** Fixed canonical list of source kinds. Adding a new kind requires
 *  registering it in the server `SourceRegistry` + a migration plan. */
export const SOURCE_KINDS = [
  'raw_upstream',     // research email upstream (Module 13)
  'portfolio',        // portfolio + watchlist snapshot (Module 18)
  'catalyst_calendar', // catalyst events (Module 21)
  'market_data',      // daily prices + benchmarks (Module 20)
] as const
export type SourceKind = typeof SOURCE_KINDS[number]

/** What kind of provider is currently bound to this source. Drives the
 *  "real / fixture / degraded" badge in the operator UI. */
export type SourceProviderMode =
  | 'http'         // production HTTP-backed provider
  | 'fixture'      // local fixture (dev / demo)
  | 'mock'         // synthetic mock (tests)
  | 'disabled'     // no provider bound; system runs in degraded mode

export type SourceHealthStatus =
  | 'healthy'      // last sync succeeded recently and within freshness window
  | 'stale'        // last sync succeeded but is past staleness threshold
  | 'degraded'     // running in fixture/mock/disabled mode by config
  | 'failing'      // the most recent sync attempt failed
  | 'unknown'      // no sync run on record yet

/** Current freshness for a source: last-success timestamp + age + staleness. */
export interface SourceFreshness {
  readonly lastSyncedAt: Iso8601 | null
  readonly ageSeconds: number | null
  readonly stalenessThresholdSeconds: number
  readonly isStale: boolean
}

export interface SourceError {
  readonly category:
    | 'transient_network'
    | 'transient_5xx'
    | 'auth'
    | 'rate_limit'
    | 'shape_mismatch'
    | 'config'
    | 'provider_unavailable'
    | 'unknown'
  readonly message: string
  /** Last attempted-at timestamp. */
  readonly at: Iso8601
  /** Number of consecutive failures since the last success. */
  readonly consecutiveFailures: number
  /** When the next retry will be eligible (if scheduled). */
  readonly nextRetryAt: Iso8601 | null
}

/** A single sync attempt for a source. Persisted; the operator UI lists
 *  the most recent N runs per source. */
export interface SourceSyncRun {
  readonly id: SyncRunId
  readonly orgId: OrgId
  readonly sourceId: SourceId
  readonly sourceKind: SourceKind
  readonly providerMode: SourceProviderMode
  readonly startedAt: Iso8601
  readonly finishedAt: Iso8601
  readonly durationMs: number
  readonly outcome: 'success' | 'partial' | 'failed' | 'skipped'
  /** Items fetched (broker-source-meaningful unit: emails, prices, events). */
  readonly fetchedCount: number
  /** Items new vs already known (idempotent dedupe). */
  readonly newCount: number
  /** Watermark advanced by this run (cursor / since-timestamp). */
  readonly watermarkAfter: string | null
  /** Watermark before the run started. */
  readonly watermarkBefore: string | null
  /** Backfill window when this run was a backfill, otherwise null. */
  readonly backfillWindow: { readonly fromIso: string; readonly toIso: string } | null
  /** Trigger that caused the run. */
  readonly trigger: 'cli' | 'scheduled' | 'retry' | 'backfill' | 'startup'
  /** Error category + message when the run failed. */
  readonly error: SourceError | null
}

export type BackfillJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/** A queued or completed backfill request. The manager processes them in
 *  the order they're queued; the operator UI shows the queue. */
export interface BackfillJob {
  readonly id: BackfillJobId
  readonly orgId: OrgId
  readonly sourceId: SourceId
  readonly sourceKind: SourceKind
  readonly fromIso: string
  readonly toIso: string
  readonly requestedAt: Iso8601
  readonly requestedBy: string
  readonly state: BackfillJobState
  readonly startedAt: Iso8601 | null
  readonly finishedAt: Iso8601 | null
  readonly fetchedCount: number
  readonly newCount: number
  readonly note: string | null
}

/** Persisted watermark for a source. The string is opaque to the manager —
 *  each provider chooses its own shape (cursor, ISO date, sequence). */
export interface SourceWatermark {
  readonly orgId: OrgId
  readonly sourceId: SourceId
  readonly value: string | null
  readonly updatedAt: Iso8601
}

/** What's degraded right now — set by the manager based on current health. */
export interface SourceDegradedState {
  /** Why the source is not healthy. Empty when healthy. */
  readonly reasons: readonly string[]
  /** Modules / tabs whose UI will visibly degrade because of this. */
  readonly affectedModules: readonly string[]
  /** Whether the system is currently serving fixture/mock data for this source. */
  readonly servingFallback: boolean
}

/** Full per-source view used by the operator UI + degraded-mode wiring. */
export interface SourceIntegration {
  readonly id: SourceId
  readonly orgId: OrgId
  readonly kind: SourceKind
  readonly displayName: string
  readonly providerMode: SourceProviderMode
  readonly status: SourceHealthStatus
  readonly freshness: SourceFreshness
  readonly degraded: SourceDegradedState
  readonly lastError: SourceError | null
  readonly lastSuccessAt: Iso8601 | null
  readonly nextScheduledAt: Iso8601 | null
  readonly recentRuns: readonly SourceSyncRun[]
  readonly recentBackfills: readonly BackfillJob[]
  readonly watermark: SourceWatermark | null
  readonly config: {
    readonly stalenessThresholdSeconds: number
    readonly retryBackoffSeconds: number
    readonly pollIntervalSeconds: number | null
    readonly tokenEnvName: string | null
    readonly baseUrl: string | null
  }
}

/** What `/v1/sources/health` returns. Lives at the org level. */
export interface SourcesHealthSnapshot {
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  readonly overall: SourceHealthStatus
  readonly counts: {
    readonly total: number
    readonly healthy: number
    readonly stale: number
    readonly degraded: number
    readonly failing: number
    readonly unknown: number
  }
  readonly sources: readonly SourceIntegration[]
  /** Backfills currently queued or running. */
  readonly backfillsInFlight: readonly BackfillJob[]
}
