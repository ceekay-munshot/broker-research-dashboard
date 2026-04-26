// ─────────────────────────────────────────────────────────────────────────
// FixtureUpstreamAdapter — integration-rehearsal mode.
//
// Implements `ResearchAdapter` by serving the bundled upstream JSON
// fixtures through the translation layer (`./mappers.ts`). Every read
// exercises the same mapper pipeline the real `HttpResearchAdapter` uses,
// so an integration test via this adapter catches real shape mismatches
// before the upstream comes online.
//
// No network. Offline-friendly. Backed by `src/adapters/upstream/fixtures/`.
//
// When to prefer this over `MockResearchAdapter`:
//   - You want to rehearse the wire-shape handshake (casing, nullability,
//     envelope structure) rather than the canonical domain shape.
//   - You want the contract-test harness to run in "app" mode.
//
// When to prefer `MockResearchAdapter`:
//   - You want realistic multi-org data, dozens of reports, and engine-
//     computed closures.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Organization, User, Broker, Sector, Stock,
  BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion,
  KpiSnapshot, IngestionStatus,
  PortfolioSnapshot,
  AlertEvent, AlertDigest, DigestKind,
  AlertId, DigestId,
  CalibrationSnapshot, BrokerCalibrationSummary,
  AlertEffectivenessSummary, CoverageSignalResult,
  AlertTriggerKind,
  CatalystEvent, PreEventBrief, PostEventReview, CatalystId, PostEventReviewId,
  OrgScope, Page,
  BrokerId, EmailId, ReportId, SectorId, StockTicker,
} from '../../domain'
import type { ConflictClosure, SectorIntelligence } from '../../engine/types'
import type { ResearchAdapter } from '../ResearchAdapter'
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListClosuresQuery,
} from '../queries'
import { OrgScopeViolationError } from '../errors'

import { cloneFixture } from './fixtureSource'
import {
  mapOrgScope, mapOrganization, mapUser,
  mapBrokers, mapSectors, mapStocks,
  mapBrokerEmailsPage, mapAttachments,
  mapResearchReportsPage, mapReportSummary, mapEvidenceSnippets,
  mapBrokerStockOpinions,
  mapConflictClosure, mapConflictClosures,
  mapSectorIntelligenceList,
  mapKpiSnapshot, mapIngestionStatus,
} from './mappers'

/**
 * Implements ResearchAdapter by routing fixture payloads through the
 * translation layer. Applies the same cross-tenant orgId guardrail as
 * `HttpResearchAdapter` so scope guarantees are identical.
 */
export class FixtureUpstreamAdapter implements ResearchAdapter {
  // ── Session ──────────────────────────────────────────────────────────

  async getSessionScope(): Promise<OrgScope> {
    return mapOrgScope(cloneFixture('sessionScope'))
  }

  // ── Tenant / catalog ────────────────────────────────────────────────

  async getOrganization(scope: OrgScope): Promise<Organization> {
    const org = mapOrganization(cloneFixture('organization'))
    assertOrgMatch('Organization', scope, org.id as unknown as string)
    return org
  }

  async getCurrentUser(scope: OrgScope): Promise<User> {
    const user = mapUser(cloneFixture('me'))
    assertOrgMatch('User', scope, user.orgId as unknown as string)
    return user
  }

  async listBrokers(_scope: OrgScope): Promise<readonly Broker[]> {
    return mapBrokers(cloneFixture('brokers'))
  }

  async getBroker(_scope: OrgScope, brokerId: BrokerId): Promise<Broker | null> {
    const list = mapBrokers(cloneFixture('brokers'))
    return list.find((b) => (b.id as unknown as string) === (brokerId as unknown as string)) ?? null
  }

  async listSectors(_scope: OrgScope): Promise<readonly Sector[]> {
    return mapSectors(cloneFixture('sectors'))
  }

  async getSector(_scope: OrgScope, sectorId: SectorId): Promise<Sector | null> {
    const list = mapSectors(cloneFixture('sectors'))
    return list.find((s) => (s.id as unknown as string) === (sectorId as unknown as string)) ?? null
  }

  async listStocks(_scope: OrgScope): Promise<readonly Stock[]> {
    return mapStocks(cloneFixture('stocks'))
  }

  async getStock(_scope: OrgScope, ticker: StockTicker): Promise<Stock | null> {
    const list = mapStocks(cloneFixture('stocks'))
    return list.find((s) => (s.ticker as unknown as string) === (ticker as unknown as string)) ?? null
  }

  // ── Raw inbound pipeline ────────────────────────────────────────────

  async listBrokerEmails(scope: OrgScope, _query: ListEmailsQuery = {}): Promise<Page<BrokerEmail>> {
    const page = mapBrokerEmailsPage(cloneFixture('brokerEmails'))
    page.items.forEach((it, i) => assertOrgMatch(`BrokerEmail[${i}]`, scope, it.orgId as unknown as string))
    return page
  }

