import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type {
  CatalystId, PreEventBrief, CatalystEvent,
  CalibrationSnapshot, PostEventReview,
} from '../domain'
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

  // Module 23 — adaptive ranking inputs. Tolerated as missing.
  const reportsQ = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { limit: 200 }),
    [],
  )
  const brokersQ = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const calibrationQ = useAdapterQuery<CalibrationSnapshot | null>(
    async (a, s) => { try { return await a.getCalibrationSnapshot(s) } catch { return null } },
    [],
  )
  const postEventReviewsQ = useAdapterQuery<readonly PostEventReview[]>(
    async (a, s) => { try { return await a.listPostEventReviews(s) } catch { return [] } },
    [],
  )
  const catalystQ = useAdapterQuery<CatalystEvent | null>(
    async (a, s) => {
      if (!catalystId) return null
      try {
        const all = await a.listCatalysts(s)
        return all.find((c) => c.id === catalystId) ?? null
      } catch { return null }
    },
    [catalystId as unknown as string ?? ''],
  )

  if (brief.loading) return { data: null, loading: true, error: null }
  if (brief.error)   return { data: null, loading: false, error: brief.error }
  return {
    data: buildPreEventBriefViewModel(brief.data ?? null, {
      reports: reportsQ.data?.items ?? [],
      brokers: brokersQ.data ?? [],
      catalyst: catalystQ.data ?? null,
      calibration: calibrationQ.data ?? null,
      postEventReviews: postEventReviewsQ.data ?? null,
    }),
    loading: false,
    error: null,
  }
}
