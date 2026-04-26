// ─────────────────────────────────────────────────────────────────────────
// JsonFileRepo — durable, dependency-free persistence.
//
// One JSON file per logical table. Writes go via tmp-file + atomic
// rename. Reads are O(N) per query — fine for per-tenant volumes of
// thousands of records, which is what this repo is sized for.
//
// Designed so swapping to SQLite (`./sqliteRepo.ts`) is a one-file
// change behind the same `Repo` interface.
// ─────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { InMemoryRepo } from './inMemoryRepo'
import type {
  PersistedJob, PersistedRawEmail, PersistedReviewItem, Repo, SyncCheckpoint,
} from './types'
import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  OrgId, ReportId, ResearchReport, ReportSummary,
  AlertEvent, AlertDigest, DigestRun, NotificationRecord,
  AlertId, DigestId, DigestRunId, DigestKind,
  CalibrationSnapshot, CalibrationSnapshotId,
} from '../../../src/domain'
import type { MaterializationQuality } from '../pipeline/quality'
import type { CorrectionRule, CorrectionAuditEntry } from '../corrections/types'
import type { LlmCallRecord, LlmCacheEntry } from '../llm/types'

const TABLES = [
  'rawEmails', 'jobs', 'reviewQueue', 'checkpoints',
  'canonicalEmails', 'canonicalAttachments', 'canonicalReports',
  'canonicalSummaries', 'canonicalEvidence', 'canonicalOpinions',
  'canonicalQuality',
  'correctionRules',
  'llmCallRecords', 'llmCache',
  // Module 19
  'alertEvents', 'alertDigests', 'digestRuns', 'notifications',
  // Module 20
  'calibrationSnapshots',
] as const
type TableName = typeof TABLES[number]

interface Snapshot {
  rawEmails: PersistedRawEmail[]
  jobs: PersistedJob[]
  reviewQueue: PersistedReviewItem[]
  checkpoints: SyncCheckpoint[]
  canonicalEmails: BrokerEmail[]
  canonicalAttachments: Attachment[]
  canonicalReports: ResearchReport[]
  canonicalSummaries: ReportSummary[]
  canonicalEvidence: EvidenceSnippet[]
  canonicalOpinions: BrokerStockOpinion[]
  canonicalQuality: MaterializationQuality[]
  correctionRules: CorrectionRule[]
  llmCallRecords: LlmCallRecord[]
  llmCache: LlmCacheEntry[]
  alertEvents: AlertEvent[]
  alertDigests: AlertDigest[]
  digestRuns: DigestRun[]
  notifications: NotificationRecord[]
  calibrationSnapshots: CalibrationSnapshot[]
}

export interface JsonFileRepoOptions {
  /** Directory where one file per table lives. Created if absent. */
  readonly dir: string
  /** Auto-flush after every write (safe default). When false, callers
   *  must call `flush()` explicitly. */
  readonly autoFlush?: boolean
}

export class JsonFileRepo implements Repo {
  private readonly dir: string
  private readonly autoFlush: boolean
  private readonly mem: InMemoryRepo
  private dirty: ReadonlySet<TableName> = new Set()

  constructor(opts: JsonFileRepoOptions) {
    this.dir = opts.dir
    this.autoFlush = opts.autoFlush ?? true
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    this.mem = new InMemoryRepo()
    this.hydrateFromDisk()
  }

  // ── Repo passthrough with mark-dirty + flush ─────────────────────────

  private touch(...tables: TableName[]): void {
    const next = new Set(this.dirty)
    for (const t of tables) next.add(t)
    this.dirty = next
    if (this.autoFlush) this.flush()
  }

  upsertRawEmail(rec: PersistedRawEmail) { this.mem.upsertRawEmail(rec); this.touch('rawEmails') }
  getRawEmail(orgId: OrgId, id: string)  { return this.mem.getRawEmail(orgId, id) }
  findRawEmailByFingerprint(orgId: OrgId, fp: string) { return this.mem.findRawEmailByFingerprint(orgId, fp) }
  listRawEmails(orgId: OrgId, filter?: Parameters<Repo['listRawEmails']>[1]) { return this.mem.listRawEmails(orgId, filter) }
  updateRawEmailState(orgId: OrgId, id: string, state: Parameters<Repo['updateRawEmailState']>[2], cat: Parameters<Repo['updateRawEmailState']>[3], detail: Parameters<Repo['updateRawEmailState']>[4]) {
    this.mem.updateRawEmailState(orgId, id, state, cat, detail); this.touch('rawEmails')
  }

