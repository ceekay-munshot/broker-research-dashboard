// ─────────────────────────────────────────────────────────────────────────
// Sync runner.
//
// Pulls raw artifacts from the upstream client, persists them through
// the Repo (deduping by stable fingerprint), runs each *new* artifact
// through the pipeline, and writes both the raw record + the canonical
// /v1 entities + the per-org checkpoint.
//
// Idempotency is built in:
//   - `Repo.findRawEmailByFingerprint` filters out already-seen
//     artifacts before they ever touch the pipeline.
//   - The pipeline's IDs are deterministic (sha256 of stable inputs),
//     so even if a record sneaks through, the canonical writes are
//     upserts and produce no duplicates.
//   - The per-org checkpoint records the upstream cursor so the next
//     `syncOnce()` resumes where the last run left off.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId } from '../../../src/domain'
import type { Pipeline } from '../pipeline/pipeline'
import type {
  PersistedJob, PersistedRawEmail, PersistedReviewItem, Repo, SyncCheckpoint,
} from '../persistence/types'
import { rawEmailFingerprint } from '../persistence/idempotency'
import type { RawUpstreamClient } from './client'

export interface SyncRunOptions {
  readonly orgId: OrgId
  readonly client: RawUpstreamClient
  readonly repo: Repo
  readonly pipeline: Pipeline
  /** Override the cursor (use `null` to force a full backfill). When
   *  unset, the runner uses the org's checkpoint. */
  readonly cursorOverride?: string | null
  /** Override the `since` lower bound. */
  readonly sinceOverride?: string | null
  /** Cap pages fetched per run; protects against runaway pulls. */
  readonly maxPages?: number
}

export interface SyncRunResult {
  readonly orgId: OrgId
  readonly fetchedCount: number
  readonly newCount: number             // de-duped against prior fingerprints
  readonly materializedCount: number
  readonly failedCount: number
  readonly reviewCount: number
  readonly enrichmentDisabledCount: number
  readonly enrichmentFailedCount: number
  readonly durationMs: number
  readonly cursorAfter: string | null
}

