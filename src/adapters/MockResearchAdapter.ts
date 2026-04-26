import type {
  Organization, User,
  Broker, BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet,
  Stock, BrokerStockOpinion,
  Sector,
  KpiSnapshot,
  IngestionStatus,
  PortfolioSnapshot,
  AlertEvent, AlertDigest, DigestKind,
  AlertId, DigestId,
  CalibrationSnapshot, BrokerCalibrationSummary,
  AlertEffectivenessSummary, CoverageSignalResult,
  AlertTriggerKind,
  CatalystEvent, PreEventBrief, PostEventReview,
  CatalystId, PostEventReviewId,
  OrgScope, Page,
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
  SourcesHealthSnapshot, SourceIntegration, SourceKind,
  DeliveryAttempt, DeliveryAttemptId, DeliveryContentKind, DeliveryChannel,
} from '../domain'
import {
  asSourceId, asDeliveryAttemptId, asDeliveryRunId, asDeliveryTargetId, asUserId,
} from '../lib/ids'
import type { ConflictClosure, SectorIntelligence } from '../engine/types'
import { buildConflictClosure, buildSectorIntelligence } from '../engine'
import type { ResearchAdapter } from './ResearchAdapter'
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListClosuresQuery,
} from './queries'
import { NotFoundError, OrgScopeViolationError } from './errors'
import { paginate } from '../lib/paginate'
import { withinWindow } from '../lib/date'

import {
  organizations, users,
  brokers, sectors, stocks,
  brokerEmails, attachments,
  reports, summaries, evidenceSnippets,
  brokerStockOpinions,
  ingestionJobs, kpiSnapshots, ingestionStatuses,
  alertEvents, alertDigests,
  calibrationSnapshot,
  catalystEvents, preEventBriefs, postEventReviews,
  DEFAULT_ORG_ID, DEFAULT_USER_ID,
} from '../mocks'
import { FixturePortfolioProvider, type PortfolioInputProvider } from './portfolio/PortfolioInputProvider'

// In-memory adapter that serves fixtures from src/mocks/* plus runs the
// deterministic src/engine/ analysis layer on demand. Every call filters by
// scope.orgId; a fixture row that doesn't belong to the scope's org is
// never returned.
//
// Latency is simulated lightly so the UI's loading states behave the way
// they will in production. Network errors are not simulated here — tests
// that want failure paths should inject a custom adapter via
// setResearchAdapter().
export class MockResearchAdapter implements ResearchAdapter {
  private readonly simulatedLatencyMs: number
  private readonly portfolioProvider: PortfolioInputProvider

