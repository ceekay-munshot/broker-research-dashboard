// ─────────────────────────────────────────────────────────────────────────
// Module 26 — Client-side usage event emitter.
//
// Lightweight, fire-and-forget. The client buffers events in memory and
// flushes them in batches on a debounce + on tab visibility change.
// Errors during flush are swallowed — telemetry must NEVER break the
// dashboard.
//
// Privacy:
//  - no PII; only structured event types + entity ids
//  - no free-text user input
//  - all events are scoped to an org and tagged with a sessionId
// ─────────────────────────────────────────────────────────────────────────

import type {
  UsageEvent, OrgScope, UsageEventType, UsageSurface,
  UsageRankingMode, SourceHealthStatus, DeliveryContentKind,
} from '../domain'
import {
  asUsageEventId, asUsageSessionId, asUserId, asOrgId,
} from '../lib/ids'
import type { ResearchAdapter } from '../adapters'

const FLUSH_INTERVAL_MS = 5_000
const FLUSH_BATCH_MAX   = 25

export interface EmitInput {
  readonly eventType: UsageEventType
  readonly surface: UsageSurface
  readonly contentKind?: UsageEvent['contentKind']
  readonly entityId?: string | null
  readonly fromSurface?: UsageSurface | null
  readonly rankingMode?: UsageRankingMode
  readonly sourceHealth?: SourceHealthStatus
  readonly meta?: UsageEvent['meta']
}

class UsageClient {
  private adapter: ResearchAdapter | null = null
  private scope: OrgScope | null = null
  private sessionId = asUsageSessionId(`sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)
  private buffer: UsageEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private installedListeners = false

  configure(adapter: ResearchAdapter, scope: OrgScope): void {
    this.adapter = adapter
    this.scope = scope
    this.installListeners()
  }

  emit(input: EmitInput): void {
    if (!this.scope) return
    const event: UsageEvent = {
      id: asUsageEventId(`evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
      orgId: this.scope.orgId,
      userId: this.scope.actingUserId ?? null,
      sessionId: this.sessionId,
      eventType: input.eventType,
      surface: input.surface,
      contentKind: input.contentKind ?? null,
      entityId: input.entityId ?? null,
      fromSurface: input.fromSurface ?? null,
      rankingMode: input.rankingMode ?? 'baseline',
      sourceHealth: input.sourceHealth ?? 'unknown',
      occurredAt: new Date().toISOString(),
      meta: input.meta ?? {},
    }
    this.buffer.push(event)
    if (this.buffer.length >= FLUSH_BATCH_MAX) this.flush()
    else this.scheduleFlush()
  }

  flush(): void {
    if (!this.adapter || !this.scope || this.buffer.length === 0) return
    const batch = this.buffer.splice(0, this.buffer.length)
    // Fire-and-forget; swallow errors.
    void this.adapter.recordUsage(this.scope, batch).catch(() => { /* swallow */ })
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  private installListeners(): void {
    if (this.installedListeners || typeof window === 'undefined') return
    this.installedListeners = true
    // Flush on visibility hidden (user switching away).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush()
    })
    // Flush on unload as a last-ditch effort.
    window.addEventListener('beforeunload', () => this.flush())
  }
}

// Singleton — shared across all callers in the dashboard.
const _client = new UsageClient()
export function configureUsage(adapter: ResearchAdapter, scope: OrgScope): void {
  _client.configure(adapter, scope)
}
export function emitUsage(input: EmitInput): void {
  _client.emit(input)
}
export function flushUsage(): void {
  _client.flush()
}

/** Fallback no-op factory for non-browser contexts (tests, server). */
export function noopUsageClient(): typeof _client {
  return new UsageClient()
}

/** Test seam — lets unit tests inject a synthetic scope without an adapter. */
export function __setUsageScopeForTesting(orgId: string, userId: string | null): void {
  _client.configure(
    { recordUsage: async () => { /* no-op */ } } as unknown as ResearchAdapter,
    { orgId: asOrgId(orgId), actingUserId: userId ? asUserId(userId) : asUserId('test') },
  )
}

/** A small helper for components that need the canonical content-kind tag. */
export function contentKindFor(
  surface: UsageSurface,
  hint?: 'report' | 'alert' | 'catalyst' | 'pre_event_brief' | 'post_event_review',
): UsageEvent['contentKind'] {
  if (hint) return hint
  switch (surface) {
    case 'briefing':   return 'alert'
    case 'worklog':    return 'report'
    case 'catalysts':  return 'catalyst'
    case 'inbox':      return null
    default:           return null
  }
}

/** A type-only re-export so callers can avoid pulling from the domain barrel. */
export type { DeliveryContentKind }
