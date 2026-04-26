import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  ResearchReport, ReportSummary, OrgId, ReportId,
  AlertEvent, AlertDigest, DigestRun, NotificationRecord,
  AlertId, DigestId, DigestRunId, DigestKind,
  CalibrationSnapshot, CalibrationSnapshotId,
  CatalystEvent, ExpectationSnapshot, PreEventBrief, PostEventReview,
  CatalystId, PreEventBriefId, PostEventReviewId,
  SourceId, SourceKind, SourceSyncRun, SourceWatermark, BackfillJob,
  BackfillJobId, BackfillJobState,
} from '../../../src/domain'
import type { ProcessingState } from '../pipeline/states'
import type { PipelineErrorCategory } from '../pipeline/errors'
import type { MaterializationQuality } from '../pipeline/quality'
import type { CorrectionRule, CorrectionAuditEntry } from '../corrections/types'
import type { LlmCallRecord, LlmCacheEntry } from '../llm/types'
import type {
  PersistedJob, PersistedRawEmail, PersistedReviewItem,
  Repo, SyncCheckpoint,
} from './types'

/** Volatile repo used by the test harness. Fast, deterministic, no
 *  filesystem touch. Drop-in replacement for any other Repo. */
export class InMemoryRepo implements Repo {
  private readonly rawEmails = new Map<string, PersistedRawEmail>()
  private readonly jobs: PersistedJob[] = []
  private readonly review = new Map<string, PersistedReviewItem>()
  private readonly checkpoints = new Map<string, SyncCheckpoint>()

  private readonly canonicalEmails = new Map<string, BrokerEmail>()
  private readonly canonicalAttachments = new Map<string, Attachment>()
  private readonly canonicalReports = new Map<string, ResearchReport>()
  private readonly canonicalSummaries = new Map<string, ReportSummary>()
  private readonly canonicalEvidence = new Map<string, EvidenceSnippet>()
  private readonly canonicalOpinions: BrokerStockOpinion[] = []
  private readonly canonicalQuality = new Map<string, MaterializationQuality>()
  private readonly correctionRules = new Map<string, CorrectionRule>()
  private readonly llmCallRecords: LlmCallRecord[] = []
  private readonly llmCache = new Map<string, LlmCacheEntry>()

  // Module 19 — alerts / digests / notifications
  private readonly alertEvents = new Map<string, AlertEvent>()
  private readonly alertDigests = new Map<string, AlertDigest>()
  private readonly digestRuns = new Map<string, DigestRun>()
  private readonly notifications = new Map<string, NotificationRecord>()

  // Module 20 — calibration snapshots
  private readonly calibrationSnapshots = new Map<string, CalibrationSnapshot>()

  // Module 21 — catalysts / snapshots / briefs / reviews
  private readonly catalysts = new Map<string, CatalystEvent>()
  private readonly expectationSnapshots = new Map<string, ExpectationSnapshot>()
  private readonly preEventBriefs = new Map<string, PreEventBrief>()
  private readonly postEventReviews = new Map<string, PostEventReview>()

  // Module 24 — source integrations
  private readonly sourceSyncRuns: SourceSyncRun[] = []
  private readonly sourceWatermarks = new Map<string, SourceWatermark>()
  private readonly backfillJobs = new Map<string, BackfillJob>()

  // ── Raw artifacts ────────────────────────────────────────────────────
  upsertRawEmail(rec: PersistedRawEmail): void { this.rawEmails.set(rec.id, rec) }
  getRawEmail(orgId: OrgId, id: string): PersistedRawEmail | null {
    const r = this.rawEmails.get(id)
    return r && r.orgId === orgId ? r : null
  }
  findRawEmailByFingerprint(orgId: OrgId, fingerprint: string): PersistedRawEmail | null {
    for (const r of this.rawEmails.values()) {
      if (r.orgId === orgId && r.fingerprint === fingerprint) return r
    }
    return null
  }
  listRawEmails(orgId: OrgId, filter?: { state?: ProcessingState; limit?: number }): readonly PersistedRawEmail[] {
    let arr = [...this.rawEmails.values()].filter((r) => r.orgId === orgId)
    if (filter?.state) arr = arr.filter((r) => r.state === filter.state)
    arr.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }
  updateRawEmailState(
    orgId: OrgId, id: string, state: ProcessingState,
    errorCategory: PipelineErrorCategory | null, errorDetail: string | null,
  ): void {
    const cur = this.getRawEmail(orgId, id)
    if (!cur) return
    this.rawEmails.set(id, { ...cur, state, errorCategory, errorDetail })
  }

