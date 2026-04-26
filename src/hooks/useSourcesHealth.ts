// Hook: fetches the org-level source-integration health snapshot via
// the canonical adapter. Tolerated as missing — older adapter builds
// (or upstream-fixture) return null, in which case the chip and tab
// degrade to "unknown".

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { SourcesHealthSnapshot } from '../domain'

export function useSourcesHealth(): QueryResult<SourcesHealthSnapshot | null> {
  return useAdapterQuery<SourcesHealthSnapshot | null>(
    async (a, s) => {
      try { return await a.getSourcesHealth(s) }
      catch { return null }
    },
    [],
  )
}
