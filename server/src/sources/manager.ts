// ─────────────────────────────────────────────────────────────────────────
// SourceManager — orchestrates incremental sync, retry, backfill across
// all registered providers. Persists every sync run + watermark via the
// Repo seam so health/freshness state survives restarts.
//
// The dashboard never calls this directly; the CLI invokes per-command
// methods, and a future scheduler would invoke `syncDue()` periodically.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, SourceKind, SourceSyncRun, BackfillJob,
  SourcesHealthSnapshot, SourceIntegration, SourceError,
  BackfillJobId,
} from '../../../src/domain'
import type { Repo } from '../persistence'
import type { SourceRegistry } from './registry'
import {
  computeSourceIntegration, sourceIdFor, rollupOverallStatus,
} from './health'
import { asSyncRunId } from '../../../src/lib/ids'

export interface ManagerDeps {
  readonly repo: Repo
  readonly registry: SourceRegistry
  /** Override the clock for tests. */
  readonly now?: () => Date
  /** Override the random id generator for tests. */
  readonly genId?: (prefix: string) => string
}

export class SourceManager {
  constructor(private readonly deps: ManagerDeps) {}

  // ── Sync ───────────────────────────────────────────────────────────

  async syncOne(orgId: OrgId, kind: SourceKind, trigger: SourceSyncRun['trigger'] = 'cli'): Promise<SourceSyncRun> {
    const entry = this.deps.registry.get(orgId, kind)
    if (!entry) throw new Error(`SourceManager.syncOne: no provider for org=${orgId} kind=${kind}`)
    const sourceId = sourceIdFor(entry.config)
    const watermark = this.deps.repo.getSourceWatermark(orgId, sourceId)
    const startedAt = this.now().toISOString()
    const before = watermark?.value ?? null
    let outcome: SourceSyncRun['outcome'] = 'failed'
    let fetchedCount = 0, newCount = 0
    let watermarkAfter: string | null = before
    let error: SourceError | null = null
    try {
      const result = await entry.provider.sync({ watermark: before })
      outcome = result.outcome === 'success' ? 'success' : result.outcome === 'partial' ? 'partial' : 'skipped'
      fetchedCount = result.fetchedCount
      newCount = result.newCount
      watermarkAfter = result.watermarkAfter ?? before
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const consecutive = this.consecutiveFailureCount(orgId, sourceId) + 1
      error = {
        category: classifyError(e),
        message,
        at: this.now().toISOString(),
        consecutiveFailures: consecutive,
        nextRetryAt: this.scheduleRetry(entry.config.retryBackoffSeconds, consecutive),
      }
    }
    const finishedAt = this.now().toISOString()
    const run: SourceSyncRun = {
      id: this.id('run'),
      orgId,
      sourceId,
      sourceKind: kind,
      providerMode: entry.config.providerMode,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      outcome: error ? 'failed' : outcome,
      fetchedCount,
      newCount,
      watermarkBefore: before,
      watermarkAfter,
      backfillWindow: null,
      trigger,
      error,
    }
    this.deps.repo.appendSourceSyncRun(run)
    if (!error && watermarkAfter !== before) {
      this.deps.repo.upsertSourceWatermark({
        orgId, sourceId, value: watermarkAfter,
        updatedAt: finishedAt,
      })
    }
    this.deps.repo.flush()
    return run
  }

  async syncAll(orgId: OrgId, trigger: SourceSyncRun['trigger'] = 'cli'): Promise<readonly SourceSyncRun[]> {
    const out: SourceSyncRun[] = []
    for (const entry of this.deps.registry.listForOrg(orgId)) {
      // Skip sources whose providerMode says "do nothing".
      if (entry.config.providerMode === 'disabled') continue
      try {
        const run = await this.syncOne(orgId, entry.config.kind, trigger)
        out.push(run)
      } catch (e) {
        // Already persisted as a failed run; continue.
        void e
      }
    }
    return out
  }

