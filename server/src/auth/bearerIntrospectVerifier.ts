// ─────────────────────────────────────────────────────────────────────────
// Bearer introspect verifier — production-safe stub.
//
// Reads `Authorization: Bearer <token>` and POSTs the token to a
// configured introspection endpoint (`MUNSHOT_INTROSPECT_URL`). The
// upstream is expected to return the same fields a header-signed
// verifier would have produced, plus an `active: true` flag.
// ─────────────────────────────────────────────────────────────────────────

import type {
  AuthMode, SessionVerificationResult, VerifiedSession, UserRole,
} from '../../../src/domain'
import { asOrgId, asUserId, asSessionId } from '../../../src/lib/ids'
import type { SessionVerifier, VerifyArgs } from './types'

interface IntrospectionResponse {
  readonly active: boolean
  readonly sessionId: string
  readonly orgId: string
  readonly userId: string
  readonly email: string
  readonly displayName: string
  readonly role: UserRole
  readonly issuedAt: string
  readonly expiresAt: string
  readonly keyId: string | null
}

export interface BearerIntrospectVerifierOptions {
  readonly introspectUrl: string
  readonly clientId: string | null
  readonly clientSecret: string | null
  readonly fetchImpl?: typeof fetch
}

export class BearerIntrospectVerifier implements SessionVerifier {
  readonly mode: AuthMode = 'bearer_introspect'
  readonly description = 'bearer token introspection (RFC 7662-shape)'
  readonly productionSafe = true

  constructor(private readonly opts: BearerIntrospectVerifierOptions) {}

  async verify(args: VerifyArgs): Promise<SessionVerificationResult> {
    const auth = args.req.headers['authorization']
    const token = typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim() : null
    if (!token) return fail('missing_session', 'Authorization Bearer token missing')

    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return fail('introspect_failed', 'no fetch impl available')

    const headers: Record<string, string> = { 'content-type': 'application/json', 'accept': 'application/json' }
    if (this.opts.clientId && this.opts.clientSecret) {
      const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64')
      headers['authorization'] = `Basic ${basic}`
    }
    let body: IntrospectionResponse
    try {
      const res = await fetchFn(this.opts.introspectUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const reason = res.status === 401 || res.status === 403 ? 'invalid_signature' : 'introspect_failed'
        return fail(reason, `introspect HTTP ${res.status}`)
      }
      body = await res.json() as IntrospectionResponse
    } catch (e) {
      return fail('introspect_failed', e instanceof Error ? e.message : String(e))
    }
    if (!body.active) return fail('expired_session', 'introspection returned active=false')

    const session: VerifiedSession = {
      sessionId: asSessionId(body.sessionId),
      orgId: asOrgId(body.orgId),
      actingUserId: asUserId(body.userId),
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      issuedAt: body.issuedAt,
      expiresAt: body.expiresAt,
      authSource: 'bearer_introspect',
      verification: {
        verifiedAt: new Date().toISOString(),
        keyId: body.keyId ?? null,
        productionSafe: true,
      },
    }
    return { ok: true, session, failureReason: null, failureDetail: null }
  }
}

function fail(reason: SessionVerificationResult['failureReason'], detail: string): SessionVerificationResult {
  return { ok: false, session: null, failureReason: reason, failureDetail: detail }
}
