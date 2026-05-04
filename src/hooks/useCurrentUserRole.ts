// Tiny hook that returns the current user's effective role.
//
// Reads from `getOrgSettings` (which carries `currentUserRole` server-side).
// Defaults to 'admin' when settings haven't loaded yet — the dashboard
// shell renders the full tab strip while awaiting real server output.
// Once the backend sends real OrgSettings, the real role is honored.

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
  return q.data?.currentUserRole ?? 'admin'
}
