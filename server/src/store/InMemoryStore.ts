import type {
  BrokerEmail, Attachment, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion,
  AttachmentId, EmailId, EvidenceId, ReportId, SummaryId, StockTicker,
  OrgId,
  AlertEvent, AlertDigest, DigestRun, NotificationRecord,
  AlertId, DigestId, DigestRunId, DigestKind,
  CalibrationSnapshot, CalibrationSnapshotId,
} from '../../../src/domain'

// Minimal in-memory record store. Ingestion writes; API reads. The whole
// state reboots with the process, which matches the "prove the pipeline"
// scope. A real backend replaces this with a database (Postgres / DynamoDB
// / Supabase) — the interface stays the same.

export class InMemoryStore {
  // All maps are keyed by the canonical id; values carry orgId so every
  // read still needs an org filter to enforce tenancy.
  private readonly emails = new Map<EmailId, BrokerEmail>()
  private readonly attachments = new Map<AttachmentId, Attachment>()
  private readonly reports = new Map<ReportId, ResearchReport>()
  private readonly summaries = new Map<SummaryId, ReportSummary>()
  private readonly evidenceById = new Map<EvidenceId, EvidenceSnippet>()
  private readonly opinions: BrokerStockOpinion[] = []
  // Module 19 — alerts/digest collections.
  private readonly alerts = new Map<AlertId, AlertEvent>()
  private readonly digests = new Map<DigestId, AlertDigest>()
  private readonly digestRuns = new Map<DigestRunId, DigestRun>()
  private readonly notifications: NotificationRecord[] = []
  // Module 20 — calibration snapshots
  private readonly calibrationSnapshots = new Map<CalibrationSnapshotId, CalibrationSnapshot>()

  // ── Writers (used by ingestion) ───────────────────────────────────

  upsertEmail(email: BrokerEmail): void { this.emails.set(email.id, email) }
  upsertAttachments(atts: readonly Attachment[]): void {
    for (const a of atts) this.attachments.set(a.id, a)
  }
  upsertReport(r: ResearchReport): void { this.reports.set(r.id, r) }
  upsertSummary(s: ReportSummary): void { this.summaries.set(s.id, s) }
  upsertEvidence(items: readonly EvidenceSnippet[]): void {
    for (const e of items) this.evidenceById.set(e.id, e)
  }
  upsertOpinion(o: BrokerStockOpinion): void {
    // One opinion per (orgId, brokerId, ticker) — upsert by replacing.
    const i = this.opinions.findIndex(
      (x) => x.orgId === o.orgId && x.brokerId === o.brokerId && x.ticker === o.ticker,
    )
    if (i >= 0) this.opinions[i] = o
    else this.opinions.push(o)
  }

  reset(): void {
    this.emails.clear()
    this.attachments.clear()
    this.reports.clear()
    this.summaries.clear()
    this.evidenceById.clear()
    this.opinions.length = 0
    this.alerts.clear()
    this.digests.clear()
    this.digestRuns.clear()
    this.notifications.length = 0
    this.calibrationSnapshots.clear()
  }

  // ── Readers (used by API handlers) ────────────────────────────────

