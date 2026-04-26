// ─────────────────────────────────────────────────────────────────────────
// Route permission matrix — pure data + checker.
//
// Every `/v1` path is one entry. Roles:
//   any        → analyst | pm | viewer | operator | admin (org-membership only)
//   operator   → operator | admin
//   admin      → admin only
//
// Read-only analyst surfaces are `any`. Operator surfaces (Sources,
// Pilot Analytics, deliveries inspection) are `operator`. Org-control
// writes are `operator`/`admin`.
// ─────────────────────────────────────────────────────────────────────────

import type {
  RoutePermission, RoutePermissionMatrix, RouteRequiredRole, UserRole,
  HttpMethod,
} from '../../../src/domain'

const r = (
  method: HttpMethod, path: string, requiredRole: RouteRequiredRole,
  description: string, productionRestricted = false,
): RoutePermission => ({ method, path, requiredRole, description, productionRestricted })

export const ROUTE_PERMISSIONS: RoutePermissionMatrix = [
  // Session + tenant catalog — every authenticated user can read.
  r('GET',  '/v1/session/scope',                'any', 'Session scope'),
  r('GET',  '/v1/organization',                 'any', 'Org metadata'),
  r('GET',  '/v1/me',                           'any', 'Current user'),
  r('GET',  '/v1/brokers',                      'any', 'Broker catalog'),
  r('GET',  '/v1/brokers/:brokerId',            'any', 'Single broker'),
  r('GET',  '/v1/sectors',                      'any', 'Sectors'),
  r('GET',  '/v1/sectors/:sectorId',            'any', 'Single sector'),
  r('GET',  '/v1/stocks',                       'any', 'Covered stocks'),
  r('GET',  '/v1/stocks/:ticker',               'any', 'Single stock'),

  // Analyst surfaces — read-only.
  r('GET',  '/v1/broker-emails',                'any', 'Broker emails feed'),
  r('GET',  '/v1/broker-emails/:emailId',       'any', 'Single broker email'),
  r('GET',  '/v1/broker-emails/:emailId/attachments', 'any', 'Email attachments'),
  r('GET',  '/v1/research-reports',             'any', 'Research reports'),
  r('GET',  '/v1/research-reports/:reportId',   'any', 'Single research report'),
  r('GET',  '/v1/research-reports/:reportId/summary', 'any', 'Report summary'),
  r('GET',  '/v1/research-reports/:reportId/evidence', 'any', 'Report evidence'),
  r('GET',  '/v1/broker-stock-opinions',        'any', 'Broker-stock opinions'),
  r('GET',  '/v1/conflict-closures',            'any', 'Conflict closures'),
  r('GET',  '/v1/conflict-closures/:ticker',    'any', 'Single conflict closure'),
  r('GET',  '/v1/sector-intelligence',          'any', 'Sector intelligence list'),
  r('GET',  '/v1/sector-intelligence/:sectorId', 'any', 'Sector intelligence detail'),
  r('GET',  '/v1/kpi-snapshot',                 'any', 'KPI snapshot'),
  r('GET',  '/v1/portfolio-snapshot',           'any', 'Portfolio snapshot'),
  r('GET',  '/v1/alerts',                       'any', 'Alerts feed'),
  r('GET',  '/v1/alerts/:alertId',              'any', 'Single alert'),
  r('GET',  '/v1/alert-digests',                'any', 'Alert digests'),
  r('GET',  '/v1/alert-digests/:digestId',      'any', 'Single digest'),
  r('GET',  '/v1/alert-digests/latest',         'any', 'Latest digest'),
  r('GET',  '/v1/calibration/snapshot',         'any', 'Calibration snapshot'),
  r('GET',  '/v1/calibration/brokers',          'any', 'Broker calibrations'),
  r('GET',  '/v1/calibration/brokers/:id',      'any', 'Single broker calibration'),
  r('GET',  '/v1/calibration/alerts',           'any', 'Alert effectiveness list'),
  r('GET',  '/v1/calibration/alerts/:kind',     'any', 'Single alert effectiveness'),
  r('GET',  '/v1/calibration/coverage/:ticker', 'any', 'Coverage signal'),
  r('GET',  '/v1/catalysts',                    'any', 'Catalyst calendar'),
  r('GET',  '/v1/catalysts/:catalystId',        'any', 'Single catalyst'),
  r('GET',  '/v1/catalysts/:catalystId/brief',  'any', 'Pre-event brief'),
  r('GET',  '/v1/catalysts/:catalystId/snapshots', 'any', 'Expectation snapshots'),
  r('GET',  '/v1/catalysts/:catalystId/post-event-review', 'any', 'Latest post-event review'),
  r('GET',  '/v1/post-event-reviews',           'any', 'Post-event reviews'),
  r('GET',  '/v1/post-event-reviews/:reviewId', 'any', 'Single post-event review'),
  r('GET',  '/v1/ingestion-status',             'any', 'Ingestion status'),

  // Operator surfaces.
  r('GET',  '/v1/sources/health',               'operator', 'Sources health snapshot'),
  r('GET',  '/v1/deliveries',                   'operator', 'Delivery attempts'),
  r('GET',  '/v1/deliveries/:attemptId',        'operator', 'Single delivery attempt'),
  r('GET',  '/v1/usage/snapshot',               'operator', 'Org usage snapshot'),
  r('GET',  '/v1/usage/roi',                    'operator', 'Pilot ROI snapshot'),
  // Usage event ingest stays `any` — every authenticated user emits events.
  r('POST', '/v1/usage/events',                 'any',      'Usage event ingest'),

  // Org control plane.
  r('GET',  '/v1/org-control/settings',         'operator', 'Org settings'),
  r('GET',  '/v1/org-control/audit',            'operator', 'Config audit'),
  r('GET',  '/v1/org-control/session-safety',   'operator', 'Session safety snapshot'),
  r('POST', '/v1/org-control/flag',             'operator', 'Toggle feature flag'),
  r('POST', '/v1/org-control/module',           'operator', 'Toggle module access'),
  r('POST', '/v1/org-control/source-mode',      'operator', 'Switch source mode'),
  r('POST', '/v1/org-control/rollout-state',    'operator', 'Set rollout state'),
] as const

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0, analyst: 1, pm: 1, operator: 2, admin: 3,
}

export function roleAllows(role: UserRole, requiredRole: RouteRequiredRole): boolean {
  if (requiredRole === 'any') return true
  if (requiredRole === 'operator') return ROLE_RANK[role] >= ROLE_RANK['operator']
  if (requiredRole === 'admin') return ROLE_RANK[role] >= ROLE_RANK['admin']
  return false
}

export function findRoutePermission(method: HttpMethod, pathname: string): RoutePermission | null {
  for (const p of ROUTE_PERMISSIONS) {
    if (p.method !== method) continue
    if (matchPattern(p.path, pathname)) return p
  }
  return null
}

function matchPattern(pattern: string, pathname: string): boolean {
  const pp = pattern.split('/').filter(Boolean)
  const xp = pathname.split('/').filter(Boolean)
  if (pp.length !== xp.length) return false
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!
    if (p.startsWith(':')) continue
    if (p !== xp[i]) return false
  }
  return true
}

/** A flag that the security CLI uses to verify the matrix is exhaustive. */
export function listAllProtectedRoutes(): RoutePermissionMatrix {
  return ROUTE_PERMISSIONS
}
