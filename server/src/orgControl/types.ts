// Internal types for the Module-27 control plane.

import type {
  OrgId, UserRole, FeatureFlagKey, OrgSettings,
} from '../../../src/domain'
import type { Repo } from '../persistence'

export interface ResolveArgs {
  readonly orgId: OrgId
  readonly currentUserId: string | null
  readonly currentUserRole: UserRole
  readonly repo: Repo
  readonly env?: NodeJS.ProcessEnv
  readonly now?: Date
}

export interface SetActionInputs {
  readonly orgId: OrgId
  readonly actorUserId: string | null
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly repo: Repo
}

export interface SetFeatureFlagInputs extends SetActionInputs {
  readonly key: FeatureFlagKey
  readonly enabled: boolean
}

export type SettingsResult = OrgSettings
