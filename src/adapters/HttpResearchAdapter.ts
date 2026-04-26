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
} from '../domain'
import type { ConflictClosure, SectorIntelligence } from '../engine/types'
import type { ResearchAdapter } from './ResearchAdapter'
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListClosuresQuery,
} from './queries'
import { HttpClient, type HttpClientOptions, type QueryInput } from './http/HttpClient'
import { endpoints } from './http/endpoints'
import { OrgScopeViolationError } from './errors'
import {
  mapOrgScope, mapOrganization, mapUser,
  mapBroker, mapBrokers, mapSector, mapSectors, mapStock, mapStocks,
  mapBrokerEmail, mapBrokerEmailsPage, mapAttachments,
  mapResearchReport, mapResearchReportsPage, mapReportSummary, mapEvidenceSnippets,
  mapBrokerStockOpinions,
  mapConflictClosure, mapConflictClosures,
  mapSectorIntelligence, mapSectorIntelligenceList,
  mapKpiSnapshot, mapIngestionStatus,
  mapPortfolioSnapshot,
  mapAlertEvent, mapAlertEvents, mapAlertDigest, mapAlertDigests,
  mapCalibrationSnapshot, mapBrokerCalibrations, mapBrokerCalibrationSummary,
  mapAlertEffectivenessList, mapAlertEffectivenessSummary, mapCoverageSignalResult,
  mapCatalystEvent, mapCatalystEvents, mapPreEventBrief, mapPostEventReviews, mapPostEventReview,
} from './upstream/mappers'

export interface HttpResearchAdapterOptions extends HttpClientOptions {
  // Future hook: allow callers to override how response parsers are invoked
  // (e.g. to relax contract checks in a maintenance window). No-op today.
}

/**
 * Production-shape adapter. Every method hits the backend via HttpClient,
 * then runs the response through a typed mapper in
 * `src/adapters/upstream/mappers.ts`. The mapper layer is where upstream
 * payload-shape differences from the canonical domain are absorbed — see
 * docs/upstream-contract.md.
 *
 * After mapping, every org-scoped record is cross-checked against the
 * caller's scope. If the upstream ever returns a record whose `orgId` does
 * not match the scope the request was issued under, an
 * `OrgScopeViolationError` is thrown — a last-line guard against
 * cross-tenant data mixing, on top of the upstream's own authorization.
 * See docs/scope.md.
 */
export class HttpResearchAdapter implements ResearchAdapter {
  private readonly client: HttpClient

  constructor(options: HttpResearchAdapterOptions) {
    this.client = new HttpClient(options)
  }

  // ── Session ──────────────────────────────────────────────────────────

  async getSessionScope(): Promise<OrgScope> {
    // This single endpoint is scope-free (the whole point is to resolve
    // the scope). We pass a throwaway placeholder that the server ignores;
    // the upstream derives the scope from the bearer token.
    const raw = await this.client.request(endpoints.sessionScope(), {
      orgId: '' as OrgScope['orgId'],
      actingUserId: '' as OrgScope['actingUserId'],
    }, { endpointKey: 'sessionScope' })
    return mapOrgScope(raw)
  }

  // ── Tenant / catalog ────────────────────────────────────────────────

  async getOrganization(scope: OrgScope): Promise<Organization> {
    const raw = await this.client.request(endpoints.organization(), scope, { endpointKey: 'organization' })
    const org = mapOrganization(raw)
    assertOrgMatch('Organization', scope, org.id as unknown as string)
    return org
  }

  async getCurrentUser(scope: OrgScope): Promise<User> {
    const raw = await this.client.request(endpoints.currentUser(), scope, { endpointKey: 'currentUser' })
    const user = mapUser(raw)
    assertOrgMatch('User', scope, user.orgId as unknown as string)
    return user
  }

  async listBrokers(scope: OrgScope): Promise<readonly Broker[]> {
    const raw = await this.client.request(endpoints.brokers(), scope, { endpointKey: 'brokers' })
    // Brokers are a global catalog; no orgId on the record. Enablement is
    // filtered upstream by org.
    return mapBrokers(raw)
  }

