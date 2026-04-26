// ─────────────────────────────────────────────────────────────────────────
// Module 27 — Org control plane / permissions / rollout management.
//
// Org-scoped governance over what's enabled, who can see what, which
// providers are bound, where deliveries route, and where each org sits
// in the rollout journey. Every change is audited.
//
// The shape is intentionally minimal — env vars stay as global defaults,
// per-org records override where it makes sense, and the resolver tags
// each effective value with its source so operators can tell at a glance.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, UserId } from './ids'
import type { Iso8601 } from './common'
import type { SourceKind, SourceProviderMode } from './sources'
import type { DeliveryContentKind, DeliveryChannel } from './delivery'
import type { UsageSurface } from './usage'

declare const brand: unique symbol
export type FeatureFlagAssignmentId = string & { readonly [brand]: 'FeatureFlagAssignmentId' }
export type PermissionGrantId       = string & { readonly [brand]: 'PermissionGrantId' }
export type ConfigAuditEntryId      = string & { readonly [brand]: 'ConfigAuditEntryId' }

/** Minimal role model. Each role unlocks a set of dashboard surfaces.
 *  The `UserRole` type is canonical in `./organization`; this list mirrors
 *  it for runtime iteration. */
export const USER_ROLES = ['pm', 'analyst', 'operator', 'admin', 'viewer'] as const
import type { UserRole } from './organization'
export type { UserRole }

/** Canonical feature-flag keys that the resolver knows about. Adding a new
 *  key requires a default + a semantic decision (env-only vs org-scoped). */
export const FEATURE_FLAG_KEYS = [
  'adaptive_ranking.enabled',
  'adaptive_ranking.show_compare',
  'delivery.email.enabled',
  'delivery.slack.enabled',
  'delivery.webhook.enabled',
  'delivery.scheduler.enabled',
  'sources.portfolio.real_provider',
  'sources.catalyst_calendar.real_provider',
  'sources.market_data.real_provider',
  'usage.tracking.enabled',
  'control_plane.writes_enabled',
] as const
export type FeatureFlagKey = typeof FEATURE_FLAG_KEYS[number]

/** Where the effective value came from. */
export type FeatureFlagSource = 'env' | 'org_override' | 'default'

export interface FeatureFlagAssignment {
  readonly id: FeatureFlagAssignmentId
  readonly orgId: OrgId
  readonly key: FeatureFlagKey
  readonly enabled: boolean
  readonly source: FeatureFlagSource
  readonly updatedAt: Iso8601
  readonly updatedBy: UserId | null
  readonly note: string | null
}

/** Module access — a coarser switch than feature flags. Off ⇒ tab hidden
 *  for everyone, regardless of role. Used for "this fund hasn't paid for
 *  Catalysts yet" or "we're piloting Pilot Analytics with this org only". */
export type AccessibleModule =
  | 'mybook' | 'briefing' | 'worklog' | 'dashboard' | 'broker' | 'stock'
  | 'divergence' | 'sector' | 'calibration' | 'catalysts' | 'sources'
  | 'inbox' | 'usage' | 'control_plane'

export interface OrgModuleAccess {
  readonly module: AccessibleModule
  readonly enabled: boolean
  readonly source: FeatureFlagSource
  readonly note: string | null
}

export interface PermissionGrant {
  readonly id: PermissionGrantId
  readonly orgId: OrgId
  readonly userId: UserId
  readonly role: UserRole
  readonly grantedAt: Iso8601
  readonly grantedBy: UserId | null
}

/** Per-source override of the env-driven `SOURCE_<KIND>_*` config. Only
 *  the mode is org-scoped; baseUrl + token env names stay env-only so
 *  secrets never round-trip through `/v1`. */
export interface OrgIntegrationConfig {
  readonly sourceKind: SourceKind
  /** Effective mode after env + org override. */
  readonly mode: SourceProviderMode
  readonly source: FeatureFlagSource
  readonly stalenessThresholdSeconds: number
  /** Free-form operator note ("piloting in shadow mode through 2026-05-15"). */
  readonly note: string | null
}

/** Per-content-kind delivery routing override. Wraps the env-driven
 *  Module-25 subscriptions with an explicit org-scoped enable/disable. */
export interface DeliveryRoutingConfig {
  readonly contentKind: DeliveryContentKind
  readonly enabled: boolean
  readonly source: FeatureFlagSource
  readonly channels: readonly DeliveryChannel[]
  readonly note: string | null
}

/** Deterministic rollout state derived from the effective settings. */
export const ROLLOUT_STATES = [
  'pilot',          // no real sources, no real channels, no adaptive
  'compare_only',   // compare flag on, adaptive off
  'adaptive_on',    // adaptive flag on, no real channels
  'delivery_on',    // ≥ 1 real channel enabled (email/slack/webhook)
  'production',     // adaptive on + real channel + healthy sources
  'degraded',       // any failing source — overrides the others
] as const
export type RolloutState = typeof ROLLOUT_STATES[number]

export type ConfigAuditArea =
  | 'feature_flag' | 'module_access' | 'permission'
  | 'integration' | 'delivery_routing' | 'rollout_state'

export interface ConfigAuditEntry {
  readonly id: ConfigAuditEntryId
  readonly orgId: OrgId
  readonly area: ConfigAuditArea
  readonly key: string
  /** Stringified before/after for portability across `/v1`. */
  readonly before: string | null
  readonly after: string | null
  readonly actorUserId: UserId | null
  readonly actorRole: UserRole | null
  readonly reason: string | null
  readonly occurredAt: Iso8601
}

/** A surface-access map computed for a given (org, user, role). */
export interface AccessScope {
  readonly orgId: OrgId
  readonly userId: UserId | null
  readonly role: UserRole
  readonly accessibleSurfaces: readonly UsageSurface[]
  /** Subset of `accessibleSurfaces` that allow operator write actions. */
  readonly writableSurfaces: readonly UsageSurface[]
}

/** What `/v1/org-control/settings` returns. Lives at the org level. */
export interface OrgSettings {
  readonly orgId: OrgId
  readonly generatedAt: Iso8601
  readonly currentUserRole: UserRole
  readonly featureFlags: readonly FeatureFlagAssignment[]
  readonly modules: readonly OrgModuleAccess[]
  readonly permissions: readonly PermissionGrant[]
  readonly integrations: readonly OrgIntegrationConfig[]
  readonly deliveryRouting: readonly DeliveryRoutingConfig[]
  readonly rolloutState: RolloutState
  readonly access: AccessScope
  readonly recentAudit: readonly ConfigAuditEntry[]
  readonly notes: {
    /** Free-form rollout note set by an admin. */
    readonly rollout: string | null
  }
}