  appendJob(rec: PersistedJob) { this.mem.appendJob(rec); this.touch('jobs') }
  listJobs(orgId: OrgId, filter?: Parameters<Repo['listJobs']>[1]) { return this.mem.listJobs(orgId, filter) }

  upsertReviewItem(rec: PersistedReviewItem) { this.mem.upsertReviewItem(rec); this.touch('reviewQueue') }
  listReviewItems(orgId: OrgId, includeResolved?: boolean) { return this.mem.listReviewItems(orgId, includeResolved) }
  resolveReviewItem(orgId: OrgId, id: string, note: string) {
    this.mem.resolveReviewItem(orgId, id, note); this.touch('reviewQueue')
  }

  getCheckpoint(orgId: OrgId) { return this.mem.getCheckpoint(orgId) }
  upsertCheckpoint(rec: SyncCheckpoint) { this.mem.upsertCheckpoint(rec); this.touch('checkpoints') }

  upsertBrokerEmail(rec: BrokerEmail) { this.mem.upsertBrokerEmail(rec); this.touch('canonicalEmails') }
  upsertAttachments(recs: readonly Attachment[]) { this.mem.upsertAttachments(recs); this.touch('canonicalAttachments') }
  upsertResearchReport(rec: ResearchReport) { this.mem.upsertResearchReport(rec); this.touch('canonicalReports') }
  upsertReportSummary(rec: ReportSummary) { this.mem.upsertReportSummary(rec); this.touch('canonicalSummaries') }
  upsertEvidence(recs: readonly EvidenceSnippet[]) { this.mem.upsertEvidence(recs); this.touch('canonicalEvidence') }
  upsertOpinion(rec: BrokerStockOpinion) { this.mem.upsertOpinion(rec); this.touch('canonicalOpinions') }

  upsertMaterializationQuality(rec: MaterializationQuality) {
    this.mem.upsertMaterializationQuality(rec); this.touch('canonicalQuality')
  }
  getMaterializationQuality(orgId: OrgId, reportId: ReportId) {
    return this.mem.getMaterializationQuality(orgId, reportId)
  }
  listMaterializationQuality(orgId: OrgId) {
    return this.mem.listMaterializationQuality(orgId)
  }

  // Corrections (Module 16)
  upsertCorrectionRule(rec: CorrectionRule) { this.mem.upsertCorrectionRule(rec); this.touch('correctionRules') }
  getCorrectionRule(orgId: OrgId, id: string) { return this.mem.getCorrectionRule(orgId, id) }
  listCorrectionRules(orgId: OrgId, opts?: { enabledOnly?: boolean }) { return this.mem.listCorrectionRules(orgId, opts) }
  appendCorrectionAudit(orgId: OrgId, id: string, entry: CorrectionAuditEntry, patch?: { enabled?: boolean; supersededBy?: string }) {
    this.mem.appendCorrectionAudit(orgId, id, entry, patch); this.touch('correctionRules')
  }
  bumpCorrectionImpact(orgId: OrgId, id: string, delta: { applicationCount?: number; reviewItemsResolved?: number; aggregateQualityDelta?: number }) {
    this.mem.bumpCorrectionImpact(orgId, id, delta); this.touch('correctionRules')
  }

  // LLM (Module 17)
  appendLlmCallRecord(rec: LlmCallRecord) { this.mem.appendLlmCallRecord(rec); this.touch('llmCallRecords') }
  listLlmCallRecords(orgId: OrgId, limit?: number) { return this.mem.listLlmCallRecords(orgId, limit) }
  listAllLlmCallRecords(limit?: number) { return this.mem.listAllLlmCallRecords(limit) }
  upsertLlmCacheEntry(rec: LlmCacheEntry) { this.mem.upsertLlmCacheEntry(rec); this.touch('llmCache') }
  getLlmCacheEntry(orgId: OrgId, key: string) { return this.mem.getLlmCacheEntry(orgId, key) }
  findLlmCacheEntryByKey(key: string) { return this.mem.findLlmCacheEntryByKey(key) }