  constructor(opts: { simulatedLatencyMs?: number; portfolioProvider?: PortfolioInputProvider } = {}) {
    this.simulatedLatencyMs = opts.simulatedLatencyMs ?? 80
    this.portfolioProvider = opts.portfolioProvider ?? new FixturePortfolioProvider()
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

  async getConflictClosure(scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null> {
    await this.delay()
    const opinions = brokerStockOpinions.filter(
      (o) => o.orgId === scope.orgId && o.ticker === ticker,
    )
    if (opinions.length === 0) return null
    const reportIds = new Set(opinions.map((o) => o.lastReportId as unknown as string))
    const scopeSummaries = summaries.filter(
      (s) => s.orgId === scope.orgId && reportIds.has(s.reportId as unknown as string),
    )
    const scopeEvidence = evidenceSnippets.filter(
      (e) => e.orgId === scope.orgId && reportIds.has(e.reportId as unknown as string),
    )
    const scopeBrokers = await this.listBrokers(scope)
    return buildConflictClosure({
      ticker,
      opinions,
      summaries: scopeSummaries,
      evidence: scopeEvidence,
      brokers: scopeBrokers,
    })
  }

  async listConflictClosures(scope: OrgScope, query: ListClosuresQuery = {}): Promise<readonly ConflictClosure[]> {
    await this.delay()
    const scopeStocks = await this.listStocks(scope)
    const tickerSet = query.tickers ? new Set(query.tickers) : null
    const sectorSet = query.sectorIds ? new Set(query.sectorIds) : null
    const stateSet  = query.states ? new Set(query.states) : null

    const candidates = scopeStocks
      .filter((s) => !tickerSet || tickerSet.has(s.ticker))
      .filter((s) => !sectorSet || sectorSet.has(s.sectorId))

    const closures: ConflictClosure[] = []
    for (const stock of candidates) {
      const closure = await this.getConflictClosure(scope, stock.ticker)
      if (!closure) continue
      if (query.minSpreadPct !== undefined) {
        const spread = closure.targetStats.spreadPct
        if (spread === null || spread < query.minSpreadPct) continue
      }
      if (query.mustHaveDisagreements && closure.disagreements.length === 0) continue
      if (query.mustHaveOutliers && closure.outliers.length === 0) continue
      if (stateSet && !stateSet.has(closure.resultant.state)) continue
      closures.push(closure)
    }

    // Sort by target spread desc so the most-divergent names surface first.
    closures.sort((a, b) =>
      (b.targetStats.spreadPct ?? 0) - (a.targetStats.spreadPct ?? 0))
    return closures
  }

  async getSectorIntelligence(scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null> {
    await this.delay()
    const sector = sectors.find((s) => s.id === sectorId)
    if (!sector) return null

    const scopeReports = reports.filter(
      (r) => r.orgId === scope.orgId
        && (r.sectorIds.includes(sectorId)
            || r.tickers.some((t) => sector.tickers.includes(t))),
    )
    const scopeReportIds = new Set(scopeReports.map((r) => r.id as unknown as string))
    const scopeSummaries = summaries.filter(
      (s) => s.orgId === scope.orgId && scopeReportIds.has(s.reportId as unknown as string),
    )

    // Closures for every ticker this sector covers (that actually has
    // opinions in scope).
    const closures: ConflictClosure[] = []
    for (const ticker of sector.tickers) {
      const c = await this.getConflictClosure(scope, ticker)
      if (c) closures.push(c)
    }

    // Period: widest window covered by the sector's reports.
    const dates = scopeReports.map((r) => r.publishedAt).sort()
    const periodStart = dates[0] ?? new Date().toISOString()
    const periodEnd   = dates[dates.length - 1] ?? new Date().toISOString()

    return buildSectorIntelligence({
      sector,
      reports: scopeReports,
      summaries: scopeSummaries,
      closures,
      periodStart,
      periodEnd,
    })
  }

  async listSectorIntelligence(scope: OrgScope): Promise<readonly SectorIntelligence[]> {
    await this.delay()
    const out: SectorIntelligence[] = []
    for (const sector of sectors) {
      const si = await this.getSectorIntelligence(scope, sector.id)
      if (si) out.push(si)
    }
    return out
  }

  // ── Dashboard + ops ─────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    await this.delay()
    const snap = kpiSnapshots.find((k) => k.orgId === scope.orgId)
    if (!snap) throw new NotFoundError(`No KPI snapshot for org ${scope.orgId}`)
    return snap
  }

  async getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null> {
    await this.delay()
    return this.portfolioProvider.getPortfolioSnapshot(scope)
  }

  // ── Alerts / digests (Module 19) ──────────────────────────────────

  async listAlerts(
    scope: OrgScope,
    query: { sinceMs?: number; includeSuppressed?: boolean; limit?: number } = {},
  ): Promise<readonly AlertEvent[]> {
    await this.delay()
    let arr = alertEvents.filter((a) => a.orgId === scope.orgId)
    if (query.sinceMs !== undefined) {
      arr = arr.filter((a) => Date.parse(a.generatedAt) >= query.sinceMs!)
    }
    if (!query.includeSuppressed) arr = arr.filter((a) => !a.suppressed)
    arr = arr.slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (query.limit) arr = arr.slice(0, query.limit)
    return arr
  }

  async getAlert(scope: OrgScope, id: AlertId): Promise<AlertEvent | null> {
    await this.delay()
    const a = alertEvents.find((x) => x.id === id)
    return a && a.orgId === scope.orgId ? a : null
  }

  async listAlertDigests(
    scope: OrgScope,
    query: { kind?: DigestKind; limit?: number } = {},
  ): Promise<readonly AlertDigest[]> {
    await this.delay()
    let arr = alertDigests.filter((d) => d.orgId === scope.orgId)
    if (query.kind) arr = arr.filter((d) => d.kind === query.kind)
    arr = arr.slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    if (query.limit) arr = arr.slice(0, query.limit)
    return arr
  }

  async getAlertDigest(scope: OrgScope, id: DigestId): Promise<AlertDigest | null> {
    await this.delay()
    const d = alertDigests.find((x) => x.id === id)
    return d && d.orgId === scope.orgId ? d : null
  }

  async getLatestAlertDigest(scope: OrgScope, kind: DigestKind): Promise<AlertDigest | null> {
    await this.delay()
    const list = alertDigests
      .filter((d) => d.orgId === scope.orgId && d.kind === kind)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return list[0] ?? null
  }

  // ── Calibration (Module 20) ────────────────────────────────────────

  async getCalibrationSnapshot(scope: OrgScope): Promise<CalibrationSnapshot | null> {
    await this.delay()
    return calibrationSnapshot.orgId === scope.orgId ? calibrationSnapshot : null
  }

  async listBrokerCalibrations(scope: OrgScope): Promise<readonly BrokerCalibrationSummary[]> {
    await this.delay()
    return calibrationSnapshot.orgId === scope.orgId ? calibrationSnapshot.brokerCalibrations : []
  }

  async getBrokerCalibration(scope: OrgScope, brokerId: BrokerId): Promise<BrokerCalibrationSummary | null> {
    await this.delay()
    if (calibrationSnapshot.orgId !== scope.orgId) return null
    return calibrationSnapshot.brokerCalibrations.find((b) => b.brokerId === brokerId) ?? null
  }

  async listAlertEffectiveness(scope: OrgScope): Promise<readonly AlertEffectivenessSummary[]> {
    await this.delay()
    return calibrationSnapshot.orgId === scope.orgId ? calibrationSnapshot.alertEffectiveness : []
  }

  async getAlertEffectiveness(scope: OrgScope, kind: AlertTriggerKind): Promise<AlertEffectivenessSummary | null> {
    await this.delay()
    if (calibrationSnapshot.orgId !== scope.orgId) return null
    return calibrationSnapshot.alertEffectiveness.find((a) => a.kind === kind) ?? null
  }

  async getCoverageSignal(scope: OrgScope, ticker: StockTicker): Promise<CoverageSignalResult | null> {
    await this.delay()
    if (calibrationSnapshot.orgId !== scope.orgId) return null
    return calibrationSnapshot.coverageByTicker.find((c) => c.ticker === ticker) ?? null
  }

  // ── Catalysts (Module 21) ────────────────────────────────────────

  async listCatalysts(scope: OrgScope): Promise<readonly CatalystEvent[]> {
    await this.delay()
    return catalystEvents
      .filter((c) => c.orgId === scope.orgId)
      .slice()
      .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
  }

  async getCatalyst(scope: OrgScope, id: CatalystId): Promise<CatalystEvent | null> {
    await this.delay()
    const c = catalystEvents.find((x) => x.id === id)
    return c && c.orgId === scope.orgId ? c : null
  }

  async getLatestPreEventBrief(scope: OrgScope, catalystId: CatalystId): Promise<PreEventBrief | null> {
    await this.delay()
    const matches = preEventBriefs
      .filter((b) => b.orgId === scope.orgId && b.catalystId === catalystId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return matches[0] ?? null
  }

  async listPostEventReviews(scope: OrgScope): Promise<readonly PostEventReview[]> {
    await this.delay()
    return postEventReviews
      .filter((r) => r.orgId === scope.orgId)
      .slice()
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  }

  async getLatestPostEventReview(scope: OrgScope, catalystId: CatalystId): Promise<PostEventReview | null> {
    await this.delay()
    const matches = postEventReviews
      .filter((r) => r.orgId === scope.orgId && r.catalystId === catalystId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    return matches[0] ?? null
  }

  async getPostEventReview(scope: OrgScope, id: PostEventReviewId): Promise<PostEventReview | null> {
    await this.delay()
    const r = postEventReviews.find((x) => x.id === id)
    return r && r.orgId === scope.orgId ? r : null
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

  /** Module 24 — sources health.
   *
   *  The mock adapter doesn't speak to the server source manager, so it
   *  synthesizes a snapshot that mirrors what the manager would produce
   *  in `fixture` mode: every kind present, healthy-now (just synced),
   *  serving fixture data, with the canonical "affected modules" wiring.
   *  This keeps the UI Sources tab + chip exercised end-to-end in dev
   *  even without a live server. */
  async getSourcesHealth(scope: OrgScope): Promise<SourcesHealthSnapshot | null> {
    await this.delay()
    const kinds: readonly SourceKind[] = ['raw_upstream', 'portfolio', 'catalyst_calendar', 'market_data']
    const display: Record<SourceKind, string> = {
      raw_upstream:      'Research upstream (raw emails)',
      portfolio:         'Portfolio snapshot',
      catalyst_calendar: 'Catalyst calendar',
      market_data:       'Market data + benchmarks',
    }
    const affected: Record<SourceKind, readonly string[]> = {
      raw_upstream:      ['Daily Worklog', 'My Book', 'By Broker', 'By Stock', 'Alerts & Briefing'],
      portfolio:         ['My Book', 'Daily Worklog (book overlay)', 'Catalysts (book filter)'],
      catalyst_calendar: ['Catalysts', 'Pre-event briefs'],
      market_data:       ['Calibration', 'Post-event reviews', 'Adaptive ranking (limited)'],
    }
    const staleness: Record<SourceKind, number> = {
      raw_upstream: 30 * 60, portfolio: 24 * 60 * 60,
      catalyst_calendar: 6 * 60 * 60, market_data: 4 * 60 * 60,
    }
    const now = new Date().toISOString()
    const sources: SourceIntegration[] = kinds.map((k) => ({
      id: asSourceId(`${scope.orgId as unknown as string}::${k}`),
      orgId: scope.orgId,
      kind: k,
      displayName: display[k],
      providerMode: 'fixture',
      status: 'degraded',
      freshness: {
        lastSyncedAt: now,
        ageSeconds: 0,
        stalenessThresholdSeconds: staleness[k],
        isStale: false,
      },
      degraded: {
        reasons: ['Serving fixture data.'],
        affectedModules: affected[k],
        servingFallback: true,
      },
      lastError: null,
      lastSuccessAt: now,
      nextScheduledAt: null,
      recentRuns: [],
      recentBackfills: [],
      watermark: null,
      config: {
        stalenessThresholdSeconds: staleness[k],
        retryBackoffSeconds: 60,
        pollIntervalSeconds: null,
        tokenEnvName: null,
        baseUrl: null,
      },
    }))
    return {
      orgId: scope.orgId,
      generatedAt: now,
      overall: 'degraded',
      counts: {
        total: sources.length,
        healthy: 0, stale: 0, degraded: sources.length, failing: 0, unknown: 0,
      },
      sources,
      backfillsInFlight: [],
    }
  }

  /** Module 25 — synthetic delivery history.
   *
   *  The mock fabricates a small in-app inbox so the dashboard's Inbox
   *  tab is exercised end-to-end without a live server. Real production
   *  data comes through the HTTP adapter against `/v1/deliveries`. */
  async listDeliveries(scope: OrgScope, query?: {
    contentKind?: DeliveryContentKind
    channel?: DeliveryChannel
    limit?: number
  }): Promise<readonly DeliveryAttempt[]> {
    await this.delay()
    const all = this.synthesiseInbox(scope.orgId)
    let arr = all.slice()
    if (query?.contentKind) arr = arr.filter((a) => a.contentKind === query.contentKind)
    if (query?.channel)     arr = arr.filter((a) => a.channel === query.channel)
    arr.sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt))
    if (query?.limit) arr = arr.slice(0, query.limit)
    return arr
  }

  async getDelivery(scope: OrgScope, id: DeliveryAttemptId): Promise<DeliveryAttempt | null> {
    await this.delay()
    const all = this.synthesiseInbox(scope.orgId)
    return all.find((a) => a.id === id) ?? null
  }

  private synthesiseInbox(orgId: import('../domain').OrgId): DeliveryAttempt[] {
    const now = Date.now()
    const userTarget = {
      id: asDeliveryTargetId(`${orgId as unknown as string}::in_app::usr_default`),
      orgId,
      channel: 'in_app' as const,
      label: 'In-app inbox',
      address: 'usr_default',
      userId: asUserId('usr_default'),
      enabled: true,
    }
    const mk = (
      offsetMin: number,
      contentKind: DeliveryContentKind,
      title: string,
      subtitle: string,
      bullets: readonly string[],
      counts: Readonly<Record<string, number>>,
      badges: readonly string[] = [],
      tab: 'briefing' | 'mybook' | 'catalysts' | 'sources' | 'worklog' = 'briefing',
    ): DeliveryAttempt => ({
      id: asDeliveryAttemptId(`mock_att_${contentKind}_${offsetMin}`),
      runId: asDeliveryRunId(`mock_run_${contentKind}_${offsetMin}`),
      orgId,
      contentKind,
      channel: 'in_app',
      target: userTarget,
      attemptNumber: 1,
      status: 'sent',
      fingerprint: `fp_${contentKind}_${offsetMin}`,
      enqueuedAt: new Date(now - offsetMin * 60 * 1000).toISOString(),
      sentAt: new Date(now - offsetMin * 60 * 1000).toISOString(),
      latencyMs: 0,
      errorCategory: null,
      errorMessage: null,
      nextRetryAt: null,
      payloadSummary: { title, subtitle, bullets, counts, badges },
      inAppBody: [title, '', ...bullets].join('\n'),
      clickThrough: { tab, entityId: null },
    })
    return [
      mk(15, 'morning_book_brief', 'Morning Book Brief',
         '2 critical · 5 high · 12 on book',
         ['INFY — Ambit raises target +13% on improving deal ramp',
          'TCS — Nuvama cuts to Sell on discretionary deferrals',
          '12 reports landed on book in last 24h'],
         { critical: 2, high: 5, onBookLast24h: 12 }, [], 'briefing'),
      mk(180, 'intraday_critical', 'Intraday Critical',
         '1 critical alert in last 15m',
         ['[CRITICAL] TCS — Nuvama downgrades to Sell, target ₹3,400'],
         { total: 1, critical: 1, high: 0 }, ['CRITICAL'], 'briefing'),
      mk(60 * 26, 'coverage_hygiene', 'Coverage Hygiene',
         '3 hygiene flags',
         ['HCLTECH — single-broker coverage on held name',
          'WIPRO — stale coverage 18d on watchlist',
          'ONGC — single-broker coverage on held name'],
         { hygiene_flags: 3 }, [], 'mybook'),
      mk(60 * 36, 'weekly_catalyst_brief', 'Weekly Catalyst Brief',
         '14 events · 4 high/critical',
         ['Tue 29 Apr · TCS · earnings · critical',
          'Thu 02 May · ICICIBANK · earnings · critical',
          'Fri 30 Apr · INFY · earnings · critical'],
         { upcoming: 14, high: 4 }, ['HIGH'], 'catalysts'),
    ]
  }

  // ── Internal ────────────────────────────────────────────────────────

  private delay(): Promise<void> {
    if (this.simulatedLatencyMs <= 0) return Promise.resolve()
    return new Promise((res) => setTimeout(res, this.simulatedLatencyMs))
  }
}
