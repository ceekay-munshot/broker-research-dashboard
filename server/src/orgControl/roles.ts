// ─────────────────────────────────────────────────────────────────────────
// Role → surface visibility table.
//
// Pure data; the resolver consumes this when computing the AccessScope.
// Keep tightly scoped — every new surface added here must also exist in
// `USAGE_SURFACES`.
// ─────────────────────────────────────────────────────────────────────────

import type { UserRole, UsageSurface, AccessibleModule } from '../../../src/domain'

/** Surfaces the analyst workflow needs. Visible to every role. */
const ANALYST_SURFACES: readonly UsageSurface[] = [
  'mybook', 'briefing', 'worklog', 'dashboard', 'broker', 'stock',
  'divergence', 'sector', 'calibration', 'catalysts', 'inbox',
]

/** Surfaces the operator/admin needs on top of the analyst set. */
const OPERATOR_SURFACES: readonly UsageSurface[] = [
  'sources', 'usage',
]

/** Admin gets the control plane plus everything else. */
const ADMIN_SURFACES: readonly UsageSurface[] = [
  // 'controlPlane' isn't a UsageSurface today; we expose it via module access.
]

const PER_ROLE: Record<UserRole, readonly UsageSurface[]> = {
  viewer:   ANALYST_SURFACES,
  analyst:  ANALYST_SURFACES,
  pm:       ANALYST_SURFACES,
  operator: [...ANALYST_SURFACES, ...OPERATOR_SURFACES],
  admin:    [...ANALYST_SURFACES, ...OPERATOR_SURFACES, ...ADMIN_SURFACES],
}

/** Roles that can issue write actions on the control plane. */
const WRITE_ROLES = new Set<UserRole>(['admin', 'operator'])

export function accessibleSurfacesFor(role: UserRole): readonly UsageSurface[] {
  return PER_ROLE[role]
}

export function canWrite(role: UserRole): boolean {
  return WRITE_ROLES.has(role)
}

/** Maps `AccessibleModule` (broader category — includes `control_plane`)
 *  to the role(s) that can see it. Used by the module-access default
 *  resolver before per-org overrides are applied. */
export function defaultModuleAccessFor(role: UserRole): Readonly<Record<AccessibleModule, boolean>> {
  const analyst = role === 'viewer' || role === 'analyst' || role === 'pm'
  const operator = role === 'operator'
  const admin = role === 'admin'
  return {
    mybook: true, briefing: true, worklog: true, dashboard: true,
    broker: true, stock: true, divergence: true, sector: true,
    calibration: true, catalysts: true, inbox: true,
    sources: operator || admin,
    usage: operator || admin,
    control_plane: admin || operator,
    // Analyst-only roles never see operator surfaces.
    ...(analyst ? {} : {}),
  }
}
