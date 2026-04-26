// ─────────────────────────────────────────────────────────────────────────
// Header-signed verifier — production-safe.
//
// Reads:
//   X-Session-Id, X-Session-Org-Id, X-Session-User-Id, X-Session-Email,
//   X-Session-Display-Name, X-Session-Role, X-Session-Issued-At,
//   X-Session-Expires-At, X-Session-Key-Id, X-Session-Signature
//
// The signature is HMAC-SHA256 of the canonicalized header string keyed
// by `MUNSHOT_SESSION_SECRET` (env). The verifier rejects expired
// sessions and any signature mismatch.
//
// This is the format Munshot upstream is expected to emit; the server
// trusts only this signed payload for orgId/userId/role.
// ─────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  AuthMode, SessionVerificationResult, VerifiedSession, UserRole,
} from '../../../src/domain'
import { asOrgId, asUserId, asSessionId } from '../../../src/lib/ids'
import type { SessionVerifier, VerifyArgs } from './types'

export interface HeaderSignedVerifierOptions {
  /** HMAC secret. Loaded from env at boot. */
  readonly secret: string
}

const SIGNED_FIELDS: readonly string[] = [
  'x-session-id',
  'x-session-org-id',
  'x-session-user-id',
  'x-session-email',
  'x-session-display-name',
  'x-session-role',
  'x-session-issued-at',
  'x-session-expires-at',
  'x-session-key-id',
]

const ALLOWED_ROLES: readonly UserRole[] = ['viewer', 'analyst', 'pm', 'operator', 'admin']

export class HeaderSignedVerifier implements SessionVerifier {
  readonly mode: AuthMode = 'header_signed'
  readonly description = 'header-signed Munshot session (HMAC-SHA256)'
  readonly productionSafe = true

  constructor(private readonly opts: HeaderSignedVerifierOptions) {}

  async verify(args: VerifyArgs): Promise<SessionVerificationResult> {
    if (!this.opts.secret) {
      return fail('missing_session', 'MUNSHOT_SESSION_SECRET not set')
    }
    const h = (k: string) => stringHeader(args.req.headers[k.toLowerCase()])
    const sig = h('x-session-signature')
    if (!sig) return fail('missing_session', 'X-Session-Signature missing')

    // Build canonical signing string: each field "name=value" joined by `;`.
    const fieldValues: Record<string, string> = {}
    for (const k of SIGNED_FIELDS) {
      const v = h(k)
      if (v === null) return fail('malformed_session', `${k} header missing`)
      fieldValues[k] = v
    }
    const canonical = SIGNED_FIELDS.map((k) => `${k}=${fieldValues[k]}`).join(';')
    const expected = createHmac('sha256', this.opts.secret).update(canonical).digest('hex')
    let match = false
    try {
      match = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    } catch {
      match = false
    }
    if (!match) return fail('invalid_signature', 'HMAC mismatch')

    const role = fieldValues['x-session-role']! as UserRole
    if (!ALLOWED_ROLES.includes(role)) return fail('malformed_session', `unknown role ${role}`)

    const expiresAt = fieldValues['x-session-expires-at']!
    if (Date.parse(expiresAt) < Date.now()) {
      return fail('expired_session', `expired at ${expiresAt}`)
    }

    const session: VerifiedSession = {
      sessionId: asSessionId(fieldValues['x-session-id']!),
      orgId: asOrgId(fieldValues['x-session-org-id']!),
      actingUserId: asUserId(fieldValues['x-session-user-id']!),
      email: fieldValues['x-session-email']!,
      displayName: fieldValues['x-session-display-name']!,
      role,
      issuedAt: fieldValues['x-session-issued-at']!,
      expiresAt,
      authSource: 'header_signed',
      verification: {
        verifiedAt: new Date().toISOString(),
        keyId: fieldValues['x-session-key-id']!,
        productionSafe: true,
      },
    }
    return { ok: true, session, failureReason: null, failureDetail: null }
  }
}

function stringHeader(v: string | readonly string[] | undefined): string | null {
  if (v === undefined) return null
  return Array.isArray(v) ? v[0]! : (v as string)
}

function fail(reason: SessionVerificationResult['failureReason'], detail: string): SessionVerificationResult {
  return { ok: false, session: null, failureReason: reason, failureDetail: detail }
}