export async function syncOnce(opts: SyncRunOptions): Promise<SyncRunResult> {
  const startMs = Date.now()
  const checkpoint = opts.repo.getCheckpoint(opts.orgId)
  let cursor = opts.cursorOverride !== undefined ? opts.cursorOverride : checkpoint?.lastCursor ?? null
  const since = opts.sinceOverride ?? checkpoint?.lastSyncedAt ?? null

  const maxPages = opts.maxPages ?? 50
  let fetched = 0
  let newCount = 0
  let materialized = 0
  let failed = 0
  let review = 0
  let enrichmentDisabled = 0
  let enrichmentFailed = 0

  for (let p = 0; p < maxPages; p++) {
    const page = await opts.client.fetchSince({
      orgId: opts.orgId, cursor, since,
    })
    if (page.items.length === 0) {
      cursor = page.nextCursor
      break
    }
    for (const row of page.items) {
      fetched++
      const fingerprint = rawEmailFingerprint(opts.orgId, row.artifact, row.upstreamId)
      // Idempotency check: have we seen this artifact before?
      const existing = opts.repo.findRawEmailByFingerprint(opts.orgId, fingerprint)
      if (existing && existing.state === 'materialized_ready') {
        // Already materialized — skip without re-running.
        continue
      }
      newCount++

      // Persist the raw record first so we can replay it later even
      // if the pipeline crashes mid-flight.
      const raw: PersistedRawEmail = {
        id: row.artifact.id,
        orgId: opts.orgId,
        upstreamId: row.upstreamId,
        messageId: row.artifact.envelope.messageId,
        fingerprint,
        receivedAt: row.artifact.receivedAt,
        fetchedAt: new Date().toISOString(),
        artifact: row.artifact,
        state: 'fetched_raw',
        errorCategory: null,
        errorDetail: null,
      }
      opts.repo.upsertRawEmail(raw)

      const result = await opts.pipeline.run(row.artifact)
      const job = result.job

      // Persist final state.
      opts.repo.updateRawEmailState(
        opts.orgId, raw.id, job.state,
        job.error?.category ?? null,
        job.error?.detail ?? null,
      )
      const persistedJob: PersistedJob = {
        id: `job_${row.artifact.id}_${Date.now()}`,
        rawEmailId: raw.id,
        orgId: opts.orgId,
        state: job.state,
        history: job.history,
        errorCategory: job.error?.category ?? null,
        errorDetail: job.error?.detail ?? null,
        startedAt: job.history[0]?.at ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
      opts.repo.appendJob(persistedJob)

      // Mirror review queue items into durable storage.
      for (const r of opts.pipeline.reviewQueue.list(opts.orgId)) {
        const persistedReview: PersistedReviewItem = {
          ...r, resolvedAt: null, resolutionNote: null,
        }
        opts.repo.upsertReviewItem(persistedReview)
      }

      // Counters.
      if (result.outcome === 'materialized_ready') materialized++
      else if (result.outcome === 'failed')         failed++
      else                                          review++

      // Track enrichment state by inspecting candidates.
      if (job.enriched) {
        for (const e of job.enriched) {
          if (e.enrichment === null) enrichmentDisabled++
        }
      }
      if (job.error?.category === 'LLM_FAILURE_FALLBACK') enrichmentFailed++
    }
    cursor = page.nextCursor
    if (cursor === null) break
  }

  const durationMs = Date.now() - startMs
  const next: SyncCheckpoint = {
    orgId: opts.orgId,
    lastCursor: cursor,
    lastSyncedAt: new Date().toISOString(),
    lastRunDurationMs: durationMs,
    lastFetchedCount: fetched,
    lastMaterializedCount: materialized,
    lastFailedCount: failed,
    lastReviewCount: review,
    lastEnrichmentDisabledCount: enrichmentDisabled,
    lastEnrichmentFailedCount: enrichmentFailed,
  }
  opts.repo.upsertCheckpoint(next)
  opts.repo.flush()

  return {
    orgId: opts.orgId,
    fetchedCount: fetched,
    newCount,
    materializedCount: materialized,
    failedCount: failed,
    reviewCount: review,
    enrichmentDisabledCount: enrichmentDisabled,
    enrichmentFailedCount: enrichmentFailed,
    durationMs,
    cursorAfter: cursor,
  }
}

// ── Replay ───────────────────────────────────────────────────────────────

export interface ReplayResult {
  readonly orgId: OrgId
  readonly artifactId: string
  readonly outcome: 'materialized_ready' | 'review_needed' | 'failed' | 'not_found'
  readonly errorCategory?: string | null
  readonly errorDetail?: string | null
}

/** Re-run the pipeline for one persisted raw artifact. The canonical
 *  IDs are deterministic, so this is an upsert — running it twice
 *  produces byte-identical canonical records. */
export async function replayOne(
  opts: { readonly orgId: OrgId; readonly artifactId: string; readonly repo: Repo; readonly pipeline: Pipeline },
): Promise<ReplayResult> {
  const raw = opts.repo.getRawEmail(opts.orgId, opts.artifactId)
  if (!raw) return { orgId: opts.orgId, artifactId: opts.artifactId, outcome: 'not_found' }
  const result = await opts.pipeline.run(raw.artifact)
  opts.repo.updateRawEmailState(
    opts.orgId, raw.id, result.job.state,
    result.job.error?.category ?? null,
    result.job.error?.detail ?? null,
  )
  opts.repo.appendJob({
    id: `job_${raw.id}_replay_${Date.now()}`,
    rawEmailId: raw.id,
    orgId: opts.orgId,
    state: result.job.state,
    history: result.job.history,
    errorCategory: result.job.error?.category ?? null,
    errorDetail: result.job.error?.detail ?? null,
    startedAt: result.job.history[0]?.at ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
  })
  opts.repo.flush()
  return {
    orgId: opts.orgId,
    artifactId: raw.id,
    outcome: result.outcome,
    errorCategory: result.job.error?.category ?? null,
    errorDetail: result.job.error?.detail ?? null,
  }
}

/** Replay every artifact currently in `failed` or `review_needed` state. */
export async function replayAllFailed(
  opts: { readonly orgId: OrgId; readonly repo: Repo; readonly pipeline: Pipeline },
): Promise<readonly ReplayResult[]> {
  const candidates = [
    ...opts.repo.listRawEmails(opts.orgId, { state: 'failed' }),
    ...opts.repo.listRawEmails(opts.orgId, { state: 'review_needed' }),
  ]
  const out: ReplayResult[] = []
  for (const c of candidates) {
    out.push(await replayOne({ orgId: opts.orgId, artifactId: c.id, repo: opts.repo, pipeline: opts.pipeline }))
  }
  return out
}