  async getBroker(scope: OrgScope, brokerId: BrokerId): Promise<Broker | null> {
    const raw = await this.client.requestOrNull(endpoints.broker(brokerId), scope, { endpointKey: 'brokers' })
    return raw === null ? null : mapBroker(raw)
  }

  async listSectors(scope: OrgScope): Promise<readonly Sector[]> {
    const raw = await this.client.request(endpoints.sectors(), scope, { endpointKey: 'sectors' })
    return mapSectors(raw)
  }

  async getSector(scope: OrgScope, sectorId: SectorId): Promise<Sector | null> {
    const raw = await this.client.requestOrNull(endpoints.sector(sectorId), scope, { endpointKey: 'sectors' })
    return raw === null ? null : mapSector(raw)
  }

  async listStocks(scope: OrgScope): Promise<readonly Stock[]> {
    const raw = await this.client.request(endpoints.stocks(), scope, { endpointKey: 'stocks' })
    return mapStocks(raw)
  }

  async getStock(scope: OrgScope, ticker: StockTicker): Promise<Stock | null> {
    const raw = await this.client.requestOrNull(endpoints.stock(ticker), scope, { endpointKey: 'stocks' })
    return raw === null ? null : mapStock(raw)
  }

  // ── Raw inbound pipeline ────────────────────────────────────────────

  async listBrokerEmails(scope: OrgScope, query: ListEmailsQuery = {}): Promise<Page<BrokerEmail>> {
    const raw = await this.client.request(endpoints.brokerEmails(), scope, {
      endpointKey: 'brokerEmails',
      query: {
        since: query.since,
        until: query.until,
        brokerIds: query.brokerIds as readonly string[] | undefined,
        statuses: query.statuses as readonly string[] | undefined,
        limit: query.limit,
        cursor: query.cursor,
      } satisfies QueryInput,
    })
    const page = mapBrokerEmailsPage(raw)
    assertPageOrg('BrokerEmail', scope, page.items, (it) => it.orgId as unknown as string)
    return page
  }

