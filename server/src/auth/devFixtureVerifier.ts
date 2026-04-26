// ─────────────────────────────────────────────────────────────────────────
// Dev-fixture verifier — for local development ONLY.
//
// Returns a deterministic admin session for the configured org. Throws
// in production. Picks the org from `X-Org-Id` (if a known dev org) or
// from `DEV_AUTH_DEFAULT_ORG_ID`.
// ─────────────────────────────────────────────────────────────────────────

import type { IncomingMessage } from 'node:http'
import type {
  VerifiedSession, SessionVerificationResult, AuthMode,
} from '../../../src/domain'
import { asOrgId, asUserId, asSessionId } from '../../../src/lib/ids'
import type { SessionVerifier } from './types'

export interface DevFixtureVerifierOptions {
  readonly defaultOrgId: string
  readonly defaultUserId: string
  readonly defaultEmail: string
  readonly defaultRole: VerifiedSession['role']
}

export class DevFixtureVerifier implements SessionVerifier {
  readonly mode: AuthMode = 'dev_fixture'
  readonly description = 'dev fixture (deterministic admin session for local development)'
  readonly productionSafe = false

  constructor(private readonly opts: DevFixtureVerifierOptions) {}

  async verify(args: { req: IncomingMessage; nodeEnv: string }): Promise<SessionVerificationResult> {
    if (args.nodeEnv === 'production') {
      return {
        ok: false,
        session: null,
        failureReason: 'production_dev_auth',
        failureDetail: 'dev_fixture verifier blocked in NODE_ENV=production',
      }
    }
    // The dev fixture verifier intentionally does NOT trust X-Org-Id /
    // X-Acting-User-Id for session identity — the session is bound to
    // the configured defaults. Tests + the cross-tenant check rely on
    // this so that a hostile client cannot forge a session by setting
    // headers.
    const now = new Date()
    const session: VerifiedSession = {
      sessionId: asSessionId(`dev_${this.opts.defaultOrgId}_${this.opts.defaultUserId}`),
      orgId: asOrgId(this.opts.defaultOrgId),
      actingUserId: asUserId(this.opts.defaultUserId),
      email: this.opts.defaultEmail,
      displayName: 'Local Operator',
      role: this.opts.defaultRole,
      issuedAt: new Date(now.getTime() - 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      authSource: 'dev_fixture',
      verification: {
        verifiedAt: now.toISOString(),
        keyId: null,
        productionSafe: false,
      },
    }
    return { ok: true, session, failureReason: null, failureDetail: null }
  }
}

