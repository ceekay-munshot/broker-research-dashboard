// ─────────────────────────────────────────────────────────────────────────
// ServerOutputAdapter — the default runtime adapter.
//
// The dashboard does NOT ingest mail, run LLM extraction, or aggregate
// research. The cofounder's server does all of that and produces a single
// `DashboardServerOutput` payload per snapshot.
//
// This adapter:
//   - Holds the current payload (or null when the server hasn't responded).
//   - Implements every `ResearchAdapter` method by slicing the payload, with
//     safe placeholder defaults so the dashboard renders its full shell
//     even when no payload exists.
//   - Exposes `getFeedStatus()` so the header chip can render the
//     waiting / live / delayed / error pill faithfully.
//   - Exposes `setPayload()` so the integration code (eventually an HTTP
//     fetcher) can hand a fresh payload over.
//
// No mocks are imported here. Empty/null/zero defaults are synthesized in
// place — the dashboard never invents broker names, stocks, counts,
// timestamps, or trends.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Organization, User, OrgScope, Page,
  Broker, BrokerEmail, Attachment, Sector, Stock,
  KpiSnapshot, IngestionStatus,
  ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, PortfolioSnapshot,
  AlertEvent, AlertDigest, DigestKind, AlertId, DigestId,
  AlertTriggerKind,
  CalibrationSnapshot, BrokerCalibrationSummary,
  AlertEffectivenessSummary, CoverageSignalResult,
  CatalystEvent, CatalystId, PreEventBrief,
  PostEventReview, PostEventReviewId,
  DeliveryAttempt, DeliveryAttemptId, DeliveryContentKind, DeliveryChannel,
  UsageEvent, OrgUsageSnapshot, PilotRoiSnapshot,
  OrgSettings, ConfigAuditEntry, ConfigAuditArea,
  FeatureFlagKey, AccessibleModule, RolloutState,
  SourceKind, SourceProviderMode,
  SourcesHealthSnapshot, SessionSafetySnapshot,
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
} from '../../domain'
import type { ConflictClosure, SectorIntelligence } from '../../engine/types'
import type { ResearchAdapter } from '../ResearchAdapter'
import type {
  ListEmailsQuery, ListReportsQuery,
  ListOpinionsQuery, ListClosuresQuery,
} from '../queries'
import type { DashboardServerOutput, FeedStatusPayload } from './types'
import { WAITING_FEED_STATUS } from './types'

// ── Placeholder synthesis ────────────────────────────────────────────────
//
// When no server payload exists, the dashboard still needs to bootstrap
// (resolve a session scope, render the org chip in the header, render the
// KPI cards as zeros). These placeholders are obvious-looking values —
// "Awaiting server output", "—", `0` — that signal "this is a shell, not
// real data" without inventing brokers / stocks / reports.

const PLACEHOLDER_ORG_ID = 'org_pending' as Organization['id']
const PLACEHOLDER_USER_ID = 'usr_pending' as User['id']

const PLACEHOLDER_SCOPE: OrgScope = {
  orgId: PLACEHOLDER_ORG_ID,
  actingUserId: PLACEHOLDER_USER_ID,
}

const PLACEHOLDER_ORG: Organization = {
  id: PLACEHOLDER_ORG_ID,
  name: 'Research desk',
  shortName: '—',
  forwardingAddress: '',
  createdAt: '',
  enabledBrokerIds: [],
  timeZone: 'UTC',
  defaultCurrency: 'USD',
}

const PLACEHOLDER_USER: User = {
  id: PLACEHOLDER_USER_ID,
  orgId: PLACEHOLDER_ORG_ID,
  email: '',
  displayName: '—',
  // `admin` so the full tab strip (incl. Pilot Analytics + Control Plane)
  // is visible while the dashboard awaits real server output. Once the
  // backend sends a real `currentUser`, the role is honored as authoritative.
  role: 'admin',
  createdAt: '',
}

function emptyKpi(orgId: Organization['id']): KpiSnapshot {
  return {
    orgId,
    asOf: '',
    brokersTracked: 0,
    reportsIngested: 0,
    stocksCovered: 0,
    divergenceFlags: 0,
    windowDeltas: {
      brokersTracked:  { value: 0, windowDays: 30 },
      reportsIngested: { value: 0, windowDays: 7 },
      stocksCovered:   { value: 0, windowDays: 30 },
      divergenceFlags: { value: 0, windowDays: 7 },
    },
  }
}

