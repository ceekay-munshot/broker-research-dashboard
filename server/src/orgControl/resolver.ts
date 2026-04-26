// ─────────────────────────────────────────────────────────────────────────
// Org settings resolver — merges env defaults + persisted overrides into
// one effective `OrgSettings`. Pure; no I/O beyond the Repo reads.
// ─────────────────────────────────────────────────────────────────────────

import type {
  FeatureFlagAssignment, FeatureFlagKey,
  FeatureFlagSource, OrgModuleAccess, AccessibleModule,
  OrgIntegrationConfig, DeliveryRoutingConfig, AccessScope,
  PermissionGrant, ConfigAuditEntry, RolloutState, UserRole,
  SourceKind, DeliveryContentKind, DeliveryChannel,
  SourcesHealthSnapshot,
} from '../../../src/domain'
import { FEATURE_FLAG_KEYS, SOURCE_KINDS, DELIVERY_CONTENT_KINDS } from '../../../src/domain'
import { asFeatureFlagAssignmentId } from '../../../src/lib/ids'
import { accessibleSurfacesFor, canWrite } from './roles'
import { deriveRolloutState } from './rolloutState'
import {
  buildSourceConfigsForOrg,
} from '../sources/config'
import { buildSubscriptionsForOrg, buildChannelConfigs } from '../delivery/config'
import type { ResolveArgs, SettingsResult } from './types'

export function resolveOrgSettings(args: ResolveArgs, sourcesHealth: SourcesHealthSnapshot | null = null): SettingsResult {
  const env = args.env ?? process.env
  const now = (args.now ?? new Date()).toISOString()

  // ── Feature flags ─────────────────────────────────────────────────
  const overrides = new Map(args.repo.listFeatureFlagOverrides(args.orgId).map((f) => [f.key, f]))
  const featureFlags: FeatureFlagAssignment[] = FEATURE_FLAG_KEYS.map((key) => {
    const override = overrides.get(key)
    if (override) return override
    return {
      id: asFeatureFlagAssignmentId(`flag_default_${args.orgId}_${key}`),
      orgId: args.orgId,
      key,
      enabled: defaultFlagFromEnv(key, env),
      source: 'env' as FeatureFlagSource,
      updatedAt: now,
      updatedBy: null,
      note: null,
    }
  })

  // ── Modules ────────────────────────────────────────────────────────
  const moduleOverrides = new Map(
    args.repo.listModuleAccessOverrides(args.orgId).map((m) => [m.module, m]),
  )
  const ALL_MODULES: readonly AccessibleModule[] = [
    'mybook', 'briefing', 'worklog', 'dashboard', 'broker', 'stock',
    'divergence', 'sector', 'calibration', 'catalysts',
    'sources', 'inbox', 'usage', 'control_plane',
  ]
  const modules: OrgModuleAccess[] = ALL_MODULES.map((module) => {
    const override = moduleOverrides.get(module)
    if (override) return override
    return {
      module,
      enabled: defaultModuleEnabled(module, env),
      source: 'default' as FeatureFlagSource,
      note: null,
    }
  })

  // ── Integrations ──────────────────────────────────────────────────
  const integrationOverrides = new Map(
    args.repo.listIntegrationOverrides(args.orgId).map((i) => [i.sourceKind, i]),
  )
  const sourceConfigs = buildSourceConfigsForOrg(args.orgId, env)
  const integrations: OrgIntegrationConfig[] = SOURCE_KINDS.map((sourceKind: SourceKind) => {
    const override = integrationOverrides.get(sourceKind)
    if (override) return override
    const cfg = sourceConfigs.find((c) => c.kind === sourceKind)
    return {
      sourceKind,
      mode: cfg?.providerMode ?? 'disabled',
      source: 'env' as FeatureFlagSource,
      stalenessThresholdSeconds: cfg?.stalenessThresholdSeconds ?? 0,
      note: null,
    }
  })

  // ── Delivery routing ──────────────────────────────────────────────
  const routingOverrides = new Map(
    args.repo.listDeliveryRoutingOverrides(args.orgId).map((r) => [r.contentKind, r]),
  )
  const subs = buildSubscriptionsForOrg(args.orgId, env)
  const channelConfigs = buildChannelConfigs(env)
  const deliveryRouting: DeliveryRoutingConfig[] = DELIVERY_CONTENT_KINDS.map((contentKind: DeliveryContentKind) => {
    const override = routingOverrides.get(contentKind)
    if (override) return override
    const sub = subs.find((s) => s.contentKind === contentKind)
    const channels = sub
      ? Array.from(new Set(sub.targets.map((t) => t.channel)))
      : []
    const enabled = (sub?.enabled ?? true) && channels.some((c) => {
      const ch = channelConfigs.find((cc) => cc.channel === c)
      return ch?.enabled ?? false
    })
    return {
      contentKind,
      enabled,
      source: 'env' as FeatureFlagSource,
      channels: channels as readonly DeliveryChannel[],
      note: null,
    }
  })

  // ── Permissions ───────────────────────────────────────────────────
  const permissions: readonly PermissionGrant[] = args.repo.listPermissionGrants(args.orgId)

  // ── Audit ─────────────────────────────────────────────────────────
  const recentAudit: readonly ConfigAuditEntry[] = args.repo.listConfigAuditEntries(args.orgId, { limit: 20 })

  // ── Rollout state ─────────────────────────────────────────────────
  const override = args.repo.getRolloutStateOverride(args.orgId)
  const rolloutState: RolloutState = deriveRolloutState({
    featureFlags, integrations, sourcesHealth, override,
  })

  // ── Access scope ──────────────────────────────────────────────────
  const role: UserRole = args.currentUserRole
  const access: AccessScope = {
    orgId: args.orgId,
    userId: (args.currentUserId as unknown as PermissionGrant['userId']) ?? null,
    role,
    accessibleSurfaces: accessibleSurfacesFor(role),
    writableSurfaces: canWrite(role) ? ['sources', 'usage'] : [],
  }

  return {
    orgId: args.orgId,
    generatedAt: now,
    currentUserRole: role,
    featureFlags,
    modules,
    permissions,
    integrations,
    deliveryRouting,
    rolloutState,
    access,
    recentAudit,
    notes: { rollout: args.repo.getOrgRolloutNote(args.orgId) },
  }
}