  async getBrokerEmail(scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null> {
    const raw = await this.client.requestOrNull(endpoints.brokerEmail(emailId), scope, { endpointKey: 'brokerEmail' })
    if (raw === null) return null
    const email = mapBrokerEmail(raw)
    assertOrgMatch('BrokerEmail', scope, email.orgId as unknown as string)
    return email
  }

  async listAttachments(scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]> {
    const raw = await this.client.request(endpoints.attachmentsForEmail(emailId), scope, { endpointKey: 'attachments' })
    const items = mapAttachments(raw)
    assertPageOrg('Attachment', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  // ── Normalized research artifacts ───────────────────────────────────

  async listResearchReports(scope: OrgScope, query: ListReportsQuery = {}): Promise<Page<ResearchReport>> {
    const raw = await this.client.request(endpoints.researchReports(), scope, {
      endpointKey: 'researchReports',
      query: {
        since: query.since,
        until: query.until,
        brokerIds: query.brokerIds as readonly string[] | undefined,
        tickers: query.tickers as readonly string[] | undefined,
        sectorIds: query.sectorIds as readonly string[] | undefined,
        reportTypes: query.reportTypes as readonly string[] | undefined,
        stances: query.stances as readonly string[] | undefined,
        limit: query.limit,
        cursor: query.cursor,
      } satisfies QueryInput,
    })
    const page = mapResearchReportsPage(raw)
    assertPageOrg('ResearchReport', scope, page.items, (it) => it.orgId as unknown as string)
    return page
  }

  async getResearchReport(scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null> {
    const raw = await this.client.requestOrNull(endpoints.researchReport(reportId), scope, { endpointKey: 'researchReport' })
    if (raw === null) return null
    const report = mapResearchReport(raw)
    assertOrgMatch('ResearchReport', scope, report.orgId as unknown as string)
    return report
  }

  async getReportSummary(scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null> {
    const raw = await this.client.requestOrNull(endpoints.reportSummary(reportId), scope, { endpointKey: 'reportSummary' })
    if (raw === null) return null
    const summary = mapReportSummary(raw)
    assertOrgMatch('ReportSummary', scope, summary.orgId as unknown as string)
    return summary
  }

  async listEvidenceSnippets(scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]> {
    const raw = await this.client.request(endpoints.reportEvidence(reportId), scope, { endpointKey: 'reportEvidence' })
    const items = mapEvidenceSnippets(raw)
    assertPageOrg('EvidenceSnippet', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  // ── Derived analytics ───────────────────────────────────────────────

  async listBrokerStockOpinions(scope: OrgScope, query: ListOpinionsQuery = {}): Promise<readonly BrokerStockOpinion[]> {
    const raw = await this.client.request(endpoints.opinions(), scope, {
      endpointKey: 'opinions',
      query: {
        brokerIds: query.brokerIds as readonly string[] | undefined,
        tickers: query.tickers as readonly string[] | undefined,
      } satisfies QueryInput,
    })
    const items = mapBrokerStockOpinions(raw)
    assertPageOrg('BrokerStockOpinion', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getConflictClosure(scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null> {
    const raw = await this.client.requestOrNull(endpoints.conflictClosure(ticker), scope, { endpointKey: 'conflictClosure' })
    return raw === null ? null : mapConflictClosure(raw)
  }

  async listConflictClosures(scope: OrgScope, query: ListClosuresQuery = {}): Promise<readonly ConflictClosure[]> {
    const raw = await this.client.request(endpoints.conflictClosures(), scope, {
      endpointKey: 'conflictClosures',
      query: {
        tickers: query.tickers as readonly string[] | undefined,
        sectorIds: query.sectorIds as readonly string[] | undefined,
        states: query.states as readonly string[] | undefined,
        minSpreadPct: query.minSpreadPct,
        mustHaveDisagreements: query.mustHaveDisagreements,
        mustHaveOutliers: query.mustHaveOutliers,
      } satisfies QueryInput,
    })
    return mapConflictClosures(raw)
  }

  async getSectorIntelligence(scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null> {
    const raw = await this.client.requestOrNull(endpoints.sectorIntelligenceFor(sectorId), scope, { endpointKey: 'sectorIntelligenceFor' })
    return raw === null ? null : mapSectorIntelligence(raw)
  }

  async listSectorIntelligence(scope: OrgScope): Promise<readonly SectorIntelligence[]> {
    const raw = await this.client.request(endpoints.sectorIntelligenceList(), scope, { endpointKey: 'sectorIntelligence' })
    return mapSectorIntelligenceList(raw)
  }

  // ── Dashboard + ops ─────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    const raw = await this.client.request(endpoints.kpiSnapshot(), scope, { endpointKey: 'kpiSnapshot' })
    const snap = mapKpiSnapshot(raw)
    assertOrgMatch('KpiSnapshot', scope, snap.orgId as unknown as string)
    return snap
  }

  async getIngestionStatus(scope: OrgScope): Promise<IngestionStatus> {
    const raw = await this.client.request(endpoints.ingestionStatus(), scope, { endpointKey: 'ingestionStatus' })
    const status = mapIngestionStatus(raw)
    assertOrgMatch('IngestionStatus', scope, status.orgId as unknown as string)
    return status
  }

  // ── Portfolio / watchlist ──────────────────────────────────────────

  async getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null> {
    const raw = await this.client.requestOrNull(endpoints.portfolioSnapshot(), scope, {
      endpointKey: 'portfolioSnapshot',
    })
    if (raw === null) return null
    const snap = mapPortfolioSnapshot(raw)
    assertOrgMatch('PortfolioSnapshot', scope, snap.orgId as unknown as string)
    return snap
  }

  // ── Alerts / digests (Module 19) ───────────────────────────────────

  async listAlerts(
    scope: OrgScope,
    query: { sinceMs?: number; includeSuppressed?: boolean; limit?: number } = {},
  ): Promise<readonly AlertEvent[]> {
    const raw = await this.client.request(endpoints.alerts(), scope, {
      endpointKey: 'alerts',
      query: {
        sinceMs: query.sinceMs,
        includeSuppressed: query.includeSuppressed,
        limit: query.limit,
      } satisfies QueryInput,
    })
    const items = mapAlertEvents(raw)
    assertPageOrg('AlertEvent', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getAlert(scope: OrgScope, id: AlertId): Promise<AlertEvent | null> {
    const raw = await this.client.requestOrNull(endpoints.alert(id), scope, { endpointKey: 'alert' })
    if (raw === null) return null
    const a = mapAlertEvent(raw)
    assertOrgMatch('AlertEvent', scope, a.orgId as unknown as string)
    return a
  }

  async listAlertDigests(
    scope: OrgScope,
    query: { kind?: DigestKind; limit?: number } = {},
  ): Promise<readonly AlertDigest[]> {
    const raw = await this.client.request(endpoints.alertDigests(), scope, {
      endpointKey: 'alertDigests',
      query: { kind: query.kind, limit: query.limit } satisfies QueryInput,
    })
    const items = mapAlertDigests(raw)
    assertPageOrg('AlertDigest', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getAlertDigest(scope: OrgScope, id: DigestId): Promise<AlertDigest | null> {
    const raw = await this.client.requestOrNull(endpoints.alertDigest(id), scope, {
      endpointKey: 'alertDigest',
    })
    if (raw === null) return null
    const d = mapAlertDigest(raw)
    assertOrgMatch('AlertDigest', scope, d.orgId as unknown as string)
    return d
  }

  async getLatestAlertDigest(scope: OrgScope, kind: DigestKind): Promise<AlertDigest | null> {
    const raw = await this.client.requestOrNull(endpoints.latestAlertDigest(), scope, {
      endpointKey: 'latestAlertDigest',
      query: { kind } satisfies QueryInput,
    })
    if (raw === null) return null
    const d = mapAlertDigest(raw)
    assertOrgMatch('AlertDigest', scope, d.orgId as unknown as string)
    return d
  }

  // ── Calibration / signal effectiveness (Module 20) ─────────────────

  async getCalibrationSnapshot(scope: OrgScope): Promise<CalibrationSnapshot | null> {
    const raw = await this.client.requestOrNull(endpoints.calibrationSnapshot(), scope, {
      endpointKey: 'calibrationSnapshot',
    })
    if (raw === null) return null
    const snap = mapCalibrationSnapshot(raw)
    assertOrgMatch('CalibrationSnapshot', scope, snap.orgId as unknown as string)
    return snap
  }

  async listBrokerCalibrations(scope: OrgScope): Promise<readonly BrokerCalibrationSummary[]> {
    const raw = await this.client.request(endpoints.brokerCalibrations(), scope, {
      endpointKey: 'brokerCalibrations',
    })
    const items = mapBrokerCalibrations(raw)
    assertPageOrg('BrokerCalibrationSummary', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getBrokerCalibration(scope: OrgScope, brokerId: BrokerId): Promise<BrokerCalibrationSummary | null> {
    const raw = await this.client.requestOrNull(endpoints.brokerCalibration(brokerId), scope, {
      endpointKey: 'brokerCalibration',
    })
    if (raw === null) return null
    const item = mapBrokerCalibrationSummary(raw)
    assertOrgMatch('BrokerCalibrationSummary', scope, item.orgId as unknown as string)
    return item
  }

  async listAlertEffectiveness(scope: OrgScope): Promise<readonly AlertEffectivenessSummary[]> {
    const raw = await this.client.request(endpoints.alertEffectivenessList(), scope, {
      endpointKey: 'alertEffectivenessList',
    })
    const items = mapAlertEffectivenessList(raw)
    assertPageOrg('AlertEffectivenessSummary', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getAlertEffectiveness(scope: OrgScope, kind: AlertTriggerKind): Promise<AlertEffectivenessSummary | null> {
    const raw = await this.client.requestOrNull(endpoints.alertEffectiveness(kind), scope, {
      endpointKey: 'alertEffectiveness',
    })
    if (raw === null) return null
    const item = mapAlertEffectivenessSummary(raw)
    assertOrgMatch('AlertEffectivenessSummary', scope, item.orgId as unknown as string)
    return item
  }

  async getCoverageSignal(scope: OrgScope, ticker: StockTicker): Promise<CoverageSignalResult | null> {
    const raw = await this.client.requestOrNull(endpoints.coverageSignal(ticker), scope, {
      endpointKey: 'coverageSignal',
    })
    if (raw === null) return null
    const item = mapCoverageSignalResult(raw)
    assertOrgMatch('CoverageSignalResult', scope, item.orgId as unknown as string)
    return item
  }

  // ── Catalysts (Module 21) ──────────────────────────────────────────

  async listCatalysts(scope: OrgScope): Promise<readonly CatalystEvent[]> {
    const raw = await this.client.request(endpoints.catalysts(), scope, { endpointKey: 'catalysts' })
    const items = mapCatalystEvents(raw)
    assertPageOrg('CatalystEvent', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getCatalyst(scope: OrgScope, id: CatalystId): Promise<CatalystEvent | null> {
    const raw = await this.client.requestOrNull(endpoints.catalyst(id), scope, { endpointKey: 'catalyst' })
    if (raw === null) return null
    const item = mapCatalystEvent(raw)
    assertOrgMatch('CatalystEvent', scope, item.orgId as unknown as string)
    return item
  }

  async getLatestPreEventBrief(scope: OrgScope, id: CatalystId): Promise<PreEventBrief | null> {
    const raw = await this.client.requestOrNull(endpoints.catalystBrief(id), scope, { endpointKey: 'catalystBrief' })
    if (raw === null) return null
    const item = mapPreEventBrief(raw)
    assertOrgMatch('PreEventBrief', scope, item.orgId as unknown as string)
    return item
  }

  async listPostEventReviews(scope: OrgScope): Promise<readonly PostEventReview[]> {
    const raw = await this.client.request(endpoints.postEventReviews(), scope, { endpointKey: 'postEventReviews' })
    const items = mapPostEventReviews(raw)
    assertPageOrg('PostEventReview', scope, items, (it) => it.orgId as unknown as string)
    return items
  }

  async getLatestPostEventReview(scope: OrgScope, id: CatalystId): Promise<PostEventReview | null> {
    const raw = await this.client.requestOrNull(endpoints.catalystPostEventReview(id), scope, {
      endpointKey: 'catalystPostEventReview',
    })
    if (raw === null) return null
    const item = mapPostEventReview(raw)
    assertOrgMatch('PostEventReview', scope, item.orgId as unknown as string)
    return item
  }

  async getPostEventReview(scope: OrgScope, id: PostEventReviewId): Promise<PostEventReview | null> {
    const raw = await this.client.requestOrNull(endpoints.postEventReview(id), scope, {
      endpointKey: 'postEventReview',
    })
    if (raw === null) return null
    const item = mapPostEventReview(raw)
    assertOrgMatch('PostEventReview', scope, item.orgId as unknown as string)
    return item
  }
}

// ── Cross-tenant guardrails ──────────────────────────────────────────
// These are a last-line defense: the upstream is already responsible for
// enforcing org isolation. We cross-check here so that a misconfigured or
// compromised upstream cannot silently return cross-tenant data to the UI.

function assertOrgMatch(kind: string, scope: OrgScope, returnedOrgId: string): void {
  const expected = scope.orgId as unknown as string
  if (returnedOrgId !== expected) {
    throw new OrgScopeViolationError(
      `${kind} returned for org="${returnedOrgId}" but request was scoped to org="${expected}"`,
    )
  }
}

function assertPageOrg<T>(
  kind: string,
  scope: OrgScope,
  items: readonly T[],
  getOrgId: (item: T) => string,
): void {
  const expected = scope.orgId as unknown as string
  for (let i = 0; i < items.length; i++) {
    const got = getOrgId(items[i]!)
    if (got !== expected) {
      throw new OrgScopeViolationError(
        `${kind}[${i}] returned for org="${got}" but request was scoped to org="${expected}"`,
      )
    }
  }
}