function emptyIngestionStatus(orgId: Organization['id']): IngestionStatus {
  return {
    orgId,
    asOf: '',
    queued: 0,
    processing: 0,
    readyLast24h: 0,
    failedLast24h: 0,
    throughputPerHour: 0,
  }
}

// ── Adapter ──────────────────────────────────────────────────────────────

type Listener = () => void

export class ServerOutputAdapter implements ResearchAdapter {
  private payload: DashboardServerOutput | null
  private readonly listeners = new Set<Listener>()

  constructor(initial: DashboardServerOutput | null = null) {
    this.payload = initial
  }

  /** Replace (or clear) the active payload. Subscribers are notified. */
  setPayload(next: DashboardServerOutput | null): void {
    this.payload = next
    this.listeners.forEach((l) => l())
  }

  /** Read the active payload. Returns null until the server sends one. */
  getPayload(): DashboardServerOutput | null {
    return this.payload
  }

  /** Subscribe to payload changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Header-chip data. The dashboard's only "is the feed alive?" surface. */
  getFeedStatus(): FeedStatusPayload {
    return this.payload?.feedStatus ?? WAITING_FEED_STATUS
  }

  // ── Session ──────────────────────────────────────────────────────────

  async getSessionScope(): Promise<OrgScope> {
    return this.payload?.sessionScope ?? PLACEHOLDER_SCOPE
  }

  // ── Tenant / catalog ─────────────────────────────────────────────────

  async getOrganization(_scope: OrgScope): Promise<Organization> {
    return this.payload?.organization ?? PLACEHOLDER_ORG
  }
  async getCurrentUser(_scope: OrgScope): Promise<User> {
    return this.payload?.currentUser ?? PLACEHOLDER_USER
  }
  async listBrokers(_scope: OrgScope): Promise<readonly Broker[]> {
    return this.payload?.brokers ?? []
  }
  async getBroker(_scope: OrgScope, brokerId: BrokerId): Promise<Broker | null> {
    return this.payload?.brokers.find((b) => b.id === brokerId) ?? null
  }
  async listSectors(_scope: OrgScope): Promise<readonly Sector[]> {
    return this.payload?.sectors ?? []
  }
  async getSector(_scope: OrgScope, sectorId: SectorId): Promise<Sector | null> {
    return this.payload?.sectors.find((s) => s.id === sectorId) ?? null
  }
  async listStocks(_scope: OrgScope): Promise<readonly Stock[]> {
    return this.payload?.stocks ?? []
  }
  async getStock(_scope: OrgScope, ticker: StockTicker): Promise<Stock | null> {
    return this.payload?.stocks.find((s) => s.ticker === ticker) ?? null
  }

  // ── Raw inbound pipeline ─────────────────────────────────────────────

