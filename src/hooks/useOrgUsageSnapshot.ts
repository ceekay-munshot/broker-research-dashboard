// Hook: fetches the org-level usage snapshot via the canonical adapter.

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { OrgUsageSnapshot } from '../domain'

export function useOrgUsageSnapshot(opts?: { readonly windowDays?: number }): QueryResult<OrgUsageSnapshot | null> {
  return useAdapterQuery<OrgUsageSnapshot | null>(
    async (a, s) => {
      try { return await a.getOrgUsageSnapshot(s, opts) }
      catch { return null }
    },
    [String(opts?.windowDays ?? '')],
  )
}
