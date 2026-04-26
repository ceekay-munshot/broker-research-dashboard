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
  AlertEvent, AlertDigest, DigestRun, NotificationRecord,
  AlertId, DigestId, DigestRunId, DigestKind,
  CalibrationSnapshot, CalibrationSnapshotId,
  CatalystEvent, ExpectationSnapshot, PreEventBrief, PostEventReview,
  CatalystId, PreEventBriefId, PostEventReviewId,
} from '../../../src/domain'
import type {
  RawEmailArtifact, RawEmailArtifactJob, ReviewQueueItem,
} from '../pipeline/models'
import type { ProcessingState } from '../pipeline/states'
import type { PipelineErrorCategory } from '../pipeline/errors'
import type { MaterializationQuality } from '../pipeline/quality'
import type { CorrectionRule, CorrectionAuditEntry } from '../corrections/types'
import type { LlmCallRecord, LlmCacheEntry } from '../llm/types'

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

  // Correction rules (Module 16) ────────────────────────────────────────
  upsertCorrectionRule(rec: CorrectionRule): void
  getCorrectionRule(orgId: OrgId, id: string): CorrectionRule | null
  listCorrectionRules(orgId: OrgId, opts?: { readonly enabledOnly?: boolean }): readonly CorrectionRule[]
  /** Append an audit entry + optionally toggle `enabled` / `supersededBy`. */
  appendCorrectionAudit(orgId: OrgId, id: string, entry: CorrectionAuditEntry, patch?: {
    readonly enabled?: boolean
    readonly supersededBy?: string
  }): void
  /** Bump `applicationCount` (and optionally `reviewItemsResolved` /
   *  aggregate quality delta). Idempotent at runtime; persisted state
   *  reflects the latest cumulative totals. */
  bumpCorrectionImpact(orgId: OrgId, id: string, delta: {
    readonly applicationCount?: number
    readonly reviewItemsResolved?: number
    readonly aggregateQualityDelta?: number
  }): void

  // LLM call records + cache (Module 17) ────────────────────────────────
  appendLlmCallRecord(rec: LlmCallRecord): void
  listLlmCallRecords(orgId: OrgId, limit?: number): readonly LlmCallRecord[]
  /** All call records across orgs — used by `llm-stats` aggregation. */
  listAllLlmCallRecords(limit?: number): readonly LlmCallRecord[]
  upsertLlmCacheEntry(rec: LlmCacheEntry): void
  getLlmCacheEntry(orgId: OrgId, key: string): LlmCacheEntry | null
  /** Global lookup by cache key — the orchestrator's key is already
   *  collision-resistant (sha256 over taskId+promptVersion+model+bundle).
   *  Used by the provider's cache reader, which doesn't know orgId. */
  findLlmCacheEntryByKey(key: string): LlmCacheEntry | null

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

  // Alerts / digests / notifications (Module 19) ────────────────────────
  upsertAlertEvent(rec: AlertEvent): void
  getAlertEvent(orgId: OrgId, id: AlertId): AlertEvent | null
  listAlertEvents(
    orgId: OrgId,
    filter?: { sinceMs?: number; includeSuppressed?: boolean; limit?: number },
  ): readonly AlertEvent[]
  upsertAlertDigest(rec: AlertDigest): void
  getAlertDigest(orgId: OrgId, id: DigestId): AlertDigest | null
  listAlertDigests(
    orgId: OrgId,
    filter?: { kind?: DigestKind; limit?: number },
  ): readonly AlertDigest[]
  upsertDigestRun(rec: DigestRun): void
  getDigestRun(orgId: OrgId, id: DigestRunId): DigestRun | null
  listDigestRuns(orgId: OrgId, limit?: number): readonly DigestRun[]
  upsertNotification(rec: NotificationRecord): void
  listNotifications(orgId: OrgId, limit?: number): readonly NotificationRecord[]
  /** Hydration of alerts/digests for an org. */
  loadAlertsForOrg(orgId: OrgId): {
    readonly alerts: readonly AlertEvent[]
    readonly digests: readonly AlertDigest[]
    readonly digestRuns: readonly DigestRun[]
    readonly notifications: readonly NotificationRecord[]
  }

  // Calibration snapshots (Module 20) ───────────────────────────────────
  upsertCalibrationSnapshot(rec: CalibrationSnapshot): void
  getCalibrationSnapshot(orgId: OrgId, id: CalibrationSnapshotId): CalibrationSnapshot | null
  listCalibrationSnapshots(orgId: OrgId, limit?: number): readonly CalibrationSnapshot[]
  /** Most-recent snapshot for an org. */
  latestCalibrationSnapshot(orgId: OrgId): CalibrationSnapshot | null
  loadCalibrationForOrg(orgId: OrgId): { readonly snapshots: readonly CalibrationSnapshot[] }

  // Catalysts (Module 21) ───────────────────────────────────────────────
  upsertCatalyst(rec: CatalystEvent): void
  getCatalyst(orgId: OrgId, id: CatalystId): CatalystEvent | null
  listCatalysts(orgId: OrgId): readonly CatalystEvent[]
  upsertExpectationSnapshot(rec: ExpectationSnapshot): void
  listExpectationSnapshots(orgId: OrgId, catalystId: CatalystId): readonly ExpectationSnapshot[]
  /** Most-recent snapshot at-or-before the given moment, used for delta
   *  computation. Returns null if no prior snapshot exists. */
  priorExpectationSnapshot(orgId: OrgId, catalystId: string, atOrBefore: Date): ExpectationSnapshot | null
  upsertPreEventBrief(rec: PreEventBrief): void
  getPreEventBrief(orgId: OrgId, id: PreEventBriefId): PreEventBrief | null
  /** Latest brief for a given catalyst — what the UI loads. */
  latestPreEventBriefForCatalyst(orgId: OrgId, catalystId: CatalystId): PreEventBrief | null
  listPreEventBriefs(orgId: OrgId, limit?: number): readonly PreEventBrief[]
  upsertPostEventReview(rec: PostEventReview): void
  getPostEventReview(orgId: OrgId, id: PostEventReviewId): PostEventReview | null
  latestPostEventReviewForCatalyst(orgId: OrgId, catalystId: CatalystId): PostEventReview | null
  listPostEventReviews(orgId: OrgId, limit?: number): readonly PostEventReview[]
  loadCatalystsForOrg(orgId: OrgId): {
    readonly catalysts: readonly CatalystEvent[]
    readonly snapshots: readonly ExpectationSnapshot[]
    readonly briefs: readonly PreEventBrief[]
    readonly reviews: readonly PostEventReview[]
  }

  // Lifecycle ───────────────────────────────────────────────────────────
  /** Best-effort flush of any in-memory buffers to durable storage.
   *  No-op for InMemoryRepo. */
  flush(): void
}
