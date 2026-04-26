// Persist denied-access events to the Repo so the Control Plane Session
// Safety panel + CLI can surface them.

import type {
  DeniedAccessEvent, DeniedAccessReason, OrgId, UserId, AuthMode,
  HttpMethod, UserRole,
} from '../../../src/domain'
import { asDeniedAccessEventId } from '../../../src/lib/ids'
import type { Repo } from '../persistence'

export interface RecordDenialArgs {
  readonly repo: Repo
  readonly route: string
  readonly method: HttpMethod
  readonly reason: DeniedAccessReason
  readonly detail: string | null
  readonly authMode: AuthMode | null
  readonly orgId: OrgId | null
  readonly actingUserId: UserId | null
  readonly attemptedOrgId: OrgId | null
  readonly attemptedRole: UserRole | null
  readonly now?: Date
}

export function recordDenial(args: RecordDenialArgs): DeniedAccessEvent {
  const now = args.now ?? new Date()
  const entry: DeniedAccessEvent = {
    id: asDeniedAccessEventId(`den_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    orgId: args.orgId,
    actingUserId: args.actingUserId,
    attemptedOrgId: args.attemptedOrgId,
    attemptedRole: args.attemptedRole,
    route: args.route,
    method: args.method,
    authMode: args.authMode,
    reason: args.reason,
    detail: args.detail,
    occurredAt: now.toISOString(),
  }
  args.repo.appendDeniedAccessEvent(entry)
  return entry
}
