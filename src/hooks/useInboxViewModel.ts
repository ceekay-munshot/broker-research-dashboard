// Hook: fetches the recent delivery attempts and runs the inbox builder.

import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { DeliveryAttempt } from '../domain'
import {
  buildInboxViewModel, type InboxViewModel,
} from '../viewModels/inbox'

export function useInboxViewModel(): QueryResult<InboxViewModel> {
  const q = useAdapterQuery<readonly DeliveryAttempt[]>(
    async (a, s) => {
      try { return await a.listDeliveries(s, { limit: 50 }) }
      catch { return [] }
    },
    [],
  )
  if (q.loading) return { data: null, loading: true, error: null }
  if (q.error)   return { data: null, loading: false, error: q.error }
  const vm = buildInboxViewModel(q.data ?? [])
  return { data: vm, loading: false, error: null }
}
