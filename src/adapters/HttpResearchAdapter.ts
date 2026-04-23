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
import { ContractViolationError } from './errors'
import {
  parseOrgScope, parseOrganization, parseUser,
  parseBroker, parseSector, parseStock,
  parseBrokerEmail, parseAttachment,
  parseResearchReport, parseReportSummary, parseEvidenceSnippet,
  parseBrokerStockOpinion, parseConflictClosure, parseSectorIntelligence,
  parseKpiSnapshot, parseIngestionStatus, parsePage,
} from './http/parsers'

export interface HttpResearchAdapterOptions extends HttpClientOptions {
  // Future hook: allow callers to override how response parsers are invoked
  // (e.g. to relax contract checks in a maintenance window). No-op today.
}

/**
 * Production-shape adapter. Every method hits the backend via HttpClient,
 * then runs the response through a typed parser in src/adapters/http/parsers.ts
 * so contract drift surfaces as a ContractViolationError with a precise
 * field path instead of silent `undefined` in the UI.
 *
 * See docs/api-contract.md for the exact backend contract this adapter
 * expects.
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
    // the real adapter should move X-Org-Id out of the shared client here,
    // but for simplicity the server is expected to treat it as advisory.
    const raw = await this.client.request(endpoints.sessionScope(), {
      orgId: '' as OrgScope['orgId'],
      actingUserId: '' as OrgScope['actingUserId'],
    })
    return parseOrgScope(raw)
  }

  // ── Tenant / catalog ────────────────────────────────────────────────

  async getOrganization(scope: OrgScope): Promise<Organization> {
    const raw = await this.client.request(endpoints.organization(), scope)
    return parseOrganization(raw)
  }

  async getCurrentUser(scope: OrgScope): Promise<User> {
    const raw = await this.client.request(endpoints.currentUser(), scope)
    return parseUser(raw)
  }

  async listBrokers(scope: OrgScope): Promise<readonly Broker[]> {
    const raw = await this.client.request(endpoints.brokers(), scope)
    return parseArray(raw, 'brokers', parseBroker)
  }

  async getBroker(scope: OrgScope, brokerId: BrokerId): Promise<Broker | null> {
    const raw = await this.client.requestOrNull(endpoints.broker(brokerId), scope)
    return raw === null ? null : parseBroker(raw)
  }

  async listSectors(scope: OrgScope): Promise<readonly Sector[]> {
    const raw = await this.client.request(endpoints.sectors(), scope)
    return parseArray(raw, 'sectors', parseSector)
  }

  async getSector(scope: OrgScope, sectorId: SectorId): Promise<Sector | null> {
    const raw = await this.client.requestOrNull(endpoints.sector(sectorId), scope)
    return raw === null ? null : parseSector(raw)
  }

  async listStocks(scope: OrgScope): Promise<readonly Stock[]> {
    const raw = await this.client.request(endpoints.stocks(), scope)
    return parseArray(raw, 'stocks', parseStock)
  }

  async getStock(scope: OrgScope, ticker: StockTicker): Promise<Stock | null> {
    const raw = await this.client.requestOrNull(endpoints.stock(ticker), scope)
    return raw === null ? null : parseStock(raw)
  }

  // ── Raw inbound pipeline ────────────────────────────────────────────

  async listBrokerEmails(scope: OrgScope, query: ListEmailsQuery = {}): Promise<Page<BrokerEmail>> {
    const raw = await this.client.request(endpoints.brokerEmails(), scope, {
      query: {
        since: query.since,
        until: query.until,
        brokerIds: query.brokerIds as readonly string[] | undefined,
        statuses: query.statuses as readonly string[] | undefined,
        limit: query.limit,
        cursor: query.cursor,
      } satisfies QueryInput,
    })
    return parsePage(raw, 'Page<BrokerEmail>', (x, p) => parseBrokerEmail(x, p))
  }

  async getBrokerEmail(scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null> {
    const raw = await this.client.requestOrNull(endpoints.brokerEmail(emailId), scope)
    return raw === null ? null : parseBrokerEmail(raw)
  }

  async listAttachments(scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]> {
    const raw = await this.client.request(endpoints.attachmentsForEmail(emailId), scope)
    return parseArray(raw, 'attachments', parseAttachment)
  }

  // ── Normalized research artifacts ───────────────────────────────────

  async listResearchReports(scope: OrgScope, query: ListReportsQuery = {}): Promise<Page<ResearchReport>> {
    const raw = await this.client.request(endpoints.researchReports(), scope, {
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
    return parsePage(raw, 'Page<ResearchReport>', (x, p) => parseResearchReport(x, p))
  }

  async getResearchReport(scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null> {
    const raw = await this.client.requestOrNull(endpoints.researchReport(reportId), scope)
    return raw === null ? null : parseResearchReport(raw)
  }

  async getReportSummary(scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null> {
    const raw = await this.client.requestOrNull(endpoints.reportSummary(reportId), scope)
    return raw === null ? null : parseReportSummary(raw)
  }

  async listEvidenceSnippets(scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]> {
    const raw = await this.client.request(endpoints.reportEvidence(reportId), scope)
    return parseArray(raw, 'evidence', parseEvidenceSnippet)
  }

  // ── Derived analytics ───────────────────────────────────────────────

  async listBrokerStockOpinions(scope: OrgScope, query: ListOpinionsQuery = {}): Promise<readonly BrokerStockOpinion[]> {
    const raw = await this.client.request(endpoints.opinions(), scope, {
      query: {
        brokerIds: query.brokerIds as readonly string[] | undefined,
        tickers: query.tickers as readonly string[] | undefined,
      } satisfies QueryInput,
    })
    return parseArray(raw, 'opinions', parseBrokerStockOpinion)
  }

  async getConflictClosure(scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null> {
    const raw = await this.client.requestOrNull(endpoints.conflictClosure(ticker), scope)
    return raw === null ? null : parseConflictClosure(raw)
  }

  async listConflictClosures(scope: OrgScope, query: ListClosuresQuery = {}): Promise<readonly ConflictClosure[]> {
    const raw = await this.client.request(endpoints.conflictClosures(), scope, {
      query: {
        tickers: query.tickers as readonly string[] | undefined,
        sectorIds: query.sectorIds as readonly string[] | undefined,
        states: query.states as readonly string[] | undefined,
        minSpreadPct: query.minSpreadPct,
        mustHaveDisagreements: query.mustHaveDisagreements,
        mustHaveOutliers: query.mustHaveOutliers,
      } satisfies QueryInput,
    })
    return parseArray(raw, 'conflict-closures', parseConflictClosure)
  }

  async getSectorIntelligence(scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null> {
    const raw = await this.client.requestOrNull(endpoints.sectorIntelligenceFor(sectorId), scope)
    return raw === null ? null : parseSectorIntelligence(raw)
  }

  async listSectorIntelligence(scope: OrgScope): Promise<readonly SectorIntelligence[]> {
    const raw = await this.client.request(endpoints.sectorIntelligenceList(), scope)
    return parseArray(raw, 'sector-intelligence', parseSectorIntelligence)
  }

  // ── Dashboard + ops ─────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    const raw = await this.client.request(endpoints.kpiSnapshot(), scope)
    return parseKpiSnapshot(raw)
  }

  async getIngestionStatus(scope: OrgScope): Promise<IngestionStatus> {
    const raw = await this.client.request(endpoints.ingestionStatus(), scope)
    return parseIngestionStatus(raw)
  }
}

// Lightweight typed array parser used by every list method.
function parseArray<T>(raw: unknown, rootName: string, parseItem: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(raw)) {
    throw new ContractViolationError(rootName, `expected array, got ${raw === null ? 'null' : typeof raw}`)
  }
  return raw.map((x, i) => parseItem(x, `${rootName}[${i}]`))
}
