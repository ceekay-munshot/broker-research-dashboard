// ─────────────────────────────────────────────────────────────────────────
// Auth middleware — runs before every route handler.
//
// Steps:
//   1. Verify session via the configured verifier.
//   2. Compare requested `X-Org-Id` (if present) with the verified
//      session.orgId — reject on mismatch.
//   3. Look up the route's required role; reject if the verified role
//      isn't allowed.
//   4. On reject: record a `DeniedAccessEvent` and write 401/403.
//   5. On accept: hand control to the route with a `verifiedSession`
//      attached.
// ─────────────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  VerifiedSession, SessionVerificationFailureReason, HttpMethod,
} from '../../../src/domain'
import { reply } from '../api/responses'
import type { Repo } from '../persistence'
import type { SessionVerifier } from './types'
import { findRoutePermission, roleAllows } from './permissions'
import { recordDenial } from './audit'

export interface AuthContext {
  readonly session: VerifiedSession
}

export interface AuthMiddlewareOptions {
  readonly verifier: SessionVerifier
  readonly repo: Repo | null
  readonly nodeEnv: string
}

/** Returns the verified session, or null if the response was already
 *  written (denied). The router stops processing in that case. */
export async function authenticate(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: HttpMethod,
  opts: AuthMiddlewareOptions,
): Promise<VerifiedSession | null> {
  const result = await opts.verifier.verify({ req, nodeEnv: opts.nodeEnv })

  if (!result.ok || !result.session) {
    return denyVerification(req, res, pathname, method, result.failureReason ?? 'missing_session', result.failureDetail, opts)
  }
  const session = result.session

  // Cross-tenant guard: when the request supplies X-Org-Id, it must
  // match the verified session's orgId.
  const orgHeader = stringHeader(req.headers['x-org-id'])
  if (orgHeader && orgHeader !== (session.orgId as unknown as string)) {
    if (opts.repo) {
      recordDenial({
        repo: opts.repo, route: pathname, method,
        reason: 'cross_tenant_request',
        detail: `requested org=${orgHeader} session org=${session.orgId as unknown as string}`,
        authMode: session.authSource,
        orgId: session.orgId,
        actingUserId: session.actingUserId,
        attemptedOrgId: orgHeader as unknown as VerifiedSession['orgId'],
        attemptedRole: session.role,
      })
      opts.repo.flush()
    }
    reply.forbidden(res, 'cross-tenant request rejected')
    return null
  }

  // Permission matrix.
  const perm = findRoutePermission(method, pathname)
  if (perm && !roleAllows(session.role, perm.requiredRole)) {
    if (opts.repo) {
      recordDenial({
        repo: opts.repo, route: pathname, method,
        reason: 'role_denied',
        detail: `route requires ${perm.requiredRole}; session role=${session.role}`,
        authMode: session.authSource,
        orgId: session.orgId,
        actingUserId: session.actingUserId,
        attemptedOrgId: session.orgId,
        attemptedRole: session.role,
      })
      opts.repo.flush()
    }
    reply.forbidden(res, `role "${session.role}" cannot access this route`)
    return null
  }

  return session
}

function denyVerification(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: HttpMethod,
  reason: SessionVerificationFailureReason,
  detail: string | null,
  opts: AuthMiddlewareOptions,
): null {
  const orgHeader = stringHeader(req.headers['x-org-id'])
  if (opts.repo) {
    recordDenial({
      repo: opts.repo, route: pathname, method,
      reason, detail,
      authMode: opts.verifier.mode,
      orgId: null,
      actingUserId: null,
      attemptedOrgId: orgHeader ? (orgHeader as unknown as VerifiedSession['orgId']) : null,
      attemptedRole: null,
    })
    opts.repo.flush()
  }
  if (reason === 'role_denied') {
    reply.forbidden(res, detail ?? 'role denied')
  } else {
    reply.unauthenticated(res, detail ?? `auth failed: ${reason}`)
  }
  return null
}

function stringHeader(v: string | readonly string[] | undefined): string | null {
  if (v === undefined) return null
  return Array.isArray(v) ? v[0]! : (v as string)
}
