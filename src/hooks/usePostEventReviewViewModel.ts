import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CatalystId, PostEventReview } from '../domain'
import {
  buildPostEventReviewViewModel, type PostEventReviewViewModel,
} from '../viewModels/postEventReview'

export function usePostEventReviewViewModel(catalystId: CatalystId | null): QueryResult<PostEventReviewViewModel> {
  const review = useAdapterQuery<PostEventReview | null>(
    async (a, s) => {
      if (!catalystId) return null
      try { return await a.getLatestPostEventReview(s, catalystId) }
      catch { return null }
    },
    [catalystId as unknown as string ?? ''],
  )
  if (review.loading) return { data: null, loading: true, error: null }
  if (review.error)   return { data: null, loading: false, error: review.error }
  return { data: buildPostEventReviewViewModel(review.data ?? null), loading: false, error: null }
}
