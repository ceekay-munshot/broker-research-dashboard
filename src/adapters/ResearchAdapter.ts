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
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListClosuresQuery,
} from './queries'

// The single contract the UI consumes. The mock adapter (src/adapters/
// MockResearchAdapter.ts) serves it out of src/mocks/* plus the deterministic
// src/engine/ analysis layer; a future HTTP adapter will implement the same
// interface against an authenticated backend.
//
// Read-only by design — every method is a query. Mutations that the product
// eventually needs (admin: enable/disable a broker, user preferences) belong
// on a separate adapter interface so the read surface stays observable and
// cacheable.
//
// Every method requires an OrgScope. The real adapter will cross-check the
// scope against the bearer token on every call and throw
// OrgScopeViolationError on mismatch; the mock adapter enforces it by
// filtering.
export interface ResearchAdapter {
  // ─── Session ─────────────────────────────────────────────────────────

  /**
   * Resolve the scope the current session is authorized for. Called once at
   * app bootstrap; the result is threaded through React context and used for
   * every subsequent method. In production the scope comes from the bearer
   * token; in the mock this returns a fixed developer-session fixture.
   */
  getSessionScope(): Promise<OrgScope>

  // ─── Tenant / catalog ─────────────────────────────────────────────────

  getOrganization(scope: OrgScope): Promise<Organization>
  getCurrentUser(scope: OrgScope): Promise<User>

  /** Brokers enabled for the scope's org, in the org's preferred ordering. */
  listBrokers(scope: OrgScope): Promise<readonly Broker[]>
  getBroker(scope: OrgScope, brokerId: BrokerId): Promise<Broker | null>

  listSectors(scope: OrgScope): Promise<readonly Sector[]>
  getSector(scope: OrgScope, sectorId: SectorId): Promise<Sector | null>

  /** Stocks that have at least one active report in the scope's org. */
  listStocks(scope: OrgScope): Promise<readonly Stock[]>
  getStock(scope: OrgScope, ticker: StockTicker): Promise<Stock | null>

  // ─── Raw inbound pipeline ─────────────────────────────────────────────

  listBrokerEmails(scope: OrgScope, query?: ListEmailsQuery): Promise<Page<BrokerEmail>>
  getBrokerEmail(scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null>
  listAttachments(scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]>

  // ─── Normalized research artifacts ───────────────────────────────────

  listResearchReports(scope: OrgScope, query?: ListReportsQuery): Promise<Page<ResearchReport>>
  getResearchReport(scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null>
  getReportSummary(scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null>
  listEvidenceSnippets(scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]>

  // ─── Derived analytics ────────────────────────────────────────────────
  // These are aggregations produced by the deterministic analysis layer
  // (src/engine/). The real adapter will serve them from a read-through
  // cache; the mock adapter computes them on-demand per call.

  listBrokerStockOpinions(scope: OrgScope, query?: ListOpinionsQuery): Promise<readonly BrokerStockOpinion[]>

  /** Full per-ticker conflict closure with consensus, disagreements, outliers, resultant. */
  getConflictClosure(scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null>
  listConflictClosures(scope: OrgScope, query?: ListClosuresQuery): Promise<readonly ConflictClosure[]>

  /** Per-sector accumulated intelligence: classified signals + resultant-state roll-up. */
  getSectorIntelligence(scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null>
  listSectorIntelligence(scope: OrgScope): Promise<readonly SectorIntelligence[]>

  // ─── Dashboard + ops ──────────────────────────────────────────────────

  getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot>
  getIngestionStatus(scope: OrgScope): Promise<IngestionStatus>
}
