import type {
  Organization, User,
  Broker, BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet,
  Stock, BrokerStockOpinion, ConsensusView,
  Sector, SectorKnowledgeItem,
  DivergenceCase,
  KpiSnapshot,
  IngestionStatus,
  OrgScope, Page,
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
} from '../domain'
import type { ResearchAdapter } from './ResearchAdapter'
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListDivergencesQuery,
} from './queries'
import { NotFoundError, OrgScopeViolationError } from './errors'
import { paginate } from '../lib/paginate'
import { withinWindow } from '../lib/date'

import {
  organizations, users,
  brokers, sectors, stocks,
  brokerEmails, attachments,
  reports, summaries, evidenceSnippets,
  brokerStockOpinions, consensusViews,
  divergenceCases, sectorKnowledgeItems,
  ingestionJobs, kpiSnapshots, ingestionStatuses,
  DEFAULT_ORG_ID, DEFAULT_USER_ID,
} from '../mocks'

// In-memory adapter that serves fixtures from src/mocks/*. Every call filters
// by scope.orgId; a fixture row that doesn't belong to the scope's org is
// never returned.
//
// Latency is simulated lightly so the UI's loading states behave the way
// they will in production. Network errors are not simulated here — tests
// that want failure paths should inject a custom adapter via
// setResearchAdapter().
export class MockResearchAdapter implements ResearchAdapter {
  private readonly simulatedLatencyMs: number

  constructor(opts: { simulatedLatencyMs?: number } = {}) {
    this.simulatedLatencyMs = opts.simulatedLatencyMs ?? 80
  }

  // ── Session ──────────────────────────────────────────────────────────

  async getSessionScope(): Promise<OrgScope> {
    await this.delay()
    return { orgId: DEFAULT_ORG_ID, actingUserId: DEFAULT_USER_ID }
  }

  // ── Tenant / catalog ─────────────────────────────────────────────────

  async getOrganization(scope: OrgScope): Promise<Organization> {
    await this.delay()
    const org = organizations.find((o) => o.id === scope.orgId)
    if (!org) throw new OrgScopeViolationError(`Unknown organization: ${scope.orgId}`)
    return org
  }

  async getCurrentUser(scope: OrgScope): Promise<User> {
    await this.delay()
    const user = users.find((u) => u.id === scope.actingUserId && u.orgId === scope.orgId)
    if (!user) throw new OrgScopeViolationError(`User ${scope.actingUserId} is not a member of ${scope.orgId}`)
    return user
  }

  async listBrokers(scope: OrgScope): Promise<readonly Broker[]> {
    await this.delay()
    const org = organizations.find((o) => o.id === scope.orgId)
    if (!org) throw new OrgScopeViolationError(`Unknown organization: ${scope.orgId}`)
    const enabled = new Set(org.enabledBrokerIds)
    return brokers.filter((b) => enabled.has(b.id))
  }

  async getBroker(scope: OrgScope, brokerId: BrokerId): Promise<Broker | null> {
    await this.delay()
    const list = await this.listBrokers(scope)
    return list.find((b) => b.id === brokerId) ?? null
  }

  async listSectors(_scope: OrgScope): Promise<readonly Sector[]> {
    await this.delay()
    return sectors
  }

  async getSector(_scope: OrgScope, sectorId: SectorId): Promise<Sector | null> {
    await this.delay()
    return sectors.find((s) => s.id === sectorId) ?? null
  }

  async listStocks(scope: OrgScope): Promise<readonly Stock[]> {
    await this.delay()
    // Only stocks with coverage in this org's reports.
    const covered = new Set<string>()
    reports.filter((r) => r.orgId === scope.orgId)
      .forEach((r) => r.tickers.forEach((t) => covered.add(t)))
    return stocks.filter((s) => covered.has(s.ticker))
  }

  async getStock(scope: OrgScope, ticker: StockTicker): Promise<Stock | null> {
    await this.delay()
    const coveredStocks = await this.listStocks(scope)
    return coveredStocks.find((s) => s.ticker === ticker) ?? null
  }

  // ── Raw inbound pipeline ────────────────────────────────────────────

  async listBrokerEmails(scope: OrgScope, query: ListEmailsQuery = {}): Promise<Page<BrokerEmail>> {
    await this.delay()
    const brokerSet = query.brokerIds ? new Set(query.brokerIds) : null
    const statusSet = query.statuses ? new Set(query.statuses) : null

    const filtered = brokerEmails
      .filter((e) => e.orgId === scope.orgId)
      .filter((e) => withinWindow(e.receivedAt, query.since, query.until))
      .filter((e) => !brokerSet || (e.brokerId && brokerSet.has(e.brokerId)))
      .filter((e) => !statusSet || statusSet.has(e.status))
      .slice()
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

    return paginate(filtered, query.cursor, query.limit)
  }

