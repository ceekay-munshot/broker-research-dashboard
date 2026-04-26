import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrgScope } from '../../../src/domain'
import { asOrgId, asUserId } from '../../../src/lib/ids'
import { reply, writeOptionsResponse } from './responses'

// Minimal zero-dependency router. Matches `:param` segments the same way
// the stub fetch does, so the ingested backend and the stub transport
// stay contract-equivalent.

export interface RouteContext {
  readonly req: IncomingMessage
  readonly res: ServerResponse
  /** Scope extracted from X-Org-Id / X-Acting-User-Id headers. */
  readonly scope: OrgScope
  readonly params: Readonly<Record<string, string>>
  readonly query: URLSearchParams
  readonly url: URL
}

export type Handler = (ctx: RouteContext) => Promise<void> | void

interface RouteEntry {
  readonly method: 'GET' | 'POST'
  readonly pattern: string
  readonly handler: Handler
}

export class Router {
  private readonly routes: RouteEntry[] = []

  get(pattern: string, handler: Handler): this {
    this.routes.push({ method: 'GET', pattern, handler })
    return this
  }
  post(pattern: string, handler: Handler): this {
    this.routes.push({ method: 'POST', pattern, handler })
    return this
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'OPTIONS'

    // CORS preflight — respond and return before route matching.
    if (method === 'OPTIONS') return writeOptionsResponse(res)

    // We use a fake base URL so the standard URL parser can do query-string
    // handling. The host portion never reaches any handler.
    const url = new URL(req.url ?? '/', 'http://localhost')

    for (const route of this.routes) {
      if (route.method !== method) continue
      if (method !== 'GET' && method !== 'POST') continue
      const params = matchPattern(route.pattern, url.pathname)
      if (!params) continue
      const scope = extractScope(req)
      try {
        await route.handler({ req, res, scope, params, query: url.searchParams, url })
      } catch (err) {
        if (!res.headersSent) {
          reply.internal(res, err instanceof Error ? err.message : String(err))
        }
      }
      return
    }

    // Fallthrough — no route matched.
    reply.notFound(res, `${method} ${url.pathname}`)
  }
}

// ── Matching + header extraction ─────────────────────────────────────

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean)
  const xp = pathname.split('/').filter(Boolean)
  if (pp.length !== xp.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!
    const x = xp[i]!
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(x)
    } else if (p !== x) {
      return null
    }
  }
  return params
}

function extractScope(req: IncomingMessage): OrgScope {
  const h = req.headers
  const orgId = stringHeader(h['x-org-id']) ?? ''
  const userId = stringHeader(h['x-acting-user-id']) ?? ''
  return { orgId: asOrgId(orgId), actingUserId: asUserId(userId) }
}

function stringHeader(v: string | readonly string[] | undefined): string | null {
  if (v === undefined) return null
  return Array.isArray(v) ? v[0]! : (v as string)
}
