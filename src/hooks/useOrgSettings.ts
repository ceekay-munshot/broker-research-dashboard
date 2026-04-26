// Hook: fetches the org control-plane settings via the canonical adapter.

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { OrgSettings } from '../domain'

export function useOrgSettings(): QueryResult<OrgSettings | null> {
  return useAdapterQuery<OrgSettings | null>(
    async (a, s) => {
      try { return await a.getOrgSettings(s) }
      catch { return null }
    },
    [],
  )
}