  /** Retry sources whose last run failed and whose backoff has elapsed. */
  async retryFailures(orgId: OrgId): Promise<readonly SourceSyncRun[]> {
    const out: SourceSyncRun[] = []
    for (const entry of this.deps.registry.listForOrg(orgId)) {
      const sourceId = sourceIdFor(entry.config)
      const recent = this.deps.repo.listSourceSyncRuns(orgId, { sourceId, limit: 1 })
      const last = recent[0]
      if (!last || last.outcome !== 'failed') continue
      if (last.error?.nextRetryAt && Date.parse(last.error.nextRetryAt) > this.now().getTime()) continue
      const run = await this.syncOne(orgId, entry.config.kind, 'retry')
      out.push(run)
    }
    return out
  }

  // ── Backfill ───────────────────────────────────────────────────────

  /** Queue a backfill. The job is processed by `runBackfill()` (or a
   *  scheduler that polls `listBackfillJobs(state='queued')`). */
  queueBackfill(args: {
    orgId: OrgId
    kind: SourceKind
    fromIso: string
    toIso: string
    requestedBy: string
    note?: string | null
  }): BackfillJob {
    const entry = this.deps.registry.get(args.orgId, args.kind)
    if (!entry) throw new Error(`SourceManager.queueBackfill: no provider for ${args.kind}`)
    const sourceId = sourceIdFor(entry.config)
    const job: BackfillJob = {
      id: this.id('bf') as unknown as BackfillJobId,
      orgId: args.orgId,
      sourceId,
      sourceKind: args.kind,
      fromIso: args.fromIso,
      toIso: args.toIso,
      requestedAt: this.now().toISOString(),
      requestedBy: args.requestedBy,
      state: 'queued',
      startedAt: null,
      finishedAt: null,
      fetchedCount: 0,
      newCount: 0,
      note: args.note ?? null,
    }
    this.deps.repo.upsertBackfillJob(job)
    this.deps.repo.flush()
    return job
  }

  async runBackfill(orgId: OrgId, jobId: BackfillJobId): Promise<BackfillJob> {
    const job = this.deps.repo.getBackfillJob(orgId, jobId)
    if (!job) throw new Error(`backfill job ${jobId} not found`)
    if (job.state !== 'queued') return job

    const entry = this.deps.registry.get(orgId, job.sourceKind)
    if (!entry) {
      const failed: BackfillJob = {
        ...job, state: 'failed',
        startedAt: this.now().toISOString(),
        finishedAt: this.now().toISOString(),
        note: `no provider registered for ${job.sourceKind}`,
      }
      this.deps.repo.upsertBackfillJob(failed)
      this.deps.repo.flush()
      return failed
    }
    if (!entry.provider.backfill) {
      const failed: BackfillJob = {
        ...job, state: 'failed',
        startedAt: this.now().toISOString(),
        finishedAt: this.now().toISOString(),
        note: `provider for ${job.sourceKind} does not support backfill`,
      }
      this.deps.repo.upsertBackfillJob(failed)
      this.deps.repo.flush()
      return failed
    }
    const startedAt = this.now().toISOString()
    this.deps.repo.upsertBackfillJob({ ...job, state: 'running', startedAt })
    let fetched = 0, fresh = 0
    let outcome: SourceSyncRun['outcome'] = 'failed'
    let error: SourceError | null = null
    try {
      const result = await entry.provider.backfill({ fromIso: job.fromIso, toIso: job.toIso })
      fetched = result.fetchedCount
      fresh = result.newCount
      outcome = result.outcome === 'success' ? 'success' : 'partial'
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const sourceId = sourceIdFor(entry.config)
      const consecutive = this.consecutiveFailureCount(orgId, sourceId) + 1
      error = {
        category: classifyError(e),
        message,
        at: this.now().toISOString(),
        consecutiveFailures: consecutive,
        nextRetryAt: null,
      }
    }
    const finishedAt = this.now().toISOString()
    const finalState: BackfillJob['state'] = error ? 'failed' : 'completed'
    const finalJob: BackfillJob = {
      ...job, state: finalState, startedAt, finishedAt,
      fetchedCount: fetched, newCount: fresh,
      note: error ? error.message : null,
    }
    this.deps.repo.upsertBackfillJob(finalJob)
    // Also persist a SourceSyncRun so backfills show up in the run history.
    const run: SourceSyncRun = {
      id: this.id('run'),
      orgId,
      sourceId: sourceIdFor(entry.config),
      sourceKind: entry.config.kind,
      providerMode: entry.config.providerMode,
      startedAt, finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      outcome: error ? 'failed' : outcome,
      fetchedCount: fetched,
      newCount: fresh,
      watermarkBefore: null,
      watermarkAfter: null,
      backfillWindow: { fromIso: job.fromIso, toIso: job.toIso },
      trigger: 'backfill',
      error,
    }
    this.deps.repo.appendSourceSyncRun(run)
    this.deps.repo.flush()
    return finalJob
  }

