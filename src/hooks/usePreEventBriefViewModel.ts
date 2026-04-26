import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CatalystId, PreEventBrief } from '../domain'
import {
  buildPreEventBriefViewModel, type PreEventBriefViewModel,
} from '../viewModels/catalysts'

export function usePreEventBriefViewModel(catalystId: CatalystId | null): QueryResult<PreEventBriefViewModel> {
  const brief = useAdapterQuery<PreEventBrief | null>(
    async (a, s) => {
      if (!catalystId) return null
      try { return await a.getLatestPreEventBrief(s, catalystId) }
      catch { return null }
    },
    [catalystId as unknown as string ?? ''],
  )
  if (brief.loading) return { data: null, loading: true, error: null }
  if (brief.error)   return { data: null, loading: false, error: brief.error }
  return { data: buildPreEventBriefViewModel(brief.data ?? null), loading: false, error: null }
}
