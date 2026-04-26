// ─────────────────────────────────────────────────────────────────────────
// Bounded write actions for the control plane.
//
// Every action:
//   - validates the actor's role (operator / admin)
//   - reads the current effective value
//   - persists the override
//   - appends an audit entry with before/after + reason
//
// Used by the CLI + the four operator-only POST endpoints.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, FeatureFlagKey, FeatureFlagAssignment, FeatureFlagSource,
  AccessibleModule, OrgIntegrationConfig, OrgModuleAccess,
  RolloutState, SourceKind, SourceProviderMode, UserRole,
} from '../../../src/domain'
import { asFeatureFlagAssignmentId } from '../../../src/lib/ids'
import type { Repo } from '../persistence'
import { canWrite } from './roles'
import { appendAudit } from './audit'

export class OrgControlServiceError extends Error {
  constructor(message: string, readonly code: 'forbidden' | 'invalid' | 'not_found') {
    super(message)
  }
}

function assertRole(role: UserRole): void {
  if (!canWrite(role)) {
    throw new OrgControlServiceError(`role "${role}" cannot perform write actions`, 'forbidden')
  }
}

export interface SetFlagInputs {
  readonly orgId: OrgId
  readonly key: FeatureFlagKey
  readonly enabled: boolean
  readonly actorUserId: import('../../../src/domain').UserId | null
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly repo: Repo
  readonly now?: Date
}

export function setFeatureFlag(input: SetFlagInputs): FeatureFlagAssignment {
  assertRole(input.actorRole)
  const now = (input.now ?? new Date()).toISOString()
  const before = input.repo.getFeatureFlagOverride(input.orgId, input.key)
  const next: FeatureFlagAssignment = {
    id: asFeatureFlagAssignmentId(`flag_${input.orgId}_${input.key}_${Date.now().toString(36)}`),
    orgId: input.orgId,
    key: input.key,
    enabled: input.enabled,
    source: 'org_override' as FeatureFlagSource,
    updatedAt: now,
    updatedBy: input.actorUserId,
    note: input.reason,
  }
  input.repo.upsertFeatureFlagOverride(next)
  appendAudit({
    orgId: input.orgId,
    area: 'feature_flag',
    key: input.key,
    before: before ? { enabled: before.enabled } : null,
    after: { enabled: input.enabled },
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason: input.reason,
    repo: input.repo,
    now: input.now,
  })
  input.repo.flush()
  return next
}

export interface SetModuleInputs {
  readonly orgId: OrgId
  readonly module: AccessibleModule
  readonly enabled: boolean
  readonly actorUserId: import('../../../src/domain').UserId | null
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly repo: Repo
  readonly now?: Date
}

export function setModuleAccess(input: SetModuleInputs): OrgModuleAccess {
  assertRole(input.actorRole)
  const before = input.repo.getModuleAccessOverride(input.orgId, input.module)
  const next: OrgModuleAccess = {
    module: input.module,
    enabled: input.enabled,
    source: 'org_override' as FeatureFlagSource,
    note: input.reason,
  }
  input.repo.upsertModuleAccessOverride(input.orgId, next)
  appendAudit({
    orgId: input.orgId,
    area: 'module_access',
    key: input.module,
    before: before ? { enabled: before.enabled } : null,
    after: { enabled: input.enabled },
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason: input.reason,
    repo: input.repo,
    now: input.now,
  })
  input.repo.flush()
  return next
}

export interface SetSourceModeInputs {
  readonly orgId: OrgId
  readonly sourceKind: SourceKind
  readonly mode: SourceProviderMode
  readonly stalenessThresholdSeconds?: number
  readonly actorUserId: import('../../../src/domain').UserId | null
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly repo: Repo
  readonly now?: Date
}

export function setSourceMode(input: SetSourceModeInputs): OrgIntegrationConfig {
  assertRole(input.actorRole)
  const before = input.repo.getIntegrationOverride(input.orgId, input.sourceKind)
  const next: OrgIntegrationConfig = {
    sourceKind: input.sourceKind,
    mode: input.mode,
    source: 'org_override' as FeatureFlagSource,
    stalenessThresholdSeconds: input.stalenessThresholdSeconds ?? before?.stalenessThresholdSeconds ?? 0,
    note: input.reason,
  }
  input.repo.upsertIntegrationOverride(input.orgId, next)
  appendAudit({
    orgId: input.orgId,
    area: 'integration',
    key: input.sourceKind,
    before: before ? { mode: before.mode } : null,
    after: { mode: input.mode },
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason: input.reason,
    repo: input.repo,
    now: input.now,
  })
  input.repo.flush()
  return next
}

export interface SetRolloutStateInputs {
  readonly orgId: OrgId
  readonly state: RolloutState | null
  readonly note?: string | null
  readonly actorUserId: import('../../../src/domain').UserId | null
  readonly actorRole: UserRole
  readonly reason: string | null
  readonly repo: Repo
  readonly now?: Date
}

export function setRolloutState(input: SetRolloutStateInputs): void {
  assertRole(input.actorRole)
  const before = input.repo.getRolloutStateOverride(input.orgId)
  input.repo.upsertRolloutStateOverride(input.orgId, input.state)
  if (input.note !== undefined) {
    input.repo.upsertOrgRolloutNote(input.orgId, input.note)
  }
  appendAudit({
    orgId: input.orgId,
    area: 'rollout_state',
    key: 'rollout_state',
    before: before ? { state: before } : null,
    after: input.state ? { state: input.state } : { state: null },
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason: input.reason,
    repo: input.repo,
    now: input.now,
  })
  input.repo.flush()
}
