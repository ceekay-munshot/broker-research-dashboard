// Hook: fetches the org-level session safety snapshot.

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { SessionSafetySnapshot } from '../domain'

export function useSessionSafety(): QueryResult<SessionSafetySnapshot | null> {
  return useAdapterQuery<SessionSafetySnapshot | null>(
    async (a, s) => {
      try { return await a.getSessionSafety(s) }
      catch { return null }
    },
    [],
  )
}
