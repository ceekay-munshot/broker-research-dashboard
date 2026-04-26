// ─────────────────────────────────────────────────────────────────────────
// Pure transforms over `OrgSettings` for the Control Plane tab.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgSettings, FeatureFlagAssignment, OrgModuleAccess, OrgIntegrationConfig,
  DeliveryRoutingConfig, ConfigAuditEntry, RolloutState, FeatureFlagSource,
  PermissionGrant, UserRole,
} from '../domain'

export interface ControlPlaneViewModel {
  readonly hasData: boolean
  readonly orgId: string
  readonly currentUserRole: UserRole
  readonly canWrite: boolean
  readonly rolloutState: RolloutState
  readonly rolloutNote: string | null
  readonly featureFlags: readonly FeatureFlagAssignment[]
  readonly modules: readonly OrgModuleAccess[]
  readonly permissions: readonly PermissionGrant[]
  readonly integrations: readonly OrgIntegrationConfig[]
  readonly deliveryRouting: readonly DeliveryRoutingConfig[]
  readonly recentAudit: readonly ConfigAuditEntry[]
  readonly counts: {
    readonly flagsOverridden: number
    readonly modulesOverridden: number
    readonly integrationsOverridden: number
  }
}

export function buildControlPlaneViewModel(snap: OrgSettings | null): ControlPlaneViewModel {
  if (!snap) {
    return {
      hasData: false,
      orgId: '',
      currentUserRole: 'analyst',
      canWrite: false,
      rolloutState: 'pilot',
      rolloutNote: null,
      featureFlags: [], modules: [], permissions: [],
      integrations: [], deliveryRouting: [], recentAudit: [],
      counts: { flagsOverridden: 0, modulesOverridden: 0, integrationsOverridden: 0 },
    }
  }
  const role = snap.currentUserRole
  const canWrite = role === 'admin' || role === 'operator'
  const flagsOverridden = snap.featureFlags.filter((f) => f.source === 'org_override').length
  const modulesOverridden = snap.modules.filter((m) => m.source === 'org_override').length
  const integrationsOverridden = snap.integrations.filter((i) => i.source === 'org_override').length
  return {
    hasData: true,
    orgId: snap.orgId as unknown as string,
    currentUserRole: role,
    canWrite,
    rolloutState: snap.rolloutState,
    rolloutNote: snap.notes.rollout,
    featureFlags: snap.featureFlags,
    modules: snap.modules,
    permissions: snap.permissions,
    integrations: snap.integrations,
    deliveryRouting: snap.deliveryRouting,
    recentAudit: snap.recentAudit,
    counts: { flagsOverridden, modulesOverridden, integrationsOverridden },
  }
}

export const ROLLOUT_STATE_TONE: Record<RolloutState, string> = {
  pilot:        'text-slate-300 border-line/15',
  compare_only: 'text-amber-300 border-amber-500/30 bg-amber-500/[0.06]',
  adaptive_on:  'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.06]',
  delivery_on:  'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.06]',
  production:   'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  degraded:     'text-rose-300 border-rose-500/40 bg-rose-500/10',
}

export const SOURCE_BADGE_TONE: Record<FeatureFlagSource, string> = {
  env:           'text-slate-400 border-line/10',
  org_override:  'text-emerald-300 border-emerald-500/30',
  default:       'text-slate-500 border-line/10',
}
