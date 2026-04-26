// ─────────────────────────────────────────────────────────────────────────
// Pure health calculator for a single source. No I/O.
//
// Given the source's config + recent sync runs + current watermark + error
// history, returns the canonical `SourceIntegration` record the adapter
// serves to the UI.
// ─────────────────────────────────────────────────────────────────────────

import type {
  SourceIntegration, SourceHealthStatus, SourceFreshness,
  SourceDegradedState, SourceError, SourceSyncRun, SourceWatermark,
  BackfillJob, SourceProviderMode, SourceKind,
} from '../../../src/domain'
import type { SourceConfig } from './config'
import { asSourceId } from '../../../src/lib/ids'

/** What modules visibly degrade when a given source kind is down. */
const AFFECTED_MODULES: Readonly<Record<SourceKind, readonly string[]>> = {
  raw_upstream:      ['Daily Worklog', 'My Book', 'By Broker', 'By Stock', 'Alerts & Briefing'],
  portfolio:         ['My Book', 'Daily Worklog (book overlay)', 'Catalysts (book filter)'],
  catalyst_calendar: ['Catalysts', 'Pre-event briefs'],
  market_data:       ['Calibration', 'Post-event reviews', 'Adaptive ranking (limited)'],
}

const FALLBACK_MODES: ReadonlyArray<SourceProviderMode> = ['fixture', 'mock', 'disabled']

export interface ComputeHealthInputs {
  readonly config: SourceConfig
  readonly runs: readonly SourceSyncRun[]
  readonly watermark: SourceWatermark | null
  readonly backfills: readonly BackfillJob[]
  readonly now?: Date
}

export function computeSourceIntegration(input: ComputeHealthInputs): SourceIntegration {
  const now = input.now ?? new Date()
  const sourceId = sourceIdFor(input.config)
  const runs = [...input.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const lastRun = runs[0] ?? null
  const lastSuccess = runs.find((r) => r.outcome === 'success' || r.outcome === 'partial') ?? null
  const lastFailure = runs.find((r) => r.outcome === 'failed') ?? null

  const lastSyncedAt = lastSuccess?.finishedAt ?? null
  const ageSeconds = lastSyncedAt
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(lastSyncedAt)) / 1000))
    : null
  const isStale = ageSeconds !== null && ageSeconds > input.config.stalenessThresholdSeconds
  const freshness: SourceFreshness = {
    lastSyncedAt,
    ageSeconds,
    stalenessThresholdSeconds: input.config.stalenessThresholdSeconds,
    isStale,
  }

  const lastError: SourceError | null = lastFailure?.error ?? null
  const status: SourceHealthStatus = computeStatus({
    providerMode: input.config.providerMode,
    lastSuccessAt: lastSyncedAt,
    lastRunOutcome: lastRun?.outcome ?? null,
    isStale,
    hasAnyRun: runs.length > 0,
  })

  const reasons: string[] = []
  if (input.config.providerMode === 'disabled') reasons.push('Source provider is disabled by config.')
  else if (input.config.providerMode === 'fixture') reasons.push('Serving fixture data.')
  else if (input.config.providerMode === 'mock')    reasons.push('Serving mock data.')
  if (status === 'failing' && lastError) reasons.push(`Last sync failed: ${lastError.message}`)
  if (status === 'stale' && ageSeconds !== null) {
    reasons.push(`Last successful sync was ${formatAge(ageSeconds)} ago (threshold ${formatAge(input.config.stalenessThresholdSeconds)}).`)
  }

  const degraded: SourceDegradedState = {
    reasons,
    affectedModules: status === 'healthy' ? [] : AFFECTED_MODULES[input.config.kind],
    servingFallback: FALLBACK_MODES.includes(input.config.providerMode),
  }

  const recentBackfills = [...input.backfills]
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 5)

  const nextScheduledAt: string | null = (() => {
    if (!input.config.pollIntervalSeconds) return null
    if (!lastSyncedAt) return null
    return new Date(Date.parse(lastSyncedAt) + input.config.pollIntervalSeconds * 1000).toISOString()
  })()

  return {
    id: sourceId,
    orgId: input.config.orgId,
    kind: input.config.kind,
    displayName: input.config.displayName,
    providerMode: input.config.providerMode,
    status,
    freshness,
    degraded,
    lastError,
    lastSuccessAt: lastSyncedAt,
    nextScheduledAt,
    recentRuns: runs.slice(0, 10),
    recentBackfills,
    watermark: input.watermark,
    config: {
      stalenessThresholdSeconds: input.config.stalenessThresholdSeconds,
      retryBackoffSeconds: input.config.retryBackoffSeconds,
      pollIntervalSeconds: input.config.pollIntervalSeconds,
      tokenEnvName: input.config.tokenEnvName,
      baseUrl: input.config.baseUrl,
    },
  }
}

interface StatusInputs {
  readonly providerMode: SourceProviderMode
  readonly lastSuccessAt: string | null
  readonly lastRunOutcome: SourceSyncRun['outcome'] | null
  readonly isStale: boolean
  readonly hasAnyRun: boolean
}

function computeStatus(s: StatusInputs): SourceHealthStatus {
  if (s.providerMode === 'disabled') return 'degraded'
  if (s.providerMode === 'fixture' || s.providerMode === 'mock') return 'degraded'
  if (!s.hasAnyRun) return 'unknown'
  if (s.lastRunOutcome === 'failed') return 'failing'
  if (s.isStale) return 'stale'
  if (s.lastSuccessAt) return 'healthy'
  return 'unknown'
}

/** Stable id derivation: `<orgId>::<kind>`. Lets the manager and the
 *  view-model agree on identity without a DB round-trip. */
export function sourceIdFor(config: SourceConfig): import('../../../src/domain').SourceId {
  return asSourceId(`${config.orgId as unknown as string}::${config.kind}`)
}

/** Aggregate per-source statuses into the org-level rollup. */
export function rollupOverallStatus(statuses: readonly SourceHealthStatus[]): SourceHealthStatus {
  if (statuses.length === 0) return 'unknown'
  if (statuses.includes('failing')) return 'failing'
  if (statuses.includes('stale')) return 'stale'
  if (statuses.every((s) => s === 'healthy')) return 'healthy'
  if (statuses.every((s) => s === 'degraded' || s === 'healthy')) return 'degraded'
  return 'degraded'
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
