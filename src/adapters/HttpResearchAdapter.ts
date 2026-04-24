import type {
  Organization, User,
  Broker, BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet,
  Stock, BrokerStockOpinion,
  Sector,
  KpiSnapshot,
  IngestionStatus,
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
