import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrgScope, VerifiedSession } from '../../../src/domain'
import { reply, writeOptionsResponse } from './responses'
import type { AuthMiddlewareOptions } from '../auth/middleware'
import { authenticate } from '../auth/middleware'

// Minimal zero-dependency router. Matches `:param` segments the same way
// the stub fetch does, so the ingested backend and the stub transport
// stay contract-equivalent.
//
// As of Module 28 the router runs the auth middleware before every
// handler — handlers receive a verified `session` (and an `OrgScope`
// derived from it) instead of trusting raw headers.

export interface RouteContext {
  readonly req: IncomingMessage
  readonly res: ServerResponse
  /** Scope derived from the verified session — single source of truth. */
  readonly scope: OrgScope
  /** Full verified session — role-aware handlers consult this. */
  readonly session: VerifiedSession
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
  private auth: AuthMiddlewareOptions | null = null

  get(pattern: string, handler: Handler): this {
    this.routes.push({ method: 'GET', pattern, handler })
    return this
  }
  post(pattern: string, handler: Handler): this {
    this.routes.push({ method: 'POST', pattern, handler })
    return this
  }

  /** Configure auth — must be called once before `dispatch`. */
  withAuth(opts: AuthMiddlewareOptions): this {
    this.auth = opts
    return this
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'OPTIONS'

    // CORS preflight — respond and return before route matching.
    if (method === 'OPTIONS') return writeOptionsResponse(res)

    const url = new URL(req.url ?? '/', 'http://localhost')

    for (const route of this.routes) {
      if (route.method !== method) continue
      if (method !== 'GET' && method !== 'POST') continue
      const params = matchPattern(route.pattern, url.pathname)
      if (!params) continue

      // Authenticate. If the middleware writes a 401/403, stop here.
      if (!this.auth) {
        reply.internal(res, 'router not configured with auth middleware')
        return
      }
      const session = await authenticate(req, res, url.pathname, method, this.auth)
      if (!session) return  // middleware already wrote the response

      const scope: OrgScope = {
        orgId: session.orgId,
        actingUserId: session.actingUserId,
      }
      try {
        await route.handler({ req, res, scope, session, params, query: url.searchParams, url })
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

// ── Matching ────────────────────────────────────────────────────────

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
