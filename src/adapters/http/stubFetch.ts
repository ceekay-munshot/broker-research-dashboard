import type {
  BrokerId, SectorId, StockTicker,
  OrgScope, Stance,
} from '../../domain'
import type { ResultantState } from '../../engine/types'
import type {
  ListEmailsQuery, ListReportsQuery, ListOpinionsQuery, ListClosuresQuery,
} from '../queries'
import { asOrgId, asUserId, asBrokerId, asEmailId, asReportId, asSectorId, asTicker } from '../../lib/ids'
import type { FetchImpl } from './HttpClient'
import { MockResearchAdapter } from '../MockResearchAdapter'
import {
  AdapterError, NotFoundError, OrgScopeViolationError,
} from '../errors'

// In-memory fetch implementation that serves the HTTP contract off the
// MockResearchAdapter fixtures. Wired in when VITE_RESEARCH_ADAPTER=http-stub
// so the full HttpResearchAdapter / parser / error-mapping code path runs
// end-to-end without a real backend.
//
// Limited to the endpoints the adapter actually calls; adding a new
// endpoint requires both an entry here and a row in src/adapters/http/
// endpoints.ts.

const ROUTES: readonly RouteDef[] = []

export function createStubFetch(mock: MockResearchAdapter): FetchImpl {
  if (ROUTES.length === 0) installRoutes()
  return async function stubFetch(input, init) {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      'http://stub.local',
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const scope = extractScope(init?.headers)

    for (const route of ROUTES) {
      const match = matchRoute(route, method, url.pathname)
      if (!match) continue
      try {
        const body = await route.handler({ mock, scope, params: match, query: url.searchParams })
        return json(200, body)
      } catch (e) {
        return errorResponse(e)
      }
    }
    return json(404, { error: { code: 'NOT_FOUND', message: `${method} ${url.pathname}` } })
  }
}

// ── Route registry ────────────────────────────────────────────────────

interface RouteContext {
  readonly mock: MockResearchAdapter
  readonly scope: OrgScope
  readonly params: Readonly<Record<string, string>>
  readonly query: URLSearchParams
}

interface RouteDef {
  readonly method: 'GET'
  readonly pattern: string  // e.g. '/v1/research-reports/:reportId'
  readonly handler: (ctx: RouteContext) => Promise<unknown>
}