  async getBrokerEmail(scope: OrgScope, emailId: EmailId): Promise<BrokerEmail | null> {
    const page = mapBrokerEmailsPage(cloneFixture('brokerEmails'))
    const item = page.items.find((e) => (e.id as unknown as string) === (emailId as unknown as string))
    if (!item) return null
    assertOrgMatch('BrokerEmail', scope, item.orgId as unknown as string)
    return item
  }

  async listAttachments(scope: OrgScope, emailId: EmailId): Promise<readonly Attachment[]> {
    const all = mapAttachments(cloneFixture('attachments'))
    const filtered = all.filter((a) => (a.emailId as unknown as string) === (emailId as unknown as string))
    filtered.forEach((it, i) => assertOrgMatch(`Attachment[${i}]`, scope, it.orgId as unknown as string))
    return filtered
  }

  // ── Normalized research artifacts ───────────────────────────────────

  async listResearchReports(scope: OrgScope, _query: ListReportsQuery = {}): Promise<Page<ResearchReport>> {
    const page = mapResearchReportsPage(cloneFixture('researchReports'))
    page.items.forEach((it, i) => assertOrgMatch(`ResearchReport[${i}]`, scope, it.orgId as unknown as string))
    return page
  }

  async getResearchReport(scope: OrgScope, reportId: ReportId): Promise<ResearchReport | null> {
    const page = mapResearchReportsPage(cloneFixture('researchReports'))
    const item = page.items.find((r) => (r.id as unknown as string) === (reportId as unknown as string))
    if (!item) return null
    assertOrgMatch('ResearchReport', scope, item.orgId as unknown as string)
    return item
  }

  async getReportSummary(scope: OrgScope, reportId: ReportId): Promise<ReportSummary | null> {
    const summary = mapReportSummary(cloneFixture('reportSummary'))
    // Our single fixture only maps rpt_001; everything else returns null.
    if ((summary.reportId as unknown as string) !== (reportId as unknown as string)) return null
    assertOrgMatch('ReportSummary', scope, summary.orgId as unknown as string)
    return summary
  }

  async listEvidenceSnippets(scope: OrgScope, reportId: ReportId): Promise<readonly EvidenceSnippet[]> {
    const all = mapEvidenceSnippets(cloneFixture('evidence'))
    const filtered = all.filter((e) => (e.reportId as unknown as string) === (reportId as unknown as string))
    filtered.forEach((it, i) => assertOrgMatch(`EvidenceSnippet[${i}]`, scope, it.orgId as unknown as string))
    return filtered
  }

  // ── Derived analytics ───────────────────────────────────────────────

  async listBrokerStockOpinions(scope: OrgScope, _query: ListOpinionsQuery = {}): Promise<readonly BrokerStockOpinion[]> {
    const all = mapBrokerStockOpinions(cloneFixture('opinions'))
    all.forEach((it, i) => assertOrgMatch(`BrokerStockOpinion[${i}]`, scope, it.orgId as unknown as string))
    return all
  }

  async getConflictClosure(_scope: OrgScope, ticker: StockTicker): Promise<ConflictClosure | null> {
    const closure = mapConflictClosure(cloneFixture('conflictClosure'))
    if ((closure.ticker as unknown as string) !== (ticker as unknown as string)) return null
    return closure
  }

  async listConflictClosures(_scope: OrgScope, _query: ListClosuresQuery = {}): Promise<readonly ConflictClosure[]> {
    return mapConflictClosures(cloneFixture('conflictClosures'))
  }

  async getSectorIntelligence(_scope: OrgScope, sectorId: SectorId): Promise<SectorIntelligence | null> {
    const list = mapSectorIntelligenceList(cloneFixture('sectorIntelligence'))
    return list.find((s) => (s.sectorId as unknown as string) === (sectorId as unknown as string))
      ?? null
  }

  async listSectorIntelligence(_scope: OrgScope): Promise<readonly SectorIntelligence[]> {
    return mapSectorIntelligenceList(cloneFixture('sectorIntelligence'))
  }

  // ── Dashboard + ops ─────────────────────────────────────────────────

  async getKpiSnapshot(scope: OrgScope): Promise<KpiSnapshot> {
    const snap = mapKpiSnapshot(cloneFixture('kpiSnapshot'))
    assertOrgMatch('KpiSnapshot', scope, snap.orgId as unknown as string)
    return snap
  }

  async getIngestionStatus(scope: OrgScope): Promise<IngestionStatus> {
    const status = mapIngestionStatus(cloneFixture('ingestionStatus'))
    assertOrgMatch('IngestionStatus', scope, status.orgId as unknown as string)
    return status
  }