  getEmail(orgId: OrgId, id: EmailId): BrokerEmail | null {
    const e = this.emails.get(id)
    return e && e.orgId === orgId ? e : null
  }
  listEmails(orgId: OrgId): BrokerEmail[] {
    return [...this.emails.values()]
      .filter((e) => e.orgId === orgId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }
  listAttachmentsForEmail(orgId: OrgId, emailId: EmailId): Attachment[] {
    return [...this.attachments.values()].filter((a) => a.orgId === orgId && a.emailId === emailId)
  }

  getReport(orgId: OrgId, id: ReportId): ResearchReport | null {
    const r = this.reports.get(id)
    return r && r.orgId === orgId ? r : null
  }
  listReports(orgId: OrgId): ResearchReport[] {
    return [...this.reports.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  getSummaryForReport(orgId: OrgId, reportId: ReportId): ReportSummary | null {
    for (const s of this.summaries.values()) {
      if (s.orgId === orgId && s.reportId === reportId) return s
    }
    return null
  }
  listSummaries(orgId: OrgId): ReportSummary[] {
    return [...this.summaries.values()].filter((s) => s.orgId === orgId)
  }

  listEvidenceForReport(orgId: OrgId, reportId: ReportId): EvidenceSnippet[] {
    return [...this.evidenceById.values()].filter((e) => e.orgId === orgId && e.reportId === reportId)
  }
  listEvidence(orgId: OrgId): EvidenceSnippet[] {
    return [...this.evidenceById.values()].filter((e) => e.orgId === orgId)
  }

  listOpinions(orgId: OrgId): BrokerStockOpinion[] {
    return this.opinions.filter((o) => o.orgId === orgId)
  }

  listCoveredTickers(orgId: OrgId): StockTicker[] {
    const set = new Set<string>()
    for (const r of this.reports.values()) {
      if (r.orgId === orgId) for (const t of r.tickers) set.add(t as unknown as string)
    }
    return [...set] as unknown as StockTicker[]
  }

  // ── Aggregate introspection for KPI + ingestion status ────────────

  countsForOrg(orgId: OrgId) {
    return {
      emails: this.listEmails(orgId).length,
      reports: this.listReports(orgId).length,
      opinions: this.listOpinions(orgId).length,
      stocks: this.listCoveredTickers(orgId).length,
    }
  }

  // ── Alerts / digests / notifications (Module 19) ───────────────────

  upsertAlert(a: AlertEvent): void { this.alerts.set(a.id, a) }
  upsertDigest(d: AlertDigest): void { this.digests.set(d.id, d) }
  upsertDigestRun(r: DigestRun): void { this.digestRuns.set(r.id, r) }
  upsertNotification(n: NotificationRecord): void {
    const i = this.notifications.findIndex((x) => x.id === n.id)
    if (i >= 0) this.notifications[i] = n
    else this.notifications.push(n)
  }

  getAlert(orgId: OrgId, id: AlertId): AlertEvent | null {
    const a = this.alerts.get(id)
    return a && a.orgId === orgId ? a : null
  }
  listAlerts(
    orgId: OrgId,
    filter?: { sinceMs?: number; includeSuppressed?: boolean; limit?: number },
  ): AlertEvent[] {
    let arr = [...this.alerts.values()].filter((a) => a.orgId === orgId)
    if (filter?.sinceMs !== undefined) {
      arr = arr.filter((a) => Date.parse(a.generatedAt) >= filter.sinceMs!)
    }
    if (!filter?.includeSuppressed) arr = arr.filter((a) => !a.suppressed)
    arr.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }

  getDigest(orgId: OrgId, id: DigestId): AlertDigest | null {
    const d = this.digests.get(id)
    return d && d.orgId === orgId ? d : null
  }
  listDigests(
    orgId: OrgId,
    filter?: { kind?: DigestKind; limit?: number },
  ): AlertDigest[] {
    let arr = [...this.digests.values()].filter((d) => d.orgId === orgId)
    if (filter?.kind) arr = arr.filter((d) => d.kind === filter.kind)
    arr.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (filter?.limit) arr = arr.slice(0, filter.limit)
    return arr
  }
  /** Latest digest of a given kind for the org, or null. */
  latestDigest(orgId: OrgId, kind: DigestKind): AlertDigest | null {
    return this.listDigests(orgId, { kind, limit: 1 })[0] ?? null
  }

  getDigestRun(orgId: OrgId, id: DigestRunId): DigestRun | null {
    const r = this.digestRuns.get(id)
    return r && r.orgId === orgId ? r : null
  }
  listDigestRuns(orgId: OrgId, limit?: number): DigestRun[] {
    const arr = [...this.digestRuns.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  listNotifications(orgId: OrgId, limit?: number): NotificationRecord[] {
    const arr = this.notifications
      .filter((n) => n.orgId === orgId)
      .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
    return limit ? arr.slice(0, limit) : arr
  }

  // ── Calibration (Module 20) ───────────────────────────────────────

  upsertCalibrationSnapshot(s: CalibrationSnapshot): void {
    this.calibrationSnapshots.set(s.id, s)
  }
  getCalibrationSnapshot(orgId: OrgId, id: CalibrationSnapshotId): CalibrationSnapshot | null {
    const s = this.calibrationSnapshots.get(id)
    return s && s.orgId === orgId ? s : null
  }
  listCalibrationSnapshots(orgId: OrgId, limit?: number): CalibrationSnapshot[] {
    const arr = [...this.calibrationSnapshots.values()]
      .filter((s) => s.orgId === orgId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return limit ? arr.slice(0, limit) : arr
  }
  latestCalibrationSnapshot(orgId: OrgId): CalibrationSnapshot | null {
    return this.listCalibrationSnapshots(orgId, 1)[0] ?? null
  }
}
