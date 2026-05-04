// Tiny hook that returns the current user's effective role.
//
// Precedence:
//   1. URL `?role=...` override (escape hatch for previewing roles in
//      demo / staging without changing server settings).
//   2. `OrgSettings.currentUserRole` from the server (authoritative).
//   3. Default to 'analyst' — the customer-facing role. Admin / operator
//      surfaces stay hidden until the server says otherwise.

import { useAdapterQuery } from './useAdapterQuery'
import type { OrgSettings, UserRole } from '../domain'

const VALID_ROLES: readonly UserRole[] = ['analyst', 'pm', 'admin', 'viewer', 'operator']

function readRoleOverride(): UserRole | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = new URLSearchParams(window.location.search).get('role')
    if (raw && (VALID_ROLES as readonly string[]).includes(raw)) {
      return raw as UserRole
    }
  } catch { /* ignore — bad URL is just no override */ }
  return null
}

export function useCurrentUserRole(): UserRole {
  const q = useAdapterQuery<OrgSettings | null>(
    async (a, s) => {
      try { return await a.getOrgSettings(s) }
      catch { return null }
    },
    [],
  )
  const override = readRoleOverride()
  if (override) return override
  return q.data?.currentUserRole ?? 'analyst'
}