  async getBrokerEmail(scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null> {
    await this.delay()
    const e = brokerEmails.find((x) => x.id === emailId)
    if (!e) return null
    if (e.orgId !== scope.orgId) throw new OrgScopeViolationError(`Email ${emailId} not visible to ${scope.orgId}`)
    return e
  }

  async listAttachments(scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]> {
    await this.delay()
    const email = await this.getBrokerEmail(scope, emailId)
    if (!email) throw new NotFoundError(`Email ${emailId} not found`)
    return attachments.filter((a) => a.orgId === scope.orgId && a.emailId === emailId)
  }

  // ── Normalized research artifacts ───────────────────────────────────

  async listResearchReports(scope: OrgScope, query: ListReportsQuery = {}): Promise<Page<ResearchReport>> {
    await this.delay()
    const brokerSet = query.brokerIds   ? new Set(query.brokerIds)   : null
    const tickerSet = query.tickers     ? new Set(query.tickers)     : null
    const sectorSet = query.sectorIds   ? new Set(query.sectorIds)   : null
    const typeSet   = query.reportTypes ? new Set(query.reportTypes) : null
    const stanceSet = query.stances     ? new Set(query.stances)     : null

    const summaryByReport = new Map(summaries.map((s) => [s.reportId, s]))

    const filtered = reports
      .filter((r) => r.orgId === scope.orgId)
      .filter((r) => withinWindow(r.publishedAt, query.since, query.until))
      .filter((r) => !brokerSet || brokerSet.has(r.brokerId))
      .filter((r) => !tickerSet || r.tickers.some((t) => tickerSet.has(t)))
      .filter((r) => !sectorSet || r.sectorIds.some((s) => sectorSet.has(s)))
      .filter((r) => !typeSet   || typeSet.has(r.reportType))
      .filter((r) => {
        if (!stanceSet) return true
        const s = summaryByReport.get(r.id)
        return s !== undefined && stanceSet.has(s.stance)
      })
      .slice()
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    return paginate(filtered, query.cursor, query.limit)
  }

  async getResearchReport(scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null> {
    await this.delay()
    const r = reports.find((x) => x.id === reportId)
    if (!r) return null
    if (r.orgId !== scope.orgId) throw new OrgScopeViolationError(`Report ${reportId} not visible to ${scope.orgId}`)
    return r
  }

  async getReportSummary(scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null> {
    await this.delay()
    const s = summaries.find((x) => x.reportId === reportId)
    if (!s) return null
    if (s.orgId !== scope.orgId) throw new OrgScopeViolationError(`Summary for ${reportId} not visible to ${scope.orgId}`)
    return s
  }

  async listEvidenceSnippets(scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]> {
    await this.delay()
    const report = await this.getResearchReport(scope, reportId)
    if (!report) throw new NotFoundError(`Report ${reportId} not found`)
    return evidenceSnippets.filter((e) => e.orgId === scope.orgId && e.reportId === reportId)
  }

  // ── Derived analytics ───────────────────────────────────────────────

  async listBrokerStockOpinions(scope: OrgScope, query: ListOpinionsQuery = {}): Promise<readonly BrokerStockOpinion[]> {
    await this.delay()
    const brokerSet = query.brokerIds ? new Set(query.brokerIds) : null
    const tickerSet = query.tickers   ? new Set(query.tickers)   : null

    return brokerStockOpinions
      .filter((o) => o.orgId === scope.orgId)
      .filter((o) => !brokerSet || brokerSet.has(o.brokerId))
      .filter((o) => !tickerSet || tickerSet.has(o.ticker))
  }

  async getConsensusView(scope: OrgScope, ticker: StockTicker): Promise<ConsensusView | null> {
    await this.delay()
    return consensusViews.find((c) => c.orgId === scope.orgId && c.ticker === ticker) ?? null
  }

  async listDivergenceCases(scope: OrgScope, query: ListDivergencesQuery = {}): Promise<readonly DivergenceCase[]> {
    await this.delay()
    const tickerSet = query.tickers ? new Set(query.tickers) : null
    return divergenceCases
      .filter((d) => d.orgId === scope.orgId)
      .filter((d) => query.minSpreadPct === undefined || d.spreadPct >= query.minSpreadPct)
      .filter((d) => !tickerSet || tickerSet.has(d.ticker))
      .slice()
      .sort((a, b) => b.spreadPct - a.spreadPct)
  }

  async getSectorKnowledge(scope: OrgScope, sectorId: SectorId): Promise<SectorKnowledgeItem | null> {
    await this.delay()
    return sectorKnowledgeItems.find((s) => s.orgId === scope.orgId && s.sectorId === sectorId) ?? null
  }

  // ── Dashboard + ops ─────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    await this.delay()
    const snap = kpiSnapshots.find((k) => k.orgId === scope.orgId)
    if (!snap) throw new NotFoundError(`No KPI snapshot for org ${scope.orgId}`)
    return snap
  }

  async getIngestionStatus(scope: OrgScope): Promise<IngestionStatus> {
    await this.delay()
    const status = ingestionStatuses.find((s) => s.orgId === scope.orgId)
    if (status) return status
    // Fallback: derive from ingestionJobs if a fixture row is missing.
    const jobs = ingestionJobs.filter((j) => j.orgId === scope.orgId)
    return {
      orgId: scope.orgId,
      asOf: new Date().toISOString(),
      queued: jobs.filter((j) => j.status === 'queued').length,
      processing: jobs.filter((j) => j.status === 'parsing' || j.status === 'normalizing' || j.status === 'summarizing').length,
      readyLast24h: jobs.filter((j) => j.status === 'ready').length,
      failedLast24h: jobs.filter((j) => j.status === 'failed').length,
      throughputPerHour: 0,
    }
  }

  // ── Internal ────────────────────────────────────────────────────────

  private delay(): Promise<void> {
    if (this.simulatedLatencyMs <= 0) return Promise.resolve()
    return new Promise((res) => setTimeout(res, this.simulatedLatencyMs))
  }
}
