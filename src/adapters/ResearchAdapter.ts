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
  SourcesHealthSnapshot,
  DeliveryAttempt, DeliveryAttemptId, DeliveryContentKind, DeliveryChannel,
  UsageEvent, OrgUsageSnapshot, PilotRoiSnapshot,
  OrgSettings, FeatureFlagKey, AccessibleModule,
  SourceKind, SourceProviderMode, RolloutState, ConfigAuditEntry,
  SessionSafetySnapshot,
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

  // ─── Portfolio / watchlist (Module 18) ────────────────────────────────
  // Returns the org's current portfolio + watchlist snapshot, or null if
  // the org has no portfolio configured. Adapters that don't have a
  // portfolio source should return null — the dashboard degrades cleanly.
  getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null>

  // ─── Alerts / digests (Module 19) ─────────────────────────────────────
  /** Recent alert feed for the org, newest first. Suppressed alerts are
   *  hidden by default. Limit defaults are adapter-specific. */
  listAlerts(scope: OrgScope, query?: {
    readonly sinceMs?: number
    readonly includeSuppressed?: boolean
    readonly limit?: number
  }): Promise<readonly AlertEvent[]>
  getAlert(scope: OrgScope, id: AlertId): Promise<AlertEvent | null>

  /** Digests authored for the org, newest first. */
  listAlertDigests(scope: OrgScope, query?: {
    readonly kind?: DigestKind
    readonly limit?: number
  }): Promise<readonly AlertDigest[]>
  getAlertDigest(scope: OrgScope, id: DigestId): Promise<AlertDigest | null>
  /** Latest digest of a given kind, or null if none. */
  getLatestAlertDigest(scope: OrgScope, kind: DigestKind): Promise<AlertDigest | null>

  // ─── Calibration / signal effectiveness (Module 20) ───────────────────
  /** Latest calibration snapshot for the org, or null. */
  getCalibrationSnapshot(scope: OrgScope): Promise<CalibrationSnapshot | null>
  /** Per-broker calibration scorecards from the latest snapshot. */
  listBrokerCalibrations(scope: OrgScope): Promise<readonly BrokerCalibrationSummary[]>
  getBrokerCalibration(scope: OrgScope, brokerId: BrokerId): Promise<BrokerCalibrationSummary | null>
  /** Per-alert-kind effectiveness scorecards from the latest snapshot. */
  listAlertEffectiveness(scope: OrgScope): Promise<readonly AlertEffectivenessSummary[]>
  getAlertEffectiveness(scope: OrgScope, kind: AlertTriggerKind): Promise<AlertEffectivenessSummary | null>
  /** Per-ticker coverage signal from the latest snapshot. */
  getCoverageSignal(scope: OrgScope, ticker: StockTicker): Promise<CoverageSignalResult | null>

  // ─── Catalysts (Module 21) ────────────────────────────────────────────
  /** All catalysts for the org, sorted by expectedAt asc. */
  listCatalysts(scope: OrgScope): Promise<readonly CatalystEvent[]>
  getCatalyst(scope: OrgScope, id: CatalystId): Promise<CatalystEvent | null>
  /** Latest pre-event brief for a catalyst, or null. */
  getLatestPreEventBrief(scope: OrgScope, catalystId: CatalystId): Promise<PreEventBrief | null>
  /** All post-event reviews for the org. */
  listPostEventReviews(scope: OrgScope): Promise<readonly PostEventReview[]>
  /** Latest post-event review for a catalyst, or null. */
  getLatestPostEventReview(scope: OrgScope, catalystId: CatalystId): Promise<PostEventReview | null>
  /** Single post-event review by id, or null. */
  getPostEventReview(scope: OrgScope, id: PostEventReviewId): Promise<PostEventReview | null>

  // ─── Sources health (Module 24) ───────────────────────────────────────
  /** Org-level snapshot of all source integrations: provider mode, last
   *  sync, freshness, errors, backfills. Returns null when the adapter
   *  has no sources layer configured (older mock builds). */
  getSourcesHealth(scope: OrgScope): Promise<SourcesHealthSnapshot | null>

  // ─── Delivery / workflow (Module 25) ─────────────────────────────────
  /** Recent delivery attempts for the in-app inbox + operator surfaces. */
  listDeliveries(scope: OrgScope, query?: {
    readonly contentKind?: DeliveryContentKind
    readonly channel?: DeliveryChannel
    readonly limit?: number
  }): Promise<readonly DeliveryAttempt[]>
  /** Single delivery attempt by id — used for the inbox detail view. */
  getDelivery(scope: OrgScope, id: DeliveryAttemptId): Promise<DeliveryAttempt | null>

  // ─── Usage / pilot analytics (Module 26) ─────────────────────────────
  /** Fire-and-forget batch ingest of client-side usage events. The mock
   *  adapter persists in-memory; the HTTP adapter POSTs `/v1/usage/events`.
   *  Errors are swallowed — this must never break the dashboard. */
  recordUsage(scope: OrgScope, events: readonly UsageEvent[]): Promise<void>
  /** Org-level usage snapshot used by the Usage tab + CLI. Returns null
   *  when the adapter doesn't expose Module-26 yet. */
  getOrgUsageSnapshot(scope: OrgScope, opts?: { readonly windowDays?: number }): Promise<OrgUsageSnapshot | null>
  /** Pilot ROI snapshot used by the Usage tab + CLI export. */
  getPilotRoiSnapshot(scope: OrgScope, opts?: { readonly windowDays?: number }): Promise<PilotRoiSnapshot | null>

  // ─── Org control plane (Module 27) ───────────────────────────────────
  /** Effective org settings — flags + modules + integrations + delivery
   *  routing + permissions + rollout + recent audit. Returns null when the
   *  adapter has no control-plane layer (older builds). */
  getOrgSettings(scope: OrgScope): Promise<OrgSettings | null>
  /** Recent config audit entries. Subset of `OrgSettings.recentAudit` —
   *  exposed separately for paginated audit views. */
  listConfigAuditEntries(scope: OrgScope, query?: {
    readonly area?: import('../domain').ConfigAuditArea
    readonly limit?: number
  }): Promise<readonly ConfigAuditEntry[]>
  /** Operator-only: set a feature flag override. */
  setFeatureFlag(scope: OrgScope, args: {
    readonly key: FeatureFlagKey
    readonly enabled: boolean
    readonly reason?: string | null
  }): Promise<void>
  /** Operator-only: enable/disable a module for the org. */
  setModuleAccess(scope: OrgScope, args: {
    readonly module: AccessibleModule
    readonly enabled: boolean
    readonly reason?: string | null
  }): Promise<void>
  /** Operator-only: switch a source's provider mode. */
  setSourceMode(scope: OrgScope, args: {
    readonly sourceKind: SourceKind
    readonly mode: SourceProviderMode
    readonly reason?: string | null
  }): Promise<void>
  /** Operator-only: set rollout state + optional note. */
  setRolloutState(scope: OrgScope, args: {
    readonly state: RolloutState | null
    readonly note?: string | null
    readonly reason?: string | null
  }): Promise<void>

  // ─── Session safety (Module 28) ──────────────────────────────────────
  /** Operator-only: returns auth mode + session + recent denied-access. */
  getSessionSafety(scope: OrgScope): Promise<SessionSafetySnapshot | null>
}