  loadCanonicalForOrg(orgId: OrgId) { return this.mem.loadCanonicalForOrg(orgId) }

  // Module 19 — alerts / digests / notifications
  upsertAlertEvent(rec: AlertEvent) { this.mem.upsertAlertEvent(rec); this.touch('alertEvents') }
  getAlertEvent(orgId: OrgId, id: AlertId) { return this.mem.getAlertEvent(orgId, id) }
  listAlertEvents(orgId: OrgId, filter?: Parameters<Repo['listAlertEvents']>[1]) { return this.mem.listAlertEvents(orgId, filter) }
  upsertAlertDigest(rec: AlertDigest) { this.mem.upsertAlertDigest(rec); this.touch('alertDigests') }
  getAlertDigest(orgId: OrgId, id: DigestId) { return this.mem.getAlertDigest(orgId, id) }
  listAlertDigests(orgId: OrgId, filter?: { kind?: DigestKind; limit?: number }) { return this.mem.listAlertDigests(orgId, filter) }
  upsertDigestRun(rec: DigestRun) { this.mem.upsertDigestRun(rec); this.touch('digestRuns') }
  getDigestRun(orgId: OrgId, id: DigestRunId) { return this.mem.getDigestRun(orgId, id) }
  listDigestRuns(orgId: OrgId, limit?: number) { return this.mem.listDigestRuns(orgId, limit) }
  upsertNotification(rec: NotificationRecord) { this.mem.upsertNotification(rec); this.touch('notifications') }
  listNotifications(orgId: OrgId, limit?: number) { return this.mem.listNotifications(orgId, limit) }
  loadAlertsForOrg(orgId: OrgId) { return this.mem.loadAlertsForOrg(orgId) }

  // Module 20 — calibration snapshots
  upsertCalibrationSnapshot(rec: CalibrationSnapshot) { this.mem.upsertCalibrationSnapshot(rec); this.touch('calibrationSnapshots') }
  getCalibrationSnapshot(orgId: OrgId, id: CalibrationSnapshotId) { return this.mem.getCalibrationSnapshot(orgId, id) }
  listCalibrationSnapshots(orgId: OrgId, limit?: number) { return this.mem.listCalibrationSnapshots(orgId, limit) }
  latestCalibrationSnapshot(orgId: OrgId) { return this.mem.latestCalibrationSnapshot(orgId) }
  loadCalibrationForOrg(orgId: OrgId) { return this.mem.loadCalibrationForOrg(orgId) }

  // ── Disk I/O (atomic write per table) ────────────────────────────────

  flush(): void {
    if (this.dirty.size === 0) return
    const snap = this.snapshot()
    for (const table of this.dirty) {
      const path = join(this.dir, `${table}.json`)
      const tmp = `${path}.tmp`
      writeFileSync(tmp, JSON.stringify(snap[table], null, 2), 'utf8')
      renameSync(tmp, path)
    }
    this.dirty = new Set()
  }

