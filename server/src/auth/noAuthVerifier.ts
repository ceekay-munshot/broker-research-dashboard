// ─────────────────────────────────────────────────────────────────────────
// No-auth verifier — explicit local-only escape hatch.
//
// Always denies, unless `ALLOW_NO_AUTH=1` AND `NODE_ENV !== 'production'`.
// In that explicit dev-only mode, returns a viewer-role fixture so analyst
// surfaces work but operator/admin actions are denied.
// ─────────────────────────────────────────────────────────────────────────

import type { AuthMode, SessionVerificationResult, VerifiedSession } from '../../../src/domain'
import { asOrgId, asUserId, asSessionId } from '../../../src/lib/ids'
import type { SessionVerifier, VerifyArgs } from './types'

export class NoAuthVerifier implements SessionVerifier {
  readonly mode: AuthMode = 'no_auth'
  readonly description = 'no auth (explicit ALLOW_NO_AUTH=1 + dev only; viewer role)'
  readonly productionSafe = false

  constructor(
    private readonly defaultOrgId: string,
    private readonly defaultUserId: string,
  ) {}

  async verify(args: VerifyArgs): Promise<SessionVerificationResult> {
    if (args.nodeEnv === 'production') {
      return {
        ok: false, session: null,
        failureReason: 'production_dev_auth',
        failureDetail: 'no_auth verifier blocked in NODE_ENV=production',
      }
    }
    if (process.env.ALLOW_NO_AUTH !== '1') {
      return {
        ok: false, session: null,
        failureReason: 'missing_session',
        failureDetail: 'no_auth verifier requires ALLOW_NO_AUTH=1',
      }
    }
    const now = new Date()
    const session: VerifiedSession = {
      sessionId: asSessionId(`noauth_${this.defaultOrgId}_${this.defaultUserId}`),
      orgId: asOrgId(this.defaultOrgId),
      actingUserId: asUserId(this.defaultUserId),
      email: 'noauth@local',
      displayName: 'No-Auth Local',
      role: 'viewer',
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 1000).toISOString(),
      authSource: 'no_auth',
      verification: { verifiedAt: now.toISOString(), keyId: null, productionSafe: false },
    }
    return { ok: true, session, failureReason: null, failureDetail: null }
  }
}
