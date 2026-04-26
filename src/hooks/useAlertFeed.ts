import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { AlertEvent } from '../domain'
import {
  buildAlertsFeedViewModel, type AlertsFeedViewModel,
} from '../viewModels/alerts'

export function useAlertFeed(opts: {
  readonly groupBy?: AlertsFeedViewModel['groupBy']
  readonly sinceMs?: number
  readonly limit?: number
} = {}): QueryResult<AlertsFeedViewModel> {
  const groupBy = opts.groupBy ?? 'severity'
  const alerts = useAdapterQuery<readonly AlertEvent[]>(
    async (a, s) => {
      try {
        return await a.listAlerts(s, { sinceMs: opts.sinceMs, limit: opts.limit })
      } catch {
        return []
      }
    },
    [String(opts.sinceMs ?? ''), String(opts.limit ?? ''), groupBy],
  )
  if (alerts.loading) return { data: null, loading: true, error: null }
  if (alerts.error)   return { data: null, loading: false, error: alerts.error }
  const vm = buildAlertsFeedViewModel({ alerts: alerts.data ?? [], groupBy })
  return { data: vm, loading: false, error: null }
}
