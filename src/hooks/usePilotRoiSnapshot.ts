// Hook: fetches the pilot ROI snapshot via the canonical adapter.

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { PilotRoiSnapshot } from '../domain'

export function usePilotRoiSnapshot(opts?: { readonly windowDays?: number }): QueryResult<PilotRoiSnapshot | null> {
  return useAdapterQuery<PilotRoiSnapshot | null>(
    async (a, s) => {
      try { return await a.getPilotRoiSnapshot(s, opts) }
      catch { return null }
    },
    [String(opts?.windowDays ?? '')],
  )
}
