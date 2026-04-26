// Tiny hook that returns the current user's effective role.
//
// Reads from `getOrgSettings` (which carries `currentUserRole` server-side).
// Defaults to 'analyst' when settings haven't loaded yet — that's the
// safest default since analyst surfaces are always visible.

import { useAdapterQuery } from './useAdapterQuery'
import type { OrgSettings, UserRole } from '../domain'

export function useCurrentUserRole(): UserRole {
  const q = useAdapterQuery<OrgSettings | null>(
    async (a, s) => {
      try { return await a.getOrgSettings(s) }
      catch { return null }
    },
    [],
  )
  return q.data?.currentUserRole ?? 'analyst'
}