  // ── Snapshot ───────────────────────────────────────────────────────

  /** Build the org-level health snapshot the adapter will return. */
  snapshot(orgId: OrgId): SourcesHealthSnapshot {
    const entries = this.deps.registry.listForOrg(orgId)
    const sources: SourceIntegration[] = entries.map((e) => {
      const sourceId = sourceIdFor(e.config)
      const runs = this.deps.repo.listSourceSyncRuns(orgId, { sourceId, limit: 20 })
      const watermark = this.deps.repo.getSourceWatermark(orgId, sourceId)
      const backfills = this.deps.repo.listBackfillJobs(orgId, { sourceId, limit: 10 })
      return computeSourceIntegration({
        config: e.config, runs, watermark, backfills, now: this.now(),
      })
    })
    const counts = {
      total: sources.length,
      healthy: sources.filter((s) => s.status === 'healthy').length,
      stale: sources.filter((s) => s.status === 'stale').length,
      degraded: sources.filter((s) => s.status === 'degraded').length,
      failing: sources.filter((s) => s.status === 'failing').length,
      unknown: sources.filter((s) => s.status === 'unknown').length,
    }
    const overall = rollupOverallStatus(sources.map((s) => s.status))
    const backfillsInFlight = this.deps.repo.listBackfillJobs(orgId).filter(
      (j) => j.state === 'queued' || j.state === 'running',
    )
    return {
      orgId,
      generatedAt: this.now().toISOString(),
      overall,
      counts,
      sources,
      backfillsInFlight,
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date()
  }
  private id(prefix: string): import('../../../src/domain').SyncRunId {
    const raw = this.deps.genId
      ? this.deps.genId(prefix)
      : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    return asSyncRunId(raw)
  }
  private consecutiveFailureCount(orgId: OrgId, sourceId: import('../../../src/domain').SourceId): number {
    const runs = this.deps.repo.listSourceSyncRuns(orgId, { sourceId, limit: 20 })
    let n = 0
    for (const r of runs) {
      if (r.outcome === 'failed') n++
      else break
    }
    return n
  }
  private scheduleRetry(backoffSeconds: number, consecutive: number): string {
    // Exponential with cap at 30m.
    const cap = 30 * 60
    const wait = Math.min(cap, backoffSeconds * Math.pow(2, Math.min(consecutive - 1, 6)))
    return new Date(this.now().getTime() + wait * 1000).toISOString()
  }
}

function classifyError(e: unknown): SourceError['category'] {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket')) return 'transient_network'
  if (msg.includes('http 5') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'transient_5xx'
  if (msg.includes('http 401') || msg.includes('http 403') || msg.includes('unauthorized') || msg.includes('forbidden')) return 'auth'
  if (msg.includes('http 429') || msg.includes('rate limit')) return 'rate_limit'
  if (msg.includes('shape') || msg.includes('invalid') || msg.includes('parse')) return 'shape_mismatch'
  if (msg.includes('config') || msg.includes('not configured')) return 'config'
  if (msg.includes('disabled') || msg.includes('no provider')) return 'provider_unavailable'
  return 'unknown'
}
