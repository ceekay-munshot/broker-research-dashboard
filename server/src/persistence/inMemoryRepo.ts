import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  ResearchReport, ReportSummary, OrgId,
} from '../../../src/domain'
import type { ProcessingState } from '../pipeline/states'
import type { PipelineErrorCategory } from '../pipeline/errors'
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

  flush(): void { /* noop */ }
}
