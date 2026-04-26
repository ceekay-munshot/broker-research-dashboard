// ─────────────────────────────────────────────────────────────────────────
// Module 28 — Session handoff + tenant isolation domain.
//
// `VerifiedSession` is the authenticated context every server route MUST
// obtain before doing any work. Producing it goes through a swappable
// `SessionVerifier` (server-side); this file just declares the wire
// shape so the adapter, CLI, and Control Plane Session Safety panel can
// all reason about it.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, UserId } from './ids'
import type { Iso8601 } from './common'
import type { UserRole } from './organization'

declare const brand: unique symbol
export type SessionId          = string & { readonly [brand]: 'SessionId' }
export type DeniedAccessEventId = string & { readonly [brand]: 'DeniedAccessEventId' }

/** Where the session came from. The verifier factory picks an impl
 *  based on `AUTH_MODE` env. Dev-only modes are explicitly named. */
export type AuthMode =
  | 'header_signed'      // production: signed X-Session-* headers from Munshot
  | 'bearer_introspect'  // production: POST token to upstream introspect endpoint
  | 'dev_fixture'        // development-only: a known fixture session
  | 'no_auth'            // local-only: every request fails unless ALLOW_NO_AUTH=1

/** Reasons a verification can fail. Each maps to an HTTP 401/403 + an
 *  audit entry. The frontend rarely sees these — they're for operator
 *  diagnostics. */
export type SessionVerificationFailureReason =
  | 'missing_session'        // no session header / cookie / token
  | 'invalid_signature'      // HMAC didn't match
  | 'expired_session'        // expiresAt is in the past
  | 'unknown_org'            // session orgId isn't a registered org
  | 'cross_tenant_request'   // requested org doesn't match session org
  | 'role_denied'            // route requires operator/admin; session is analyst
  | 'production_dev_auth'    // dev_fixture/no_auth hit in NODE_ENV=production
  | 'introspect_failed'      // upstream introspect call failed
  | 'malformed_session'      // session structure doesn't validate

export interface VerifiedSession {
  readonly sessionId: SessionId
  readonly orgId: OrgId
  readonly actingUserId: UserId
  readonly email: string
  readonly displayName: string
  readonly role: UserRole
  readonly issuedAt: Iso8601
  readonly expiresAt: Iso8601
  readonly authSource: AuthMode
  /** Best-effort signature/verification metadata. Not the raw secret. */
  readonly verification: {
    readonly verifiedAt: Iso8601
    /** The key id (kid) or token-id used. Never the secret. */
    readonly keyId: string | null
    /** True when production-safe; false for dev modes. */
    readonly productionSafe: boolean
  }
}

export interface SessionVerificationResult {
  readonly ok: boolean
  readonly session: VerifiedSession | null
  readonly failureReason: SessionVerificationFailureReason | null
  readonly failureDetail: string | null
}

/** Structured permission for one route. Pure data; the matrix lives in
 *  `server/src/auth/permissions.ts`. */
export type HttpMethod = 'GET' | 'POST'

export type RouteRequiredRole =
  | 'any'         // analyst | pm | viewer | operator | admin
  | 'operator'    // operator | admin
  | 'admin'       // admin only

export interface RoutePermission {
  readonly method: HttpMethod
  readonly path: string
  readonly requiredRole: RouteRequiredRole
  readonly description: string
  /** When true, the route is allowed in dev_fixture mode but the audit
   *  entry tags it as `production_unsafe` if hit in production. */
  readonly productionRestricted?: boolean
}

export type RoutePermissionMatrix = readonly RoutePermission[]

/** Recorded for any denied access — operator/admin can review through
 *  the Control Plane Session Safety panel + CLI. */
export type DeniedAccessReason = SessionVerificationFailureReason

export interface DeniedAccessEvent {
  readonly id: DeniedAccessEventId
  /** Best-effort: when the route requires verification before it can
   *  associate an org, this may be null. */
  readonly orgId: OrgId | null
  readonly actingUserId: UserId | null
  readonly attemptedOrgId: OrgId | null
  readonly attemptedRole: UserRole | null
  readonly route: string
  readonly method: HttpMethod
  readonly authMode: AuthMode | null
  readonly reason: DeniedAccessReason
  readonly detail: string | null
  readonly occurredAt: Iso8601
}

/** Operator-facing rollup. Returned by `getSessionSafety()`. */
export interface SessionSafetySnapshot {
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  readonly currentSession: VerifiedSession | null
  readonly authMode: AuthMode
  readonly productionSafe: boolean
  /** Verdict + checklist results. */
  readonly checks: readonly SecurityCheck[]
  /** Last N denied-access events. */
  readonly recentDenials: readonly DeniedAccessEvent[]
}

export type SecurityCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped'

export interface SecurityCheck {
  readonly id: string
  readonly title: string
  readonly status: SecurityCheckStatus
  readonly detail: string
}