  private snapshot(): Snapshot {
    // Pulls a flat array per table from the in-memory mirror's
    // private maps/arrays. JS field access ignores TS's `private`
    // modifier; this is intentional — it keeps the InMemoryRepo's
    // public surface clean (the Repo interface is the contract that
    // matters) and avoids exporting internal helpers. The fields and
    // their shapes are stable within this directory.
    const m = this.mem as unknown as {
      rawEmails: Map<string, PersistedRawEmail>
      jobs: PersistedJob[]
      review: Map<string, PersistedReviewItem>
      checkpoints: Map<string, SyncCheckpoint>
      canonicalEmails: Map<string, BrokerEmail>
      canonicalAttachments: Map<string, Attachment>
      canonicalReports: Map<string, ResearchReport>
      canonicalSummaries: Map<string, ReportSummary>
      canonicalEvidence: Map<string, EvidenceSnippet>
      canonicalOpinions: BrokerStockOpinion[]
      canonicalQuality: Map<string, MaterializationQuality>
      correctionRules: Map<string, CorrectionRule>
      llmCallRecords: LlmCallRecord[]
      llmCache: Map<string, LlmCacheEntry>
      alertEvents: Map<string, AlertEvent>
      alertDigests: Map<string, AlertDigest>
      digestRuns: Map<string, DigestRun>
      notifications: Map<string, NotificationRecord>
      calibrationSnapshots: Map<string, CalibrationSnapshot>
    }
    return {
      rawEmails:            [...m.rawEmails.values()],
      jobs:                 [...m.jobs],
      reviewQueue:          [...m.review.values()],
      checkpoints:          [...m.checkpoints.values()],
      canonicalEmails:      [...m.canonicalEmails.values()],
      canonicalAttachments: [...m.canonicalAttachments.values()],
      canonicalReports:     [...m.canonicalReports.values()],
      canonicalSummaries:   [...m.canonicalSummaries.values()],
      canonicalEvidence:    [...m.canonicalEvidence.values()],
      canonicalOpinions:    [...m.canonicalOpinions],
      canonicalQuality:     [...m.canonicalQuality.values()],
      correctionRules:      [...m.correctionRules.values()],
      llmCallRecords:       [...m.llmCallRecords],
      llmCache:             [...m.llmCache.values()],
      alertEvents:          [...m.alertEvents.values()],
      alertDigests:         [...m.alertDigests.values()],
      digestRuns:           [...m.digestRuns.values()],
      notifications:        [...m.notifications.values()],
      calibrationSnapshots: [...m.calibrationSnapshots.values()],
    }
  }

  private hydrateFromDisk(): void {
    for (const table of TABLES) {
      const path = join(this.dir, `${table}.json`)
      if (!existsSync(path)) continue
      const raw = readFileSync(path, 'utf8')
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { continue }
      if (!Array.isArray(parsed)) continue
      for (const rec of parsed) {
        switch (table) {
          case 'rawEmails':            this.mem.upsertRawEmail(rec as PersistedRawEmail); break
          case 'jobs':                 this.mem.appendJob(rec as PersistedJob); break
          case 'reviewQueue':          this.mem.upsertReviewItem(rec as PersistedReviewItem); break
          case 'checkpoints':          this.mem.upsertCheckpoint(rec as SyncCheckpoint); break
          case 'canonicalEmails':      this.mem.upsertBrokerEmail(rec as BrokerEmail); break
          case 'canonicalAttachments': this.mem.upsertAttachments([rec as Attachment]); break
          case 'canonicalReports':     this.mem.upsertResearchReport(rec as ResearchReport); break
          case 'canonicalSummaries':   this.mem.upsertReportSummary(rec as ReportSummary); break
          case 'canonicalEvidence':    this.mem.upsertEvidence([rec as EvidenceSnippet]); break
          case 'canonicalOpinions':    this.mem.upsertOpinion(rec as BrokerStockOpinion); break
          case 'canonicalQuality':     this.mem.upsertMaterializationQuality(rec as MaterializationQuality); break
          case 'correctionRules':      this.mem.upsertCorrectionRule(rec as CorrectionRule); break
          case 'llmCallRecords':       this.mem.appendLlmCallRecord(rec as LlmCallRecord); break
          case 'llmCache':             this.mem.upsertLlmCacheEntry(rec as LlmCacheEntry); break
          case 'alertEvents':          this.mem.upsertAlertEvent(rec as AlertEvent); break
          case 'alertDigests':         this.mem.upsertAlertDigest(rec as AlertDigest); break
          case 'digestRuns':           this.mem.upsertDigestRun(rec as DigestRun); break
          case 'notifications':        this.mem.upsertNotification(rec as NotificationRecord); break
          case 'calibrationSnapshots': this.mem.upsertCalibrationSnapshot(rec as CalibrationSnapshot); break
        }
      }
    }
  }
}

