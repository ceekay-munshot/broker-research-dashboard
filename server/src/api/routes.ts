import type {
  BrokerEmail, ResearchReport, OrgScope, StockTicker, SectorId, ReportId, EmailId, Stance, Rating, Stock, Sector, Broker, Organization, User,
  EmailProcessingStatus, KpiSnapshot, IngestionStatus, Page,
  PortfolioSnapshot,
  AlertDigest, AlertEvent, DigestKind,
  BrokerCalibrationSummary, AlertEffectivenessSummary, CoverageSignalResult,
  CalibrationSnapshot,
  AlertTriggerKind,
  CatalystEvent, PreEventBrief, PostEventReview,
} from '../../../src/domain'
import type { ConflictClosure, SectorIntelligence, ResultantState } from '../../../src/engine/types'
import { buildConflictClosure, buildSectorIntelligence } from '../../../src/engine'
import { asEmailId, asReportId, asSectorId, asTicker, asAlertId, asDigestId, asBrokerId, asCatalystId, asPreEventBriefId, asPostEventReviewId } from '../../../src/lib/ids'
import type { IncomingMessage } from 'node:http'
import { Router } from './router'
import { reply } from './responses'
import type { InMemoryStore } from '../store/InMemoryStore'
import type { SourceManager } from '../sources'
import type { Repo } from '../persistence'
import type {
  DeliveryAttemptId, DeliveryContentKind, DeliveryChannel,
  UsageEvent,
  FeatureFlagKey, AccessibleModule, SourceKind, SourceProviderMode,
  RolloutState, ConfigAuditArea, UserRole,
} from '../../../src/domain'
import { asDeliveryAttemptId } from '../../../src/lib/ids'
import { buildOrgUsageSnapshot, buildPilotRoiSnapshot } from '../usage'
import {
  resolveOrgSettings, setFeatureFlag, setModuleAccess, setSourceMode,
  setRolloutState, OrgControlServiceError,
} from '../orgControl'
import {
  organizations, users, brokers, sectors, stocks,
} from '../config/organizations'
import { VIMANA_ORG_ID } from '../../../src/mocks/organizations'
import { VIMANA_USER_ID } from '../../../src/mocks/users'
import { portfolioSnapshots } from '../../../src/mocks/portfolios'

// Every route from docs/api-contract.md. Shapes the JSON exactly as the
// frontend's HttpResearchAdapter parsers expect.
//
// The backend's default session scope is the Vimana Capital tenant — that's
// the org whose vimana@vimanacapital.com inbox receives the real .eml
// samples under server/fixtures/eml/. When running `npm run dev:http` the
// frontend renders Vimana's data; the mock-adapter path still defaults to
// the synthetic Aranya tenant.

const FIXED_SESSION_SCOPE: OrgScope = {
  orgId: VIMANA_ORG_ID,
  actingUserId: VIMANA_USER_ID,
}

export interface BuildRouterOptions {
  readonly sourceManager?: SourceManager
  /** Repo is required for the delivery endpoints (Module 25). */
  readonly repo?: Repo
}