  // ── Jobs ─────────────────────────────────────────────────────────────
  appendJob(rec: PersistedJob): void { this.jobs.push(rec) }
  listJobs(orgId: OrgId, filter?: { state?: ProcessingState; limit?: number }): readonly PersistedJob[] {
    let arr = this.jobs.filter((j) => j.orgId === orgId)
    if (filter?.state) arr = arr.filter((j) => j.state === filter.state)
    arr.sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }

  // ── Review queue ─────────────────────────────────────────────────────
  upsertReviewItem(rec: PersistedReviewItem): void { this.review.set(rec.id, rec) }
  listReviewItems(orgId: OrgId, includeResolved = false): readonly PersistedReviewItem[] {
    return [...this.review.values()]
      .filter((r) => r.orgId === orgId && (includeResolved || r.resolvedAt === null))
      .sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt))
  }
  resolveReviewItem(orgId: OrgId, id: string, note: string): void {
    const cur = this.review.get(id)
    if (!cur || cur.orgId !== orgId) return
    this.review.set(id, { ...cur, resolvedAt: new Date().toISOString(), resolutionNote: note })
  }

  // ── Sync checkpoints ─────────────────────────────────────────────────
  getCheckpoint(orgId: OrgId): SyncCheckpoint | null {
    return this.checkpoints.get(orgId as unknown as string) ?? null
  }
  upsertCheckpoint(rec: SyncCheckpoint): void {
    this.checkpoints.set(rec.orgId as unknown as string, rec)
  }

  // ── Canonical entities ──────────────────────────────────────────────
  upsertBrokerEmail(rec: BrokerEmail): void { this.canonicalEmails.set(rec.id as unknown as string, rec) }
  upsertAttachments(recs: readonly Attachment[]): void {
    for (const a of recs) this.canonicalAttachments.set(a.id as unknown as string, a)
  }
  upsertResearchReport(rec: ResearchReport): void {
    this.canonicalReports.set(rec.id as unknown as string, rec)
  }
  upsertReportSummary(rec: ReportSummary): void {
    this.canonicalSummaries.set(rec.id as unknown as string, rec)
  }
  upsertEvidence(recs: readonly EvidenceSnippet[]): void {
    for (const e of recs) this.canonicalEvidence.set(e.id as unknown as string, e)
  }
  upsertOpinion(rec: BrokerStockOpinion): void {
    const i = this.canonicalOpinions.findIndex(
      (o) => o.orgId === rec.orgId && o.brokerId === rec.brokerId && o.ticker === rec.ticker,
    )
    if (i >= 0) this.canonicalOpinions[i] = rec
    else this.canonicalOpinions.push(rec)
  }

  // ── Quality (Module 15) ─────────────────────────────────────────────
  upsertMaterializationQuality(rec: MaterializationQuality): void {
    this.canonicalQuality.set(rec.reportId as unknown as string, rec)
  }
  getMaterializationQuality(orgId: OrgId, reportId: ReportId): MaterializationQuality | null {
    const q = this.canonicalQuality.get(reportId as unknown as string)
    return q && q.orgId === orgId ? q : null
  }
  listMaterializationQuality(orgId: OrgId): readonly MaterializationQuality[] {
    return [...this.canonicalQuality.values()].filter((q) => q.orgId === orgId)
  }
  loadCanonicalForOrg(orgId: OrgId) {
    return {
      emails:      [...this.canonicalEmails.values()].filter((e) => e.orgId === orgId),
      attachments: [...this.canonicalAttachments.values()].filter((a) => a.orgId === orgId),
      reports:     [...this.canonicalReports.values()].filter((r) => r.orgId === orgId),
      summaries:   [...this.canonicalSummaries.values()].filter((s) => s.orgId === orgId),
      evidence:    [...this.canonicalEvidence.values()].filter((e) => e.orgId === orgId),
      opinions:    this.canonicalOpinions.filter((o) => o.orgId === orgId),
    }
  }

  // ── Correction rules (Module 16) ────────────────────────────────────
  upsertCorrectionRule(rec: CorrectionRule): void { this.correctionRules.set(rec.id, rec) }
  getCorrectionRule(orgId: OrgId, id: string): CorrectionRule | null {
    const r = this.correctionRules.get(id)
    return r && r.orgId === orgId ? r : null
  }
  listCorrectionRules(orgId: OrgId, opts?: { enabledOnly?: boolean }): readonly CorrectionRule[] {
    let arr = [...this.correctionRules.values()].filter((r) => r.orgId === orgId)
    if (opts?.enabledOnly) arr = arr.filter((r) => r.enabled && !r.supersededBy)
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return arr
  }
  appendCorrectionAudit(
    orgId: OrgId, id: string, entry: CorrectionAuditEntry,
    patch?: { enabled?: boolean; supersededBy?: string },
  ): void {
    const cur = this.getCorrectionRule(orgId, id)
    if (!cur) return
    const next: CorrectionRule = {
      ...cur,
      enabled: patch?.enabled ?? cur.enabled,
      supersededBy: patch?.supersededBy ?? cur.supersededBy,
      audit: [...cur.audit, entry],
    }
    this.correctionRules.set(id, next)
  }
  bumpCorrectionImpact(orgId: OrgId, id: string, delta: {
    applicationCount?: number; reviewItemsResolved?: number; aggregateQualityDelta?: number
  }): void {
    const cur = this.getCorrectionRule(orgId, id)
    if (!cur) return
    const next: CorrectionRule = {
      ...cur,
      applicationCount:      cur.applicationCount      + (delta.applicationCount      ?? 0),
      reviewItemsResolved:   cur.reviewItemsResolved   + (delta.reviewItemsResolved   ?? 0),
      aggregateQualityDelta: cur.aggregateQualityDelta + (delta.aggregateQualityDelta ?? 0),
    }
    this.correctionRules.set(id, next)
  }

  // ── LLM (Module 17) ─────────────────────────────────────────────────
  appendLlmCallRecord(rec: LlmCallRecord): void { this.llmCallRecords.push(rec) }
  listLlmCallRecords(orgId: OrgId, limit?: number): readonly LlmCallRecord[] {
    const all = this.llmCallRecords.filter((r) => r.orgId === orgId).sort((a, b) => b.at.localeCompare(a.at))
    return limit ? all.slice(0, limit) : all
  }
  listAllLlmCallRecords(limit?: number): readonly LlmCallRecord[] {
    const all = [...this.llmCallRecords].sort((a, b) => b.at.localeCompare(a.at))
    return limit ? all.slice(0, limit) : all
  }
  upsertLlmCacheEntry(rec: LlmCacheEntry): void { this.llmCache.set(rec.key, rec) }
  getLlmCacheEntry(orgId: OrgId, key: string): LlmCacheEntry | null {
    const e = this.llmCache.get(key)
    return e && e.orgId === orgId ? e : null
  }
  findLlmCacheEntryByKey(key: string): LlmCacheEntry | null {
    return this.llmCache.get(key) ?? null
  }

  // ── Alerts (Module 19) ──────────────────────────────────────────────

  upsertAlertEvent(rec: AlertEvent): void {
    this.alertEvents.set(rec.id as unknown as string, rec)
  }
  getAlertEvent(orgId: OrgId, id: AlertId): AlertEvent | null {
    const a = this.alertEvents.get(id as unknown as string)
    return a && a.orgId === orgId ? a : null
  }
  listAlertEvents(
    orgId: OrgId,
    filter?: { sinceMs?: number; includeSuppressed?: boolean; limit?: number },
  ): readonly AlertEvent[] {
    let arr = [...this.alertEvents.values()].filter((a) => a.orgId === orgId)
    if (filter?.sinceMs !== undefined) {
      arr = arr.filter((a) => Date.parse(a.generatedAt) >= filter.sinceMs!)
    }
    if (!filter?.includeSuppressed) arr = arr.filter((a) => !a.suppressed)
    arr.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }

  upsertAlertDigest(rec: AlertDigest): void {
    this.alertDigests.set(rec.id as unknown as string, rec)
  }
  getAlertDigest(orgId: OrgId, id: DigestId): AlertDigest | null {
    const d = this.alertDigests.get(id as unknown as string)
    return d && d.orgId === orgId ? d : null
  }
  listAlertDigests(
    orgId: OrgId,
    filter?: { kind?: DigestKind; limit?: number },
  ): readonly AlertDigest[] {
    let arr = [...this.alertDigests.values()].filter((d) => d.orgId === orgId)
    if (filter?.kind) arr = arr.filter((d) => d.kind === filter.kind)
    arr.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }

  upsertDigestRun(rec: DigestRun): void {
    this.digestRuns.set(rec.id as unknown as string, rec)
  }
  getDigestRun(orgId: OrgId, id: DigestRunId): DigestRun | null {
    const r = this.digestRuns.get(id as unknown as string)
    return r && r.orgId === orgId ? r : null
  }
  listDigestRuns(orgId: OrgId, limit?: number): readonly DigestRun[] {
    const arr = [...this.digestRuns.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  upsertNotification(rec: NotificationRecord): void {
    this.notifications.set(rec.id as unknown as string, rec)
  }
  listNotifications(orgId: OrgId, limit?: number): readonly NotificationRecord[] {
    const arr = [...this.notifications.values()]
      .filter((n) => n.orgId === orgId)
      .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  loadAlertsForOrg(orgId: OrgId): {
    alerts: readonly AlertEvent[]; digests: readonly AlertDigest[];
    digestRuns: readonly DigestRun[]; notifications: readonly NotificationRecord[]
  } {
    return {
      alerts:        this.listAlertEvents(orgId, { includeSuppressed: true }),
      digests:       this.listAlertDigests(orgId),
      digestRuns:    this.listDigestRuns(orgId),
      notifications: this.listNotifications(orgId),
    }
  }

  // ── Calibration snapshots (Module 20) ───────────────────────────────

  upsertCalibrationSnapshot(rec: CalibrationSnapshot): void {
    this.calibrationSnapshots.set(rec.id as unknown as string, rec)
  }
  getCalibrationSnapshot(orgId: OrgId, id: CalibrationSnapshotId): CalibrationSnapshot | null {
    const r = this.calibrationSnapshots.get(id as unknown as string)
    return r && r.orgId === orgId ? r : null
  }
  listCalibrationSnapshots(orgId: OrgId, limit?: number): readonly CalibrationSnapshot[] {
    const arr = [...this.calibrationSnapshots.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return limit ? arr.slice(0, limit) : arr
  }
  latestCalibrationSnapshot(orgId: OrgId): CalibrationSnapshot | null {
    return this.listCalibrationSnapshots(orgId, 1)[0] ?? null
  }
  loadCalibrationForOrg(orgId: OrgId): { snapshots: readonly CalibrationSnapshot[] } {
    return { snapshots: this.listCalibrationSnapshots(orgId) }
  }

  // ── Catalysts (Module 21) ───────────────────────────────────────────

  upsertCatalyst(rec: CatalystEvent): void {
    this.catalysts.set(rec.id as unknown as string, rec)
  }
  getCatalyst(orgId: OrgId, id: CatalystId): CatalystEvent | null {
    const c = this.catalysts.get(id as unknown as string)
    return c && c.orgId === orgId ? c : null
  }
  listCatalysts(orgId: OrgId): readonly CatalystEvent[] {
    return [...this.catalysts.values()]
      .filter((c) => c.orgId === orgId)
      .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
  }

  upsertExpectationSnapshot(rec: ExpectationSnapshot): void {
    const k = `${rec.catalystId as unknown as string}|${rec.asOf}`
    this.expectationSnapshots.set(k, rec)
  }
  listExpectationSnapshots(orgId: OrgId, catalystId: CatalystId): readonly ExpectationSnapshot[] {
    return [...this.expectationSnapshots.values()]
      .filter((s) => s.orgId === orgId && s.catalystId === catalystId)
      .sort((a, b) => a.asOf.localeCompare(b.asOf))
  }
  priorExpectationSnapshot(orgId: OrgId, catalystId: string, atOrBefore: Date): ExpectationSnapshot | null {
    const cutoff = atOrBefore.getTime()
    let best: ExpectationSnapshot | null = null
    for (const s of this.expectationSnapshots.values()) {
      if (s.orgId !== orgId) continue
      if ((s.catalystId as unknown as string) !== catalystId) continue
      const t = Date.parse(s.asOf)
      if (t > cutoff) continue
      if (!best || Date.parse(s.asOf) > Date.parse(best.asOf)) best = s
    }
    return best
  }

  upsertPreEventBrief(rec: PreEventBrief): void {
    this.preEventBriefs.set(rec.id as unknown as string, rec)
  }
  getPreEventBrief(orgId: OrgId, id: PreEventBriefId): PreEventBrief | null {
    const b = this.preEventBriefs.get(id as unknown as string)
    return b && b.orgId === orgId ? b : null
  }
  latestPreEventBriefForCatalyst(orgId: OrgId, catalystId: CatalystId): PreEventBrief | null {
    let best: PreEventBrief | null = null
    for (const b of this.preEventBriefs.values()) {
      if (b.orgId !== orgId) continue
      if (b.catalystId !== catalystId) continue
      if (!best || b.generatedAt > best.generatedAt) best = b
    }
    return best
  }
  listPreEventBriefs(orgId: OrgId, limit?: number): readonly PreEventBrief[] {
    const arr = [...this.preEventBriefs.values()]
      .filter((b) => b.orgId === orgId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  upsertPostEventReview(rec: PostEventReview): void {
    this.postEventReviews.set(rec.id as unknown as string, rec)
  }
  getPostEventReview(orgId: OrgId, id: PostEventReviewId): PostEventReview | null {
    const r = this.postEventReviews.get(id as unknown as string)
    return r && r.orgId === orgId ? r : null
  }
  latestPostEventReviewForCatalyst(orgId: OrgId, catalystId: CatalystId): PostEventReview | null {
    let best: PostEventReview | null = null
    for (const r of this.postEventReviews.values()) {
      if (r.orgId !== orgId) continue
      if (r.catalystId !== catalystId) continue
      if (!best || r.generatedAt > best.generatedAt) best = r
    }
    return best
  }
  listPostEventReviews(orgId: OrgId, limit?: number): readonly PostEventReview[] {
    const arr = [...this.postEventReviews.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  loadCatalystsForOrg(orgId: OrgId): {
    catalysts: readonly CatalystEvent[]; snapshots: readonly ExpectationSnapshot[];
    briefs: readonly PreEventBrief[]; reviews: readonly PostEventReview[]
  } {
    return {
      catalysts: this.listCatalysts(orgId),
      snapshots: [...this.expectationSnapshots.values()].filter((s) => s.orgId === orgId),
      briefs: this.listPreEventBriefs(orgId),
      reviews: this.listPostEventReviews(orgId),
    }
  }

  // ── Module 24: source integrations ─────────────────────────────────
  appendSourceSyncRun(rec: SourceSyncRun): void {
    this.sourceSyncRuns.push(rec)
  }
  listSourceSyncRuns(orgId: OrgId, filter?: {
    sourceId?: SourceId; sourceKind?: SourceKind; limit?: number
  }): readonly SourceSyncRun[] {
    let arr = this.sourceSyncRuns.filter((r) => r.orgId === orgId)
    if (filter?.sourceId) arr = arr.filter((r) => r.sourceId === filter.sourceId)
    if (filter?.sourceKind) arr = arr.filter((r) => r.sourceKind === filter.sourceKind)
    arr.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }
  getSourceWatermark(orgId: OrgId, sourceId: SourceId): SourceWatermark | null {
    return this.sourceWatermarks.get(`${orgId}::${sourceId}`) ?? null
  }
  upsertSourceWatermark(rec: SourceWatermark): void {
    this.sourceWatermarks.set(`${rec.orgId}::${rec.sourceId}`, rec)
  }
  upsertBackfillJob(rec: BackfillJob): void { this.backfillJobs.set(rec.id as string, rec) }
  getBackfillJob(orgId: OrgId, id: BackfillJobId): BackfillJob | null {
    const j = this.backfillJobs.get(id as string)
    return j && j.orgId === orgId ? j : null
  }
  listBackfillJobs(orgId: OrgId, filter?: {
    sourceId?: SourceId; state?: BackfillJobState; limit?: number
  }): readonly BackfillJob[] {
    let arr = [...this.backfillJobs.values()].filter((j) => j.orgId === orgId)
    if (filter?.sourceId) arr = arr.filter((j) => j.sourceId === filter.sourceId)
    if (filter?.state)    arr = arr.filter((j) => j.state === filter.state)
    arr.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }
  loadSourcesForOrg(orgId: OrgId): {
    syncRuns: readonly SourceSyncRun[]
    watermarks: readonly SourceWatermark[]
    backfills: readonly BackfillJob[]
  } {
    return {
      syncRuns: this.listSourceSyncRuns(orgId),
      watermarks: [...this.sourceWatermarks.values()].filter((w) => w.orgId === orgId),
      backfills: this.listBackfillJobs(orgId),
    }
  }

  flush(): void { /* noop */ }
}
