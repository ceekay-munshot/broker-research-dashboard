// ─────────────────────────────────────────────────────────────────────────
// HybridCanonicalStore — drop-in replacement for `InMemoryStore`.
//
// Extends the existing `InMemoryStore` so the API and pipeline code
// continue to use the same object. On every upsert it ALSO writes to
// the configured `Repo` so the canonical entities are durable. On
// startup, `hydrateFrom(repo, orgIds)` preloads the in-memory cache
// from the repo so the API serves instantly without re-syncing.
//
// The frontend `/v1` contract is identical — the API code never
// learns about the persistence layer.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  OrgId, ResearchReport, ReportSummary,
  AlertEvent, AlertDigest, DigestRun, NotificationRecord,
  CalibrationSnapshot,
} from '../../../src/domain'
import { InMemoryStore } from '../store/InMemoryStore'
import type { Repo } from './types'

export class HybridCanonicalStore extends InMemoryStore {
  constructor(private readonly repo: Repo) { super() }

  override upsertEmail(email: BrokerEmail): void {
    super.upsertEmail(email)
    this.repo.upsertBrokerEmail(email)
  }

  override upsertAttachments(atts: readonly Attachment[]): void {
    super.upsertAttachments(atts)
    this.repo.upsertAttachments(atts)
  }

  override upsertReport(r: ResearchReport): void {
    super.upsertReport(r)
    this.repo.upsertResearchReport(r)
  }

  override upsertSummary(s: ReportSummary): void {
    super.upsertSummary(s)
    this.repo.upsertReportSummary(s)
  }

  override upsertEvidence(items: readonly EvidenceSnippet[]): void {
    super.upsertEvidence(items)
    this.repo.upsertEvidence(items)
  }

  override upsertOpinion(o: BrokerStockOpinion): void {
    super.upsertOpinion(o)
    this.repo.upsertOpinion(o)
  }

  /** Module 15: persist quality metadata. The base `InMemoryStore`
   *  doesn't carry quality records; we mirror them directly to the Repo. */
  upsertQuality(q: import('../pipeline/quality').MaterializationQuality): void {
    this.repo.upsertMaterializationQuality(q)
  }

  /** Preload the in-memory cache for the given orgs from the repo.
   *  Call this on process startup so the `/v1` API serves instantly
   *  on a cold boot without waiting for a sync. */
  hydrateFrom(orgIds: readonly OrgId[]): void {
    for (const orgId of orgIds) {
      const dump = this.repo.loadCanonicalForOrg(orgId)
      for (const e of dump.emails) super.upsertEmail(e)
      super.upsertAttachments(dump.attachments)
      for (const r of dump.reports) super.upsertReport(r)
      for (const s of dump.summaries) super.upsertSummary(s)
      super.upsertEvidence(dump.evidence)
      for (const o of dump.opinions) super.upsertOpinion(o)

      // Module 19 — alerts/digests/runs/notifications.
      const alerts = this.repo.loadAlertsForOrg(orgId)
      for (const a of alerts.alerts) super.upsertAlert(a)
      for (const d of alerts.digests) super.upsertDigest(d)
      for (const r of alerts.digestRuns) super.upsertDigestRun(r)
      for (const n of alerts.notifications) super.upsertNotification(n)

      // Module 20 — calibration snapshots.
      const cal = this.repo.loadCalibrationForOrg(orgId)
      for (const s of cal.snapshots) super.upsertCalibrationSnapshot(s)
    }
  }

  // ── Alerts dual-write (Module 19) ───────────────────────────────────

  override upsertAlert(a: AlertEvent): void {
    super.upsertAlert(a)
    this.repo.upsertAlertEvent(a)
  }
  override upsertDigest(d: AlertDigest): void {
    super.upsertDigest(d)
    this.repo.upsertAlertDigest(d)
  }
  override upsertDigestRun(r: DigestRun): void {
    super.upsertDigestRun(r)
    this.repo.upsertDigestRun(r)
  }
  override upsertNotification(n: NotificationRecord): void {
    super.upsertNotification(n)
    this.repo.upsertNotification(n)
  }

  // Module 20 — calibration dual-write.
  override upsertCalibrationSnapshot(s: CalibrationSnapshot): void {
    super.upsertCalibrationSnapshot(s)
    this.repo.upsertCalibrationSnapshot(s)
  }
}