  // ── Portfolio / watchlist ──────────────────────────────────────────
  // No fixture in this rehearsal mode; returning null exercises the
  // dashboard's "no portfolio configured" degraded path.
  async getPortfolioSnapshot(_scope: OrgScope): Promise<PortfolioSnapshot | null> {
    return null
  }

  // ── Alerts / digests (Module 19) ────────────────────────────────
  // Likewise no fixture — exercises the "no alerts yet" degraded path.
  async listAlerts(_scope: OrgScope): Promise<readonly AlertEvent[]> { return [] }
  async getAlert(_scope: OrgScope, _id: AlertId): Promise<AlertEvent | null> { return null }
  async listAlertDigests(_scope: OrgScope): Promise<readonly AlertDigest[]> { return [] }
  async getAlertDigest(_scope: OrgScope, _id: DigestId): Promise<AlertDigest | null> { return null }
  async getLatestAlertDigest(_scope: OrgScope, _kind: DigestKind): Promise<AlertDigest | null> { return null }

  // ── Calibration / signal effectiveness (Module 20) ──────────────
  // No fixture for the rehearsal mode; returns null/empty so the
  // calibration UI exercises the "no snapshot yet" degraded path.
  async getCalibrationSnapshot(_scope: OrgScope): Promise<CalibrationSnapshot | null> { return null }
  async listBrokerCalibrations(_scope: OrgScope): Promise<readonly BrokerCalibrationSummary[]> { return [] }
  async getBrokerCalibration(_scope: OrgScope, _id: BrokerId): Promise<BrokerCalibrationSummary | null> { return null }
  async listAlertEffectiveness(_scope: OrgScope): Promise<readonly AlertEffectivenessSummary[]> { return [] }
  async getAlertEffectiveness(_scope: OrgScope, _kind: AlertTriggerKind): Promise<AlertEffectivenessSummary | null> { return null }
  async getCoverageSignal(_scope: OrgScope, _t: StockTicker): Promise<CoverageSignalResult | null> { return null }

  // ── Catalysts (Module 21) ────────────────────────────────────────
  async listCatalysts(_scope: OrgScope): Promise<readonly CatalystEvent[]> { return [] }
  async getCatalyst(_scope: OrgScope, _id: CatalystId): Promise<CatalystEvent | null> { return null }
  async getLatestPreEventBrief(_scope: OrgScope, _id: CatalystId): Promise<PreEventBrief | null> { return null }
  async listPostEventReviews(_scope: OrgScope): Promise<readonly PostEventReview[]> { return [] }
  async getLatestPostEventReview(_scope: OrgScope, _id: CatalystId): Promise<PostEventReview | null> { return null }
  async getPostEventReview(_scope: OrgScope, _id: PostEventReviewId): Promise<PostEventReview | null> { return null }

  // ── Sources health (Module 24) ─────────────────────────────────────
  async getSourcesHealth(_scope: OrgScope): Promise<import('../../domain').SourcesHealthSnapshot | null> { return null }

  // ── Delivery (Module 25) ───────────────────────────────────────────
  async listDeliveries(_scope: OrgScope): Promise<readonly import('../../domain').DeliveryAttempt[]> { return [] }
  async getDelivery(_scope: OrgScope, _id: import('../../domain').DeliveryAttemptId): Promise<import('../../domain').DeliveryAttempt | null> { return null }

  // ── Usage / pilot analytics (Module 26) ────────────────────────────
  async recordUsage(_scope: OrgScope, _events: readonly import('../../domain').UsageEvent[]): Promise<void> { /* fixture: no-op */ }
  async getOrgUsageSnapshot(_scope: OrgScope): Promise<import('../../domain').OrgUsageSnapshot | null> { return null }
  async getPilotRoiSnapshot(_scope: OrgScope): Promise<import('../../domain').PilotRoiSnapshot | null> { return null }

  // ── Org control plane (Module 27) ──────────────────────────────────
  async getOrgSettings(_scope: OrgScope): Promise<import('../../domain').OrgSettings | null> { return null }
  async listConfigAuditEntries(_scope: OrgScope): Promise<readonly import('../../domain').ConfigAuditEntry[]> { return [] }
  async setFeatureFlag(): Promise<void> { /* fixture: no-op */ }
  async setModuleAccess(): Promise<void> { /* fixture: no-op */ }
  async setSourceMode(): Promise<void> { /* fixture: no-op */ }
  async setRolloutState(): Promise<void> { /* fixture: no-op */ }
}

// Last-line cross-tenant guard — identical to HttpResearchAdapter's.
function assertOrgMatch(kind: string, scope: OrgScope, returnedOrgId: string): void {
  const expected = scope.orgId as unknown as string
  if (returnedOrgId !== expected) {
    throw new OrgScopeViolationError(
      `${kind} returned for org="${returnedOrgId}" but request was scoped to org="${expected}"`,
    )
  }
}