function installRoutes(): void {
  const push = (pattern: string, handler: RouteDef['handler']) =>
    (ROUTES as RouteDef[]).push({ method: 'GET', pattern, handler })

  push('/v1/session/scope', async ({ mock }) => await mock.getSessionScope())

  push('/v1/organization', async ({ mock, scope }) => await mock.getOrganization(scope))
  push('/v1/me',           async ({ mock, scope }) => await mock.getCurrentUser(scope))

  push('/v1/brokers',             async ({ mock, scope }) => await mock.listBrokers(scope))
  push('/v1/brokers/:brokerId',   async ({ mock, scope, params }) =>
    requireFound(await mock.getBroker(scope, asBrokerId(params.brokerId!)), `broker ${params.brokerId}`))

  push('/v1/sectors',             async ({ mock, scope }) => await mock.listSectors(scope))
  push('/v1/sectors/:sectorId',   async ({ mock, scope, params }) =>
    requireFound(await mock.getSector(scope, asSectorId(params.sectorId!)), `sector ${params.sectorId}`))

  push('/v1/stocks',              async ({ mock, scope }) => await mock.listStocks(scope))
  push('/v1/stocks/:ticker',      async ({ mock, scope, params }) =>
    requireFound(await mock.getStock(scope, asTicker(params.ticker!)), `stock ${params.ticker}`))

  push('/v1/broker-emails', async ({ mock, scope, query }) => {
    const q: ListEmailsQuery = {
      since: strParam(query, 'since'),
      until: strParam(query, 'until'),
      brokerIds: arrParam(query, 'brokerIds')?.map(asBrokerId) as unknown as readonly BrokerId[] | undefined,
      statuses: arrParam(query, 'statuses') as unknown as ListEmailsQuery['statuses'],
      limit: numParam(query, 'limit'),
      cursor: strParam(query, 'cursor'),
    }
    return await mock.listBrokerEmails(scope, q)
  })
  push('/v1/broker-emails/:emailId', async ({ mock, scope, params }) =>
    requireFound(await mock.getBrokerEmail(scope, asEmailId(params.emailId!)), `email ${params.emailId}`))
  push('/v1/broker-emails/:emailId/attachments', async ({ mock, scope, params }) =>
    await mock.listAttachments(scope, asEmailId(params.emailId!)))

  push('/v1/research-reports', async ({ mock, scope, query }) => {
    const q: ListReportsQuery = {
      since: strParam(query, 'since'),
      until: strParam(query, 'until'),
      brokerIds: arrParam(query, 'brokerIds')?.map(asBrokerId) as unknown as readonly BrokerId[] | undefined,
      tickers: arrParam(query, 'tickers')?.map(asTicker) as unknown as readonly StockTicker[] | undefined,
      sectorIds: arrParam(query, 'sectorIds')?.map(asSectorId) as unknown as readonly SectorId[] | undefined,
      reportTypes: arrParam(query, 'reportTypes') as unknown as ListReportsQuery['reportTypes'],
      stances: arrParam(query, 'stances') as unknown as readonly Stance[] | undefined,
      limit: numParam(query, 'limit'),
      cursor: strParam(query, 'cursor'),
    }
    return await mock.listResearchReports(scope, q)
  })
  push('/v1/research-reports/:reportId', async ({ mock, scope, params }) =>
    requireFound(await mock.getResearchReport(scope, asReportId(params.reportId!)), `report ${params.reportId}`))
  push('/v1/research-reports/:reportId/summary', async ({ mock, scope, params }) =>
    requireFound(await mock.getReportSummary(scope, asReportId(params.reportId!)), `summary for ${params.reportId}`))
  push('/v1/research-reports/:reportId/evidence', async ({ mock, scope, params }) =>
    await mock.listEvidenceSnippets(scope, asReportId(params.reportId!)))

  push('/v1/opinions', async ({ mock, scope, query }) => {
    const q: ListOpinionsQuery = {
      brokerIds: arrParam(query, 'brokerIds')?.map(asBrokerId) as unknown as readonly BrokerId[] | undefined,
      tickers: arrParam(query, 'tickers')?.map(asTicker) as unknown as readonly StockTicker[] | undefined,
    }
    return await mock.listBrokerStockOpinions(scope, q)
  })

  push('/v1/conflict-closures', async ({ mock, scope, query }) => {
    const q: ListClosuresQuery = {
      tickers: arrParam(query, 'tickers')?.map(asTicker) as unknown as readonly StockTicker[] | undefined,
      sectorIds: arrParam(query, 'sectorIds')?.map(asSectorId) as unknown as readonly SectorId[] | undefined,
      states: arrParam(query, 'states') as unknown as readonly ResultantState[] | undefined,
      minSpreadPct: numParam(query, 'minSpreadPct'),
      mustHaveDisagreements: boolParam(query, 'mustHaveDisagreements'),
      mustHaveOutliers: boolParam(query, 'mustHaveOutliers'),
    }
    return await mock.listConflictClosures(scope, q)
  })
  push('/v1/conflict-closures/:ticker', async ({ mock, scope, params }) =>
    requireFound(await mock.getConflictClosure(scope, asTicker(params.ticker!)), `closure ${params.ticker}`))

  push('/v1/sector-intelligence', async ({ mock, scope }) => await mock.listSectorIntelligence(scope))
  push('/v1/sector-intelligence/:sectorId', async ({ mock, scope, params }) =>
    requireFound(await mock.getSectorIntelligence(scope, asSectorId(params.sectorId!)), `sector intel ${params.sectorId}`))

  push('/v1/kpi-snapshot',     async ({ mock, scope }) => await mock.getKpiSnapshot(scope))
  push('/v1/ingestion-status', async ({ mock, scope }) => await mock.getIngestionStatus(scope))
}

// ── Helpers ───────────────────────────────────────────────────────────

function matchRoute(route: RouteDef, method: string, pathname: string): Record<string, string> | null {
  if (method !== route.method) return null
  const patternParts = route.pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!
    const vp = pathParts[i]!
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(vp)
    } else if (pp !== vp) {
      return null
    }
  }
  return params
}

function extractScope(headers: HeadersInit | undefined): OrgScope {
  const h = new Headers(headers ?? {})
  const orgId = h.get('X-Org-Id') ?? ''
  const userId = h.get('X-Acting-User-Id') ?? ''
  return { orgId: asOrgId(orgId), actingUserId: asUserId(userId) }
}

function strParam(query: URLSearchParams, key: string): string | undefined {
  const v = query.get(key)
  return v === null || v === '' ? undefined : v
}
function numParam(query: URLSearchParams, key: string): number | undefined {
  const v = query.get(key)
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function boolParam(query: URLSearchParams, key: string): boolean | undefined {
  const v = query.get(key)
  if (v === null) return undefined
  return v === 'true' || v === '1'
}
// Returns undefined when the key is absent so downstream adapter query
// objects distinguish "no filter" (undefined) from "filter to nothing" ([]).
function arrParam(query: URLSearchParams, key: string): string[] | undefined {
  if (!query.has(key)) return undefined
  const v = query.get(key)
  return v ? v.split(',').filter(Boolean) : undefined
}

function requireFound<T>(v: T | null, label: string): T {
  if (v === null) throw new NotFoundError(label)
  return v
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errorResponse(e: unknown): Response {
  if (e instanceof NotFoundError) return json(404, { error: { code: e.code, message: e.message } })
  if (e instanceof OrgScopeViolationError) return json(403, { error: { code: e.code, message: e.message } })
  if (e instanceof AdapterError) return json(500, { error: { code: e.code, message: e.message } })
  const msg = e instanceof Error ? e.message : String(e)
  return json(500, { error: { code: 'INTERNAL', message: msg } })
}