  async listBrokerEmails(_scope: OrgScope, _query?: ListEmailsQuery): Promise<Page<BrokerEmail>> {
    const items = this.payload?.emails ?? []
    return { items, nextCursor: null, totalCount: items.length }
  }
  async getBrokerEmail(_scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null> {
    return this.payload?.emails.find((e) => e.id === emailId) ?? null
  }
  async listAttachments(_scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]> {
    return this.payload?.attachments.filter((a) => a.emailId === emailId) ?? []
  }

  // ── Normalized research artifacts ────────────────────────────────────

  async listResearchReports(_scope: OrgScope, _query?: ListReportsQuery): Promise<Page<ResearchReport>> {
    const items = this.payload?.reports ?? []
    return { items, nextCursor: null, totalCount: items.length }
  }
  async getResearchReport(_scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null> {
    return this.payload?.reports.find((r) => r.id === reportId) ?? null
  }
  async getReportSummary(_scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null> {
    return this.payload?.summaries.find((s) => s.reportId === reportId) ?? null
  }
  async listEvidenceSnippets(_scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]> {
    return this.payload?.evidence.filter((e) => e.reportId === reportId) ?? []
  }

  // ── Derived analytics ────────────────────────────────────────────────

  async listBrokerStockOpinions(_scope: OrgScope, _query?: ListOpinionsQuery): Promise<readonly BrokerStockOpinion[]> {
    return this.payload?.opinions ?? []
  }
  async getConflictClosure(_scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null> {
    return this.payload?.conflictClosures.find((c) => c.ticker === ticker) ?? null
  }
  async listConflictClosures(_scope: OrgScope, _query?: ListClosuresQuery): Promise<readonly ConflictClosure[]> {
    return this.payload?.conflictClosures ?? []
  }
  async getSectorIntelligence(_scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null> {
    return this.payload?.sectorIntelligence.find((s) => s.sectorId === sectorId) ?? null
  }
  async listSectorIntelligence(_scope: OrgScope): Promise<readonly SectorIntelligence[]> {
    return this.payload?.sectorIntelligence ?? []
  }

  // ── Dashboard + ops ──────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    return this.payload?.kpi ?? emptyKpi(scope.orgId)
  }
  async getIngestionStatus(scope: OrgScope): Promise<IngestionStatus> {
    // The chip uses getFeedStatus() directly; this is a back-compat surface
    // for any view-models still reading IngestionStatus.
    return emptyIngestionStatus(scope.orgId)
  }

  // ── Portfolio ─────────────────────────────────────────────────────────

  async getPortfolioSnapshot(_scope: OrgScope): Promise<PortfolioSnapshot | null> {
    return this.payload?.portfolio ?? null
  }

  // ── Alerts / digests ──────────────────────────────────────────────────

  async listAlerts(_scope: OrgScope, _query?: {
    sinceMs?: number; includeSuppressed?: boolean; limit?: number
  }): Promise<readonly AlertEvent[]> {
    return this.payload?.alerts ?? []
  }
  async getAlert(_scope: OrgScope, id: AlertId): Promise<AlertEvent | null> {
    return this.payload?.alerts.find((a) => a.id === id) ?? null
  }
  async listAlertDigests(_scope: OrgScope, query?: { kind?: DigestKind; limit?: number }): Promise<readonly AlertDigest[]> {
    const all = this.payload?.digests ?? []
    return query?.kind ? all.filter((d) => d.kind === query.kind) : all
  }
  async getAlertDigest(_scope: OrgScope, id: DigestId): Promise<AlertDigest | null> {
    return this.payload?.digests.find((d) => d.id === id) ?? null
  }
  async getLatestAlertDigest(_scope: OrgScope, kind: DigestKind): Promise<AlertDigest | null> {
    const all = (this.payload?.digests ?? []).filter((d) => d.kind === kind)
    if (all.length === 0) return null
    return [...all].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  }

  // ── Calibration ───────────────────────────────────────────────────────

  async getCalibrationSnapshot(_scope: OrgScope): Promise<CalibrationSnapshot | null> {
    return this.payload?.calibrationSnapshot ?? null
  }
  async listBrokerCalibrations(_scope: OrgScope): Promise<readonly BrokerCalibrationSummary[]> {
    return this.payload?.brokerCalibrations ?? []
  }
  async getBrokerCalibration(_scope: OrgScope, brokerId: BrokerId): Promise<BrokerCalibrationSummary | null> {
    return this.payload?.brokerCalibrations.find((c) => c.brokerId === brokerId) ?? null
  }
  async listAlertEffectiveness(_scope: OrgScope): Promise<readonly AlertEffectivenessSummary[]> {
    return this.payload?.alertEffectiveness ?? []
  }
  async getAlertEffectiveness(_scope: OrgScope, kind: AlertTriggerKind): Promise<AlertEffectivenessSummary | null> {
    return this.payload?.alertEffectiveness.find((e) => e.kind === kind) ?? null
  }
  async getCoverageSignal(_scope: OrgScope, ticker: StockTicker): Promise<CoverageSignalResult | null> {
    return this.payload?.coverageSignals.find((c) => c.ticker === ticker) ?? null
  }

  // ── Catalysts ─────────────────────────────────────────────────────────

  async listCatalysts(_scope: OrgScope): Promise<readonly CatalystEvent[]> {
    return this.payload?.catalysts ?? []
  }
  async getCatalyst(_scope: OrgScope, id: CatalystId): Promise<CatalystEvent | null> {
    return this.payload?.catalysts.find((c) => c.id === id) ?? null
  }
  async getLatestPreEventBrief(_scope: OrgScope, catalystId: CatalystId): Promise<PreEventBrief | null> {
    const briefs = (this.payload?.preEventBriefs ?? []).filter((b) => b.catalystId === catalystId)
    if (briefs.length === 0) return null
    return [...briefs].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  }
  async listPostEventReviews(_scope: OrgScope): Promise<readonly PostEventReview[]> {
    return this.payload?.postEventReviews ?? []
  }
  async getLatestPostEventReview(_scope: OrgScope, catalystId: CatalystId): Promise<PostEventReview | null> {
    const reviews = (this.payload?.postEventReviews ?? []).filter((r) => r.catalystId === catalystId)
    if (reviews.length === 0) return null
    return [...reviews].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  }
  async getPostEventReview(_scope: OrgScope, id: PostEventReviewId): Promise<PostEventReview | null> {
    return this.payload?.postEventReviews.find((r) => r.id === id) ?? null
  }

  // ── Sources health ────────────────────────────────────────────────────
  // Server-side concern; the dashboard never renders it. Always null.

  async getSourcesHealth(_scope: OrgScope): Promise<SourcesHealthSnapshot | null> {
    return null
  }

  // ── Delivery / workflow ──────────────────────────────────────────────

  async listDeliveries(_scope: OrgScope, query?: {
    contentKind?: DeliveryContentKind; channel?: DeliveryChannel; limit?: number
  }): Promise<readonly DeliveryAttempt[]> {
    let all = this.payload?.deliveries ?? []
    if (query?.contentKind) all = all.filter((d) => d.contentKind === query.contentKind)
    if (query?.channel)     all = all.filter((d) => d.channel === query.channel)
    if (query?.limit && query.limit > 0) all = all.slice(0, query.limit)
    return all
  }
  async getDelivery(_scope: OrgScope, id: DeliveryAttemptId): Promise<DeliveryAttempt | null> {
    return this.payload?.deliveries.find((d) => d.id === id) ?? null
  }

  // ── Usage / pilot analytics ──────────────────────────────────────────
  // Usage event recording is a fire-and-forget. The server may or may not
  // care; either way, never break the dashboard on failure.

  async recordUsage(_scope: OrgScope, _events: readonly UsageEvent[]): Promise<void> {
    // No-op until the server exposes a usage endpoint.
  }
  async getOrgUsageSnapshot(_scope: OrgScope, _opts?: { windowDays?: number }): Promise<OrgUsageSnapshot | null> {
    return this.payload?.orgUsageSnapshot ?? null
  }
  async getPilotRoiSnapshot(_scope: OrgScope, _opts?: { windowDays?: number }): Promise<PilotRoiSnapshot | null> {
    return this.payload?.pilotRoiSnapshot ?? null
  }

  // ── Org control plane ────────────────────────────────────────────────

  async getOrgSettings(_scope: OrgScope): Promise<OrgSettings | null> {
    return this.payload?.orgSettings ?? null
  }
  async listConfigAuditEntries(_scope: OrgScope, query?: { area?: ConfigAuditArea; limit?: number }): Promise<readonly ConfigAuditEntry[]> {
    let all = this.payload?.configAuditEntries ?? []
    if (query?.area) all = all.filter((e) => e.area === query.area)
    if (query?.limit && query.limit > 0) all = all.slice(0, query.limit)
    return all
  }
  // Operator writes are no-ops in the server-output adapter — the cofounder's
  // server is authoritative, the dashboard does not mutate state.
  async setFeatureFlag(_scope: OrgScope, _args: { key: FeatureFlagKey; enabled: boolean; reason?: string | null }): Promise<void> {
    /* no-op */
  }
  async setModuleAccess(_scope: OrgScope, _args: { module: AccessibleModule; enabled: boolean; reason?: string | null }): Promise<void> {
    /* no-op */
  }
  async setSourceMode(_scope: OrgScope, _args: { sourceKind: SourceKind; mode: SourceProviderMode; reason?: string | null }): Promise<void> {
    /* no-op */
  }
  async setRolloutState(_scope: OrgScope, _args: { state: RolloutState | null; note?: string | null; reason?: string | null }): Promise<void> {
    /* no-op */
  }

  // ── Session safety ───────────────────────────────────────────────────

  async getSessionSafety(_scope: OrgScope): Promise<SessionSafetySnapshot | null> {
    return this.payload?.sessionSafety ?? null
  }
}
