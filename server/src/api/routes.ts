import type {
  BrokerEmail, ResearchReport, OrgScope, StockTicker, SectorId, ReportId, EmailId, Stance, Rating, Stock, Sector, Broker, Organization, User,
  EmailProcessingStatus, KpiSnapshot, IngestionStatus, Page,
} from '../../../src/domain'
import type { ConflictClosure, SectorIntelligence, ResultantState } from '../../../src/engine/types'
import { buildConflictClosure, buildSectorIntelligence } from '../../../src/engine'
import { asEmailId, asReportId, asSectorId, asTicker } from '../../../src/lib/ids'
import { Router } from './router'
import { reply } from './responses'
import type { InMemoryStore } from '../store/InMemoryStore'
import {
  organizations, users, brokers, sectors, stocks,
  DEFAULT_ORG_ID, DEFAULT_USER_ID,
} from '../config/organizations'

// Every route from docs/api-contract.md. Shapes the JSON exactly as the
// frontend's HttpResearchAdapter parsers expect.

const FIXED_SESSION_SCOPE: OrgScope = {
  orgId: DEFAULT_ORG_ID,
  actingUserId: DEFAULT_USER_ID,
}

export function buildRouter(store: InMemoryStore): Router {
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

// Keep these type-only imports happy in the bundle so the ambient
// References don't trigger unused-import warnings in future edits.
export type { Broker, Sector, Stock, User, Organization, ReportId, SectorId, StockTicker, EmailId, Rating }
