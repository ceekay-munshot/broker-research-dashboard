import type { OrgId, UserId, BrokerId } from './ids'
import type { Iso8601 } from './common'

// A tenant. Every read call through the adapter is scoped to one of these.
// The `forwardingAddress` is the Munshot/Vimana inbox the org's users point
// their broker auto-forwarding rules at. Only emails that land in that
// mailbox and whose sender matches an enabled broker are admitted.
export interface Organization {
  readonly id: OrgId
  readonly name: string
  readonly shortName: string
  readonly forwardingAddress: string
  readonly createdAt: Iso8601
  readonly enabledBrokerIds: readonly BrokerId[]
  readonly timeZone: string
  readonly defaultCurrency: string
}

export type UserRole = 'analyst' | 'pm' | 'admin' | 'viewer'

export interface User {
  readonly id: UserId
  readonly orgId: OrgId
  readonly email: string
  readonly displayName: string
  readonly role: UserRole
  readonly createdAt: Iso8601
}
