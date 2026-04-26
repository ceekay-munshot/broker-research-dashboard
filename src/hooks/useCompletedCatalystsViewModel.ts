import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CatalystEvent, PostEventReview } from '../domain'
import {
  buildCompletedEventsViewModel, type CompletedEventsViewModel,
} from '../viewModels/postEventReview'

export function useCompletedCatalystsViewModel(): QueryResult<CompletedEventsViewModel> {
  const catalysts = useAdapterQuery<readonly CatalystEvent[]>(
    async (a, s) => {
      try { return await a.listCatalysts(s) }
      catch { return [] }
    },
    [],
  )
  const reviews = useAdapterQuery<readonly PostEventReview[]>(
    async (a, s) => {
      try { return await a.listPostEventReviews(s) }
      catch { return [] }
    },
    [],
  )
  if (catalysts.loading || reviews.loading) return { data: null, loading: true, error: null }
  if (catalysts.error) return { data: null, loading: false, error: catalysts.error }
  if (reviews.error) return { data: null, loading: false, error: reviews.error }
  const vm = buildCompletedEventsViewModel({
    catalysts: catalysts.data ?? [],
    reviews: reviews.data ?? [],
  })
  return { data: vm, loading: false, error: null }
}
