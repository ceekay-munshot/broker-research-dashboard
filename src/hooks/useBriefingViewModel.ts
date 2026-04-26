import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type {
  AlertEvent, AlertDigest, DigestKind,
  CalibrationSnapshot, PostEventReview,
} from '../domain'
import {
  buildBriefingViewModel, type BriefingViewModel,
} from '../viewModels/alerts'

export function useBriefingViewModel(kind: DigestKind = 'morning_brief'): QueryResult<BriefingViewModel> {
  const digest = useAdapterQuery<AlertDigest | null>(
    async (a, s) => {
      try { return await a.getLatestAlertDigest(s, kind) }
      catch { return null }
    },
    [kind],
  )
  const alerts = useAdapterQuery<readonly AlertEvent[]>(
    async (a, s) => {
      try { return await a.listAlerts(s, { limit: 200 }) }
      catch { return [] }
    },
    [],
  )
  // Module 23 — calibration + post-event reviews. Tolerated as missing.
  const calibrationQ = useAdapterQuery<CalibrationSnapshot | null>(
    async (a, s) => {
      try { return await a.getCalibrationSnapshot(s) }
      catch { return null }
    },
    [],
  )
  const postEventReviewsQ = useAdapterQuery<readonly PostEventReview[]>(
    async (a, s) => {
      try { return await a.listPostEventReviews(s) }
      catch { return [] }
    },
    [],
  )

  if (digest.loading || alerts.loading) return { data: null, loading: true, error: null }

  const degradations: string[] = []
  if (!digest.data) degradations.push('No briefing has been generated yet for this org. Run `npm run ops -- alerts:morning` to seed one.')
  if ((alerts.data ?? []).length === 0) degradations.push('No alerts in the feed.')

  const vm = buildBriefingViewModel({
    digest: digest.data ?? null,
    alerts: alerts.data ?? [],
    degradations,
    calibration: calibrationQ.data ?? null,
    postEventReviews: postEventReviewsQ.data ?? null,
  })
  return { data: vm, loading: false, error: null }
}
