// ─────────────────────────────────────────────────────────────────────────
// Persistence layer types.
//
// `Repo` is the seam every part of the live-sync stack writes to and
// reads from. Three implementations ship with the repo:
//
//   InMemoryRepo  — for tests; volatile.
//   JsonFileRepo  — default; durable across process restarts; atomic
//                   writes; appropriate for per-tenant workloads of
//                   thousands of records.
//   SqliteRepo    — documented upgrade path; install `better-sqlite3`
//                   to enable. Same Repo interface; one-file swap.
//
// The canonical entities (BrokerEmail / Attachment / ResearchReport /
// ReportSummary / EvidenceSnippet / BrokerStockOpinion) are stored
// alongside the raw artifacts so a single `Repo` is the durable
// system-of-record for both pipeline state AND the data the `/v1` API
// serves.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  ResearchReport, ReportSummary, OrgId, ReportId,
} from '../../../src/domain'
import type {
  RawEmailArtifact, RawEmailArtifactJob, ReviewQueueItem,
} from '../pipeline/models'
import type { ProcessingState } from '../pipeline/states'
import type { PipelineErrorCategory } from '../pipeline/errors'
import type { MaterializationQuality } from '../pipeline/quality'

// ── Raw artifact records (mirror of what the upstream sent us) ───────────

/** A persisted raw artifact with its current processing state and the
 *  most recent job history. The artifact is canonical here — replays
 *  re-fetch from this record, never from the upstream. */
export interface PersistedRawEmail {
  readonly id: string                    // pipeline-internal id
  readonly orgId: OrgId
  readonly upstreamId: string            // raw upstream API's row id
  readonly messageId: string             // RFC 5322 Message-ID
  readonly fingerprint: string           // stable dedupe key
  readonly receivedAt: string
  readonly fetchedAt: string
  readonly artifact: RawEmailArtifact
  readonly state: ProcessingState
  readonly errorCategory: PipelineErrorCategory | null
  readonly errorDetail: string | null
}

/** Persisted job — one row per (rawEmailId, run). Newer rows are
 *  written on every replay so an operator can see the timeline. */
export interface PersistedJob {
  readonly id: string
  readonly rawEmailId: string
  readonly orgId: OrgId
  readonly state: ProcessingState
  readonly history: RawEmailArtifactJob['history']
  readonly errorCategory: PipelineErrorCategory | null
  readonly errorDetail: string | null
  readonly startedAt: string
  readonly completedAt: string | null
}

/** Persisted review-queue items — operator surface. */
export interface PersistedReviewItem extends ReviewQueueItem {
  readonly resolvedAt: string | null
  readonly resolutionNote: string | null
}

/** Per-org sync watermark + most-recent-run counters. Drives
 *  incremental sync and powers `/v1/ingestion-status`. */
export interface SyncCheckpoint {
  readonly orgId: OrgId
  readonly lastCursor: string | null
  readonly lastSyncedAt: string | null
  readonly lastRunDurationMs: number
  readonly lastFetchedCount: number
  readonly lastMaterializedCount: number
  readonly lastFailedCount: number
  readonly lastReviewCount: number
  readonly lastEnrichmentDisabledCount: number
  readonly lastEnrichmentFailedCount: number
}

// ── Repo interface ────────────────────────────────────────────────────────

export interface Repo {
  // Raw artifacts ───────────────────────────────────────────────────────
  upsertRawEmail(rec: PersistedRawEmail): void
  getRawEmail(orgId: OrgId, id: string): PersistedRawEmail | null
  /** Look up by stable fingerprint — used for dedupe during sync. */
  findRawEmailByFingerprint(orgId: OrgId, fingerprint: string): PersistedRawEmail | null
  listRawEmails(
    orgId: OrgId,
    filter?: { state?: ProcessingState; limit?: number },
  ): readonly PersistedRawEmail[]
  updateRawEmailState(
    orgId: OrgId, id: string, state: ProcessingState,
    errorCategory: PipelineErrorCategory | null, errorDetail: string | null,
  ): void

  // Jobs ────────────────────────────────────────────────────────────────
  appendJob(rec: PersistedJob): void
  listJobs(orgId: OrgId, filter?: { state?: ProcessingState; limit?: number }): readonly PersistedJob[]

  // Review queue ────────────────────────────────────────────────────────
  upsertReviewItem(rec: PersistedReviewItem): void
  listReviewItems(orgId: OrgId, includeResolved?: boolean): readonly PersistedReviewItem[]
  resolveReviewItem(orgId: OrgId, id: string, note: string): void

  // Sync checkpoints ────────────────────────────────────────────────────
  getCheckpoint(orgId: OrgId): SyncCheckpoint | null
  upsertCheckpoint(rec: SyncCheckpoint): void

  // Canonical entities ──────────────────────────────────────────────────
  // Mirrored 1:1 with InMemoryStore upserts. The HybridCanonicalStore
  // dual-writes here on every pipeline materialization.
  upsertBrokerEmail(rec: BrokerEmail): void
  upsertAttachments(recs: readonly Attachment[]): void
  upsertResearchReport(rec: ResearchReport): void
  upsertReportSummary(rec: ReportSummary): void
  upsertEvidence(recs: readonly EvidenceSnippet[]): void
  upsertOpinion(rec: BrokerStockOpinion): void

  // Quality metadata (Module 15) ────────────────────────────────────────
  upsertMaterializationQuality(rec: MaterializationQuality): void
  getMaterializationQuality(orgId: OrgId, reportId: ReportId): MaterializationQuality | null
  listMaterializationQuality(orgId: OrgId): readonly MaterializationQuality[]

  /** Hydration: dump everything for an org so `HybridCanonicalStore`
   *  can preload the in-memory cache on process startup. */
  loadCanonicalForOrg(orgId: OrgId): {
    readonly emails: readonly BrokerEmail[]
    readonly attachments: readonly Attachment[]
    readonly reports: readonly ResearchReport[]
    readonly summaries: readonly ReportSummary[]
    readonly evidence: readonly EvidenceSnippet[]
    readonly opinions: readonly BrokerStockOpinion[]
  }

  // Lifecycle ───────────────────────────────────────────────────────────
  /** Best-effort flush of any in-memory buffers to durable storage.
   *  No-op for InMemoryRepo. */
  flush(): void
}