function defaultFlagFromEnv(key: FeatureFlagKey, env: NodeJS.ProcessEnv): boolean {
  switch (key) {
    case 'adaptive_ranking.enabled':
      return env.VITE_CALIBRATION_AWARE_RANKING === '1' || env.VITE_CALIBRATION_AWARE_RANKING === 'true'
    case 'adaptive_ranking.show_compare':
      return env.VITE_SHOW_RANKING_COMPARE === '1' || env.VITE_SHOW_RANKING_COMPARE === 'true'
    case 'delivery.email.enabled':
      return env.DELIVERY_EMAIL_ENABLED === '1' || env.DELIVERY_EMAIL_ENABLED === 'true'
    case 'delivery.slack.enabled':
      return env.DELIVERY_SLACK_ENABLED === '1' || env.DELIVERY_SLACK_ENABLED === 'true'
    case 'delivery.webhook.enabled':
      return env.DELIVERY_WEBHOOK_ENABLED === '1' || env.DELIVERY_WEBHOOK_ENABLED === 'true'
    case 'delivery.scheduler.enabled':
      return true   // scheduler always available; CLI/runtime decides
    case 'sources.portfolio.real_provider':
      return env.SOURCE_PORTFOLIO_MODE === 'http'
    case 'sources.catalyst_calendar.real_provider':
      return env.SOURCE_CATALYST_CALENDAR_MODE === 'http'
    case 'sources.market_data.real_provider':
      return env.SOURCE_MARKET_DATA_MODE === 'http'
    case 'usage.tracking.enabled':
      return env.USAGE_TRACKING_DISABLED !== '1'
    case 'control_plane.writes_enabled':
      return env.CONTROL_PLANE_WRITES_ENABLED !== '0'
  }
}

function defaultModuleEnabled(module: AccessibleModule, env: NodeJS.ProcessEnv): boolean {
  // Almost everything is on by default. Operators turn off via per-org overrides.
  if (module === 'control_plane') {
    return env.CONTROL_PLANE_DISABLED !== '1'
  }
  return true
}