export function buildRouter(store: InMemoryStore, opts: BuildRouterOptions = {}): Router {
  const r = new Router()

  // ── Session ────────────────────────────────────────────────────────
  r.get('/v1/session/scope', ({ res }) => reply.ok(res, FIXED_SESSION_SCOPE))

  // ── Tenant / catalog ───────────────────────────────────────────────
  r.get('/v1/organization', ({ res, scope }) => {
    const org = findOrg(scope)
    if (!org) return reply.forbidden(res, `unknown org ${scope.orgId}`)
    reply.ok(res, org)
  })

  r.get('/v1/me', ({ res, scope }) => {
    const user = users.find((u) => u.id === scope.actingUserId && u.orgId === scope.orgId)
    if (!user) return reply.forbidden(res, `user ${scope.actingUserId} not a member of ${scope.orgId}`)
    reply.ok(res, user)
  })

  r.get('/v1/brokers', ({ res, scope }) => {
    const org = findOrg(scope)
    if (!org) return reply.forbidden(res, `unknown org ${scope.orgId}`)
    const enabled = new Set<string>(org.enabledBrokerIds as unknown as string[])
    reply.ok(res, brokers.filter((b) => enabled.has(b.id as unknown as string)))
  })
  r.get('/v1/brokers/:brokerId', ({ res, scope, params }) => {
    const org = findOrg(scope)
    if (!org) return reply.forbidden(res, `unknown org ${scope.orgId}`)
    const enabled = new Set<string>(org.enabledBrokerIds as unknown as string[])
    const b = brokers.find((x) => x.id === params.brokerId && enabled.has(x.id as unknown as string))
    if (!b) return reply.notFound(res, `broker ${params.brokerId}`)
    reply.ok(res, b)
  })

  r.get('/v1/sectors', ({ res }) => reply.ok(res, sectors))
  r.get('/v1/sectors/:sectorId', ({ res, params }) => {
    const s = sectors.find((x) => x.id === params.sectorId)
    if (!s) return reply.notFound(res, `sector ${params.sectorId}`)
    reply.ok(res, s)
  })

  r.get('/v1/stocks', ({ res, scope }) => {
    const covered = new Set(store.listCoveredTickers(scope.orgId) as unknown as string[])
    reply.ok(res, stocks.filter((s) => covered.has(s.ticker as unknown as string)))
  })
  r.get('/v1/stocks/:ticker', ({ res, scope, params }) => {
    const covered = new Set(store.listCoveredTickers(scope.orgId) as unknown as string[])
    const t = params.ticker!
    if (!covered.has(t)) return reply.notFound(res, `stock ${t}`)
    const s = stocks.find((x) => x.ticker === asTicker(t))
    if (!s) return reply.notFound(res, `stock ${t}`)
    reply.ok(res, s)
  })

  // ── Raw pipeline ───────────────────────────────────────────────────
  r.get('/v1/broker-emails', ({ res, scope, query }) => {
    const brokerIds = arrParam(query, 'brokerIds')
    const statuses = arrParam(query, 'statuses')
    const since = strParam(query, 'since')
    const until = strParam(query, 'until')
    const limit = numParam(query, 'limit') ?? 50

    let items = store.listEmails(scope.orgId)
    if (since) items = items.filter((e) => e.receivedAt >= since)
    if (until) items = items.filter((e) => e.receivedAt <= until)
    if (brokerIds) items = items.filter((e) => e.brokerId !== null && brokerIds.includes(e.brokerId as unknown as string))
    if (statuses) items = items.filter((e) => statuses.includes(e.status))

    const page: Page<BrokerEmail> = {
      items: items.slice(0, limit),
      nextCursor: items.length > limit ? 'truncated' : null,
      totalCount: items.length,
    }
    reply.ok(res, page)
  })
  r.get('/v1/broker-emails/:emailId', ({ res, scope, params }) => {
    const e = store.getEmail(scope.orgId, asEmailId(params.emailId!))
    if (!e) return reply.notFound(res, `email ${params.emailId}`)
    reply.ok(res, e)
  })
  r.get('/v1/broker-emails/:emailId/attachments', ({ res, scope, params }) => {
    const id = asEmailId(params.emailId!)
    const e = store.getEmail(scope.orgId, id)
    if (!e) return reply.notFound(res, `email ${params.emailId}`)
    reply.ok(res, store.listAttachmentsForEmail(scope.orgId, id))
  })

  // ── Research artifacts ────────────────────────────────────────────
  r.get('/v1/research-reports', ({ res, scope, query }) => {
    const brokerIds = arrParam(query, 'brokerIds')
    const tickers = arrParam(query, 'tickers')
    const sectorIds = arrParam(query, 'sectorIds')
    const reportTypes = arrParam(query, 'reportTypes')
    const stances = arrParam(query, 'stances') as readonly Stance[] | undefined
    const since = strParam(query, 'since')
    const until = strParam(query, 'until')
    const limit = numParam(query, 'limit') ?? 50

    let items = store.listReports(scope.orgId)
    if (since) items = items.filter((r) => r.publishedAt >= since)
    if (until) items = items.filter((r) => r.publishedAt <= until)
    if (brokerIds) items = items.filter((r) => brokerIds.includes(r.brokerId as unknown as string))
    if (tickers) items = items.filter((r) => r.tickers.some((t) => tickers.includes(t as unknown as string)))
    if (sectorIds) items = items.filter((r) => r.sectorIds.some((s) => sectorIds.includes(s as unknown as string)))
    if (reportTypes) items = items.filter((r) => reportTypes.includes(r.reportType))
    if (stances) {
      const summariesByReport = new Map(store.listSummaries(scope.orgId).map((s) => [s.reportId as unknown as string, s]))
      items = items.filter((r) => {
        const sum = summariesByReport.get(r.id as unknown as string)
        return sum !== undefined && stances.includes(sum.stance)
      })
    }

    const page: Page<ResearchReport> = {
      items: items.slice(0, limit),
      nextCursor: items.length > limit ? 'truncated' : null,
      totalCount: items.length,
    }
    reply.ok(res, page)
  })
  r.get('/v1/research-reports/:reportId', ({ res, scope, params }) => {
    const rpt = store.getReport(scope.orgId, asReportId(params.reportId!))
    if (!rpt) return reply.notFound(res, `report ${params.reportId}`)
    reply.ok(res, rpt)
  })
  r.get('/v1/research-reports/:reportId/summary', ({ res, scope, params }) => {
    const sum = store.getSummaryForReport(scope.orgId, asReportId(params.reportId!))
    if (!sum) return reply.notFound(res, `summary for ${params.reportId}`)
    reply.ok(res, sum)
  })
  r.get('/v1/research-reports/:reportId/evidence', ({ res, scope, params }) => {
    reply.ok(res, store.listEvidenceForReport(scope.orgId, asReportId(params.reportId!)))
  })

  // ── Derived analytics ─────────────────────────────────────────────
  r.get('/v1/opinions', ({ res, scope, query }) => {
    const brokerIds = arrParam(query, 'brokerIds')
    const tickers = arrParam(query, 'tickers')
    let items = store.listOpinions(scope.orgId)
    if (brokerIds) items = items.filter((o) => brokerIds.includes(o.brokerId as unknown as string))
    if (tickers) items = items.filter((o) => tickers.includes(o.ticker as unknown as string))
    reply.ok(res, items)
  })

  r.get('/v1/conflict-closures', ({ res, scope, query }) => {
    const tickers = arrParam(query, 'tickers')
    const sectorIds = arrParam(query, 'sectorIds')
    const states = arrParam(query, 'states') as readonly ResultantState[] | undefined
    const minSpread = numParam(query, 'minSpreadPct')
    const mustHaveDis = boolParam(query, 'mustHaveDisagreements')
    const mustHaveOut = boolParam(query, 'mustHaveOutliers')

    const coveredTickers = store.listCoveredTickers(scope.orgId)
    const filteredTickers = coveredTickers
      .filter((t) => !tickers || tickers.includes(t as unknown as string))
      .filter((t) => {
        if (!sectorIds) return true
        const stock = stocks.find((s) => s.ticker === t)
        return stock !== undefined && sectorIds.includes(stock.sectorId as unknown as string)
      })

    const out: ConflictClosure[] = []
    for (const ticker of filteredTickers) {
      const closure = closureForTicker(store, scope, ticker)
      if (!closure) continue
      if (minSpread !== undefined && (closure.targetStats.spreadPct ?? 0) < minSpread) continue
      if (mustHaveDis && closure.disagreements.length === 0) continue
      if (mustHaveOut && closure.outliers.length === 0) continue
      if (states && !states.includes(closure.resultant.state)) continue
      out.push(closure)
    }
    out.sort((a, b) => (b.targetStats.spreadPct ?? 0) - (a.targetStats.spreadPct ?? 0))
    reply.ok(res, out)
  })
  r.get('/v1/conflict-closures/:ticker', ({ res, scope, params }) => {
    const c = closureForTicker(store, scope, asTicker(params.ticker!))
    if (!c) return reply.notFound(res, `closure ${params.ticker}`)
    reply.ok(res, c)
  })

  r.get('/v1/sector-intelligence', ({ res, scope }) => {
    const out: SectorIntelligence[] = []
    for (const sector of sectors) {
      const si = sectorIntelligenceFor(store, scope, sector)
      if (si) out.push(si)
    }
    reply.ok(res, out)
  })
  r.get('/v1/sector-intelligence/:sectorId', ({ res, scope, params }) => {
    const sector = sectors.find((s) => s.id === asSectorId(params.sectorId!))
    if (!sector) return reply.notFound(res, `sector ${params.sectorId}`)
    const si = sectorIntelligenceFor(store, scope, sector)
    if (!si) return reply.notFound(res, `sector intel ${params.sectorId}`)
    reply.ok(res, si)
  })

  // ── KPI + ingestion status ────────────────────────────────────────
  r.get('/v1/kpi-snapshot', ({ res, scope }) => {
    const counts = store.countsForOrg(scope.orgId)
    const org = findOrg(scope)
    const enabled = org ? org.enabledBrokerIds.length : 0
    const closures = computeDivergenceFlagCount(store, scope)
    const snapshot: KpiSnapshot = {
      orgId: scope.orgId,
      asOf: new Date().toISOString(),
      brokersTracked: enabled,
      reportsIngested: counts.reports,
      stocksCovered: counts.stocks,
      divergenceFlags: closures,
      windowDeltas: {
        brokersTracked:  { value: 0, windowDays: 30 },
        reportsIngested: { value: counts.reports, windowDays: 7 },
        stocksCovered:   { value: counts.stocks, windowDays: 30 },
        divergenceFlags: { value: closures, windowDays: 7 },
      },
    }
    reply.ok(res, snapshot)
  })

  // ── Portfolio / watchlist (Module 18) ─────────────────────────────
  r.get('/v1/portfolio-snapshot', ({ res, scope }) => {
    const snap: PortfolioSnapshot | undefined = portfolioSnapshots.find((p) => p.orgId === scope.orgId)
    if (!snap) return reply.notFound(res, `no portfolio configured for org ${scope.orgId}`)
    reply.ok(res, snap)
  })

  // ── Alerts / digests (Module 19) ──────────────────────────────────
  r.get('/v1/alerts', ({ res, scope, query }) => {
    const sinceMs = numParam(query, 'sinceMs')
    const includeSuppressed = boolParam(query, 'includeSuppressed') === true
    const limit = numParam(query, 'limit') ?? 100
    const items: readonly AlertEvent[] = store.listAlerts(scope.orgId, {
      sinceMs, includeSuppressed, limit,
    })
    reply.ok(res, items)
  })
  r.get('/v1/alerts/:alertId', ({ res, scope, params }) => {
    const a = store.getAlert(scope.orgId, asAlertId(params.alertId!))
    if (!a) return reply.notFound(res, `alert ${params.alertId}`)
    reply.ok(res, a)
  })

  r.get('/v1/alert-digests', ({ res, scope, query }) => {
    const kindRaw = strParam(query, 'kind')
    const kind: DigestKind | undefined =
      kindRaw === 'morning_brief' || kindRaw === 'intraday_critical' || kindRaw === 'coverage_hygiene'
        ? kindRaw : undefined
    const limit = numParam(query, 'limit') ?? 30
    const digests: readonly AlertDigest[] = store.listDigests(scope.orgId, { kind, limit })
    reply.ok(res, digests)
  })
  r.get('/v1/alert-digests/latest', ({ res, scope, query }) => {
    const kindRaw = strParam(query, 'kind')
    const kind: DigestKind = (kindRaw === 'morning_brief' || kindRaw === 'intraday_critical' || kindRaw === 'coverage_hygiene')
      ? kindRaw : 'morning_brief'
    const d = store.latestDigest(scope.orgId, kind)
    if (!d) return reply.notFound(res, `no ${kind} digest`)
    reply.ok(res, d)
  })
  r.get('/v1/alert-digests/:digestId', ({ res, scope, params }) => {
    const d = store.getDigest(scope.orgId, asDigestId(params.digestId!))
    if (!d) return reply.notFound(res, `digest ${params.digestId}`)
    reply.ok(res, d)
  })

  // ── Calibration (Module 20) ───────────────────────────────────────
  r.get('/v1/calibration/snapshot', ({ res, scope }) => {
    const snap: CalibrationSnapshot | null = store.latestCalibrationSnapshot(scope.orgId)
    if (!snap) return reply.notFound(res, 'no calibration snapshot')
    reply.ok(res, snap)
  })
  r.get('/v1/calibration/brokers', ({ res, scope }) => {
    const snap = store.latestCalibrationSnapshot(scope.orgId)
    const items: readonly BrokerCalibrationSummary[] = snap?.brokerCalibrations ?? []
    reply.ok(res, items)
  })
  r.get('/v1/calibration/brokers/:brokerId', ({ res, scope, params }) => {
    const snap = store.latestCalibrationSnapshot(scope.orgId)
    const id = asBrokerId(params.brokerId!)
    const item = snap?.brokerCalibrations.find((b) => b.brokerId === id)
    if (!item) return reply.notFound(res, `broker calibration ${params.brokerId}`)
    reply.ok(res, item)
  })
  r.get('/v1/calibration/alerts', ({ res, scope }) => {
    const snap = store.latestCalibrationSnapshot(scope.orgId)
    const items: readonly AlertEffectivenessSummary[] = snap?.alertEffectiveness ?? []
    reply.ok(res, items)
  })
  r.get('/v1/calibration/alerts/:kind', ({ res, scope, params }) => {
    const snap = store.latestCalibrationSnapshot(scope.orgId)
    const kind = params.kind as AlertTriggerKind
    const item = snap?.alertEffectiveness.find((a) => a.kind === kind)
    if (!item) return reply.notFound(res, `alert calibration ${params.kind}`)
    reply.ok(res, item)
  })
  r.get('/v1/calibration/coverage/:ticker', ({ res, scope, params }) => {
    const snap = store.latestCalibrationSnapshot(scope.orgId)
    const t = asTicker(params.ticker!)
    const item: CoverageSignalResult | undefined = snap?.coverageByTicker.find((c) => c.ticker === t)
    if (!item) return reply.notFound(res, `coverage ${params.ticker}`)
    reply.ok(res, item)
  })

  // ── Catalysts (Module 21) ─────────────────────────────────────────
  r.get('/v1/catalysts', ({ res, scope }) => {
    const items: readonly CatalystEvent[] = store.listCatalysts(scope.orgId)
    reply.ok(res, items)
  })
  r.get('/v1/catalysts/:catalystId', ({ res, scope, params }) => {
    const c = store.getCatalyst(scope.orgId, asCatalystId(params.catalystId!))
    if (!c) return reply.notFound(res, `catalyst ${params.catalystId}`)
    reply.ok(res, c)
  })
  r.get('/v1/catalysts/:catalystId/brief', ({ res, scope, params }) => {
    const b: PreEventBrief | null = store.latestPreEventBriefForCatalyst(scope.orgId, asCatalystId(params.catalystId!))
    if (!b) return reply.notFound(res, `pre-event brief for ${params.catalystId}`)
    reply.ok(res, b)
  })
  r.get('/v1/catalysts/:catalystId/snapshots', ({ res, scope, params }) => {
    const items = store.listExpectationSnapshots(scope.orgId, asCatalystId(params.catalystId!))
    reply.ok(res, items)
  })
  r.get('/v1/catalyst-briefs/:briefId', ({ res, scope, params }) => {
    const b = store.getPreEventBrief(scope.orgId, asPreEventBriefId(params.briefId!))
    if (!b) return reply.notFound(res, `brief ${params.briefId}`)
    reply.ok(res, b)
  })
  r.get('/v1/post-event-reviews', ({ res, scope }) => {
    const items: readonly PostEventReview[] = store.listPostEventReviews(scope.orgId)
    reply.ok(res, items)
  })
  r.get('/v1/post-event-reviews/:reviewId', ({ res, scope, params }) => {
    const rev = store.getPostEventReview(scope.orgId, asPostEventReviewId(params.reviewId!))
    if (!rev) return reply.notFound(res, `post-event review ${params.reviewId}`)
    reply.ok(res, rev)
  })
  r.get('/v1/catalysts/:catalystId/post-event-review', ({ res, scope, params }) => {
    const rev = store.latestPostEventReviewForCatalyst(scope.orgId, asCatalystId(params.catalystId!))
    if (!rev) return reply.notFound(res, `post-event review for ${params.catalystId}`)
    reply.ok(res, rev)
  })

  // ── Sources health (Module 24) ─────────────────────────────────────
  r.get('/v1/sources/health', ({ res, scope }) => {
    if (!opts.sourceManager) {
      return reply.notFound(res, 'sources health: source manager not configured')
    }
    reply.ok(res, opts.sourceManager.snapshot(scope.orgId))
  })

  // ── Usage / pilot analytics (Module 26) ────────────────────────────
  r.post('/v1/usage/events', async ({ req, res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'usage events: repo not configured')
    let body: unknown
    try { body = await readJsonBody(req) } catch { return reply.internal(res, 'invalid json body') }
    const events = ((body as { events?: unknown }).events ?? body) as readonly UsageEvent[]
    if (!Array.isArray(events)) return reply.internal(res, 'expected events: UsageEvent[]')
    let accepted = 0
    for (const e of events) {
      // Cross-tenant guard: only accept events that match the scope.
      if (!e || (e as UsageEvent).orgId !== scope.orgId) continue
      opts.repo.appendUsageEvent(e as UsageEvent)
      accepted++
    }
    opts.repo.flush()
    reply.ok(res, { accepted })
  })
  r.get('/v1/usage/snapshot', ({ res, scope, url }) => {
    if (!opts.repo) return reply.notFound(res, 'usage snapshot: repo not configured')
    const days = Number(url.searchParams.get('windowDays') ?? '7') || 7
    const snap = buildOrgUsageSnapshot({ orgId: scope.orgId, repo: opts.repo, windowDays: days })
    reply.ok(res, snap)
  })
  r.get('/v1/usage/roi', ({ res, scope, url }) => {
    if (!opts.repo) return reply.notFound(res, 'usage roi: repo not configured')
    const days = Number(url.searchParams.get('windowDays') ?? '30') || 30
    const roi = buildPilotRoiSnapshot({ orgId: scope.orgId, repo: opts.repo, windowDays: days })
    reply.ok(res, roi)
  })

  // ── Org control plane (Module 27) ──────────────────────────────────
  // For now we treat the active session as `admin` — until real auth is
  // wired (out of scope), the actor role is the most permissive.
  const ACTOR_ROLE: UserRole = 'admin'

  r.get('/v1/org-control/settings', ({ res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    const sourcesHealth = opts.sourceManager?.snapshot(scope.orgId) ?? null
    const settings = resolveOrgSettings({
      orgId: scope.orgId,
      currentUserId: scope.actingUserId as unknown as string ?? null,
      currentUserRole: ACTOR_ROLE,
      repo: opts.repo,
    }, sourcesHealth)
    reply.ok(res, settings)
  })

  r.get('/v1/org-control/audit', ({ res, scope, url }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    const area = (url.searchParams.get('area') ?? undefined) as ConfigAuditArea | undefined
    const lim = Number(url.searchParams.get('limit') ?? '50') || 50
    const items = opts.repo.listConfigAuditEntries(scope.orgId, { area, limit: lim })
    reply.ok(res, { items })
  })

  r.post('/v1/org-control/flag', async ({ req, res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    let body: unknown
    try { body = await readJsonBody(req) } catch { return reply.internal(res, 'invalid json body') }
    const b = body as { key?: FeatureFlagKey; enabled?: boolean; reason?: string | null }
    if (!b.key || typeof b.enabled !== 'boolean') return reply.internal(res, 'expected { key, enabled, reason? }')
    try {
      const next = setFeatureFlag({
        orgId: scope.orgId, key: b.key, enabled: b.enabled,
        actorUserId: scope.actingUserId, actorRole: ACTOR_ROLE,
        reason: b.reason ?? null, repo: opts.repo,
      })
      reply.ok(res, next)
    } catch (e) {
      if (e instanceof OrgControlServiceError) return reply.forbidden(res, e.message)
      throw e
    }
  })

  r.post('/v1/org-control/module', async ({ req, res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    const body = await readJsonBody(req) as { module?: AccessibleModule; enabled?: boolean; reason?: string | null }
    if (!body.module || typeof body.enabled !== 'boolean') return reply.internal(res, 'expected { module, enabled, reason? }')
    try {
      const next = setModuleAccess({
        orgId: scope.orgId, module: body.module, enabled: body.enabled,
        actorUserId: scope.actingUserId, actorRole: ACTOR_ROLE,
        reason: body.reason ?? null, repo: opts.repo,
      })
      reply.ok(res, next)
    } catch (e) {
      if (e instanceof OrgControlServiceError) return reply.forbidden(res, e.message)
      throw e
    }
  })

  r.post('/v1/org-control/source-mode', async ({ req, res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    const body = await readJsonBody(req) as { sourceKind?: SourceKind; mode?: SourceProviderMode; reason?: string | null }
    if (!body.sourceKind || !body.mode) return reply.internal(res, 'expected { sourceKind, mode, reason? }')
    try {
      const next = setSourceMode({
        orgId: scope.orgId, sourceKind: body.sourceKind, mode: body.mode,
        actorUserId: scope.actingUserId, actorRole: ACTOR_ROLE,
        reason: body.reason ?? null, repo: opts.repo,
      })
      reply.ok(res, next)
    } catch (e) {
      if (e instanceof OrgControlServiceError) return reply.forbidden(res, e.message)
      throw e
    }
  })

  r.post('/v1/org-control/rollout-state', async ({ req, res, scope }) => {
    if (!opts.repo) return reply.notFound(res, 'org-control: repo not configured')
    const body = await readJsonBody(req) as { state?: RolloutState | null; note?: string | null; reason?: string | null }
    try {
      setRolloutState({
        orgId: scope.orgId, state: body.state ?? null, note: body.note ?? undefined,
        actorUserId: scope.actingUserId, actorRole: ACTOR_ROLE,
        reason: body.reason ?? null, repo: opts.repo,
      })
      reply.ok(res, { ok: true })
    } catch (e) {
      if (e instanceof OrgControlServiceError) return reply.forbidden(res, e.message)
      throw e
    }
  })

  // ── Delivery / inbox (Module 25) ───────────────────────────────────
  r.get('/v1/deliveries', ({ res, scope, url }) => {
    if (!opts.repo) return reply.notFound(res, 'deliveries: repo not configured')
    const ck = url.searchParams.get('contentKind') ?? undefined
    const ch = url.searchParams.get('channel') ?? undefined
    const lim = url.searchParams.get('limit')
    const items = opts.repo.listDeliveryAttempts(scope.orgId, {
      contentKind: ck as DeliveryContentKind | undefined,
      channel: ch as DeliveryChannel | undefined,
      limit: lim ? Number(lim) : 50,
    })
    reply.ok(res, { items })
  })
  r.get('/v1/deliveries/:attemptId', ({ res, scope, params }) => {
    if (!opts.repo) return reply.notFound(res, 'delivery: repo not configured')
    const id = asDeliveryAttemptId(params.attemptId!) as DeliveryAttemptId
    const a = opts.repo.getDeliveryAttempt(scope.orgId, id)
    if (!a) return reply.notFound(res, `delivery ${params.attemptId}`)
    reply.ok(res, a)
  })

  r.get('/v1/ingestion-status', ({ res, scope }) => {
    const emails = store.listEmails(scope.orgId)
    const status: IngestionStatus = {
      orgId: scope.orgId,
      asOf: new Date().toISOString(),
      queued:        emails.filter((e) => e.status === 'queued').length,
      processing:    emails.filter((e) => PROCESSING.has(e.status)).length,
      readyLast24h:  emails.filter((e) => e.status === 'ready').length,
      failedLast24h: emails.filter((e) => e.status === 'failed').length,
      throughputPerHour: 0,
    }
    reply.ok(res, status)
  })

  return r
}

// ── Derived-analytics helpers ────────────────────────────────────────

function closureForTicker(store: InMemoryStore, scope: OrgScope, ticker: StockTicker): ConflictClosure | null {
  const opinions = store.listOpinions(scope.orgId).filter((o) => o.ticker === ticker)
  if (opinions.length === 0) return null
  const reportIds = new Set(opinions.map((o) => o.lastReportId as unknown as string))
  const summaries = store.listSummaries(scope.orgId).filter((s) => reportIds.has(s.reportId as unknown as string))
  const evidence = store.listEvidence(scope.orgId).filter((e) => reportIds.has(e.reportId as unknown as string))

  const org = organizations.find((o) => o.id === scope.orgId)
  const enabled = new Set<string>((org?.enabledBrokerIds ?? []) as unknown as string[])
  const scopeBrokers = brokers.filter((b) => enabled.has(b.id as unknown as string))

  return buildConflictClosure({
    ticker,
    opinions,
    summaries,
    brokers: scopeBrokers,
    evidence,
  })
}

function sectorIntelligenceFor(store: InMemoryStore, scope: OrgScope, sector: Sector): SectorIntelligence | null {
  const tickerSet = new Set<string>(sector.tickers as unknown as string[])
  const reports = store.listReports(scope.orgId).filter(
    (r) => r.sectorIds.some((sid) => sid === sector.id)
      || r.tickers.some((t) => tickerSet.has(t as unknown as string)),
  )
  const reportIds = new Set(reports.map((r) => r.id as unknown as string))
  const summaries = store.listSummaries(scope.orgId).filter((s) => reportIds.has(s.reportId as unknown as string))

  const closures: ConflictClosure[] = []
  for (const t of sector.tickers) {
    const c = closureForTicker(store, scope, t)
    if (c) closures.push(c)
  }

  const dates = reports.map((r) => r.publishedAt).sort()
  const periodStart = dates[0] ?? new Date().toISOString()
  const periodEnd = dates[dates.length - 1] ?? new Date().toISOString()

  return buildSectorIntelligence({
    sector,
    reports,
    summaries,
    closures,
    periodStart,
    periodEnd,
  })
}

function computeDivergenceFlagCount(store: InMemoryStore, scope: OrgScope): number {
  let count = 0
  for (const t of store.listCoveredTickers(scope.orgId)) {
    const c = closureForTicker(store, scope, t)
    if (!c) continue
    const material = (c.targetStats.spreadPct ?? 0) >= 25
      || c.disagreements.length > 0
      || c.outliers.length > 0
    if (material) count += 1
  }
  return count
}

// ── Small scope lookup + query helpers ────────────────────────────────

const PROCESSING: ReadonlySet<EmailProcessingStatus> = new Set(['parsing', 'normalizing', 'summarizing'])

function findOrg(scope: OrgScope): Organization | null {
  return organizations.find((o) => o.id === scope.orgId) ?? null
}

function arrParam(q: URLSearchParams, key: string): string[] | undefined {
  if (!q.has(key)) return undefined
  const v = q.get(key)
  return v ? v.split(',').filter(Boolean) : undefined
}
function strParam(q: URLSearchParams, key: string): string | undefined {
  const v = q.get(key)
  return v === null || v === '' ? undefined : v
}
function numParam(q: URLSearchParams, key: string): number | undefined {
  const v = q.get(key)
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function boolParam(q: URLSearchParams, key: string): boolean | undefined {
  const v = q.get(key)
  if (v === null) return undefined
  return v === 'true' || v === '1'
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  return JSON.parse(raw)
}

// Keep these type-only imports happy in the bundle so the ambient
// References don't trigger unused-import warnings in future edits.
export type { Broker, Sector, Stock, User, Organization, ReportId, SectorId, StockTicker, EmailId, Rating }
