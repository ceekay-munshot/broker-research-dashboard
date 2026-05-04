// Hook that fetches everything My Book needs and runs the pure builder.
// Mirrors `useDailyWorklogViewModel` in shape: required reads gate the
// view; optional reads degrade with notes in `vm.degradations`.

import type {
  BrokerStockOpinion, ReportSummary, PortfolioSnapshot,
  CalibrationSnapshot, PostEventReview,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import { buildMyBookViewModel, type MyBookViewModel } from '../viewModels/portfolio'

export function useMyBookViewModel(): QueryResult<MyBookViewModel> {
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const stocks  = useAdapterQuery((a, s) => a.listStocks(s),  [])
  const reports = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { limit: 200 }),
    [],
  )

  const snapshot = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => {
      try { return await a.getPortfolioSnapshot(s) }
      catch { return null }
    },
    [],
  )

  const summariesQ = useAdapterQuery(
    async (a, s) => {
      const items = reports.data?.items ?? []
      const results = await Promise.allSettled(items.map((r) => a.getReportSummary(s, r.id)))
      return results.flatMap<ReportSummary>(
        (r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [],
      )
    },
    [reports.data?.items.map((r) => r.id as string).join(',') ?? ''],
  )

  const opinionsQ = useAdapterQuery<readonly BrokerStockOpinion[]>(
    async (a, s) => {
      try { return await a.listBrokerStockOpinions(s) }
      catch { return [] }
    },
    [],
  )

  const closuresQ = useAdapterQuery<readonly ConflictClosure[]>(
    async (a, s) => {
      try { return await a.listConflictClosures(s) }
      catch { return [] }
    },
    [],
  )

  // Module 23 — calibration + post-event reviews drive adaptive ranking.
  // Both are tolerated as missing.
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
  const requiredLoading = brokers.loading || sectors.loading || stocks.loading || reports.loading || snapshot.loading
  const requiredError = brokers.error ?? sectors.error ?? stocks.error ?? reports.error
  if (requiredLoading) return { data: null, loading: true, error: null }
  if (requiredError)   return { data: null, loading: false, error: requiredError }

  const summariesArr = summariesQ.data ?? []
  const opinionsArr  = opinionsQ.data ?? []
  const closuresArr  = closuresQ.data ?? []

  const degradations: string[] = []
  if (snapshot.data === null) degradations.push('No portfolio data yet — awaiting server output.')
  if (summariesArr.length === 0) degradations.push('No report summaries — relevance reasoning falls back to report-level signals only.')
  if (opinionsArr.length === 0)  degradations.push('No broker opinions — coverage breadth and outlier detection are unavailable.')
  if (closuresArr.length === 0)  degradations.push('No conflict closures — divergence flags inferred from opinions only.')

  const { vm } = buildMyBookViewModel({
    snapshot: snapshot.data ?? null,
    reports: reports.data?.items ?? [],
    summaries: summariesArr,
    opinions: opinionsArr,
    closures: closuresArr,
    brokers: brokers.data ?? [],
    stocks: stocks.data ?? [],
    degradations,
    calibration: calibrationQ.data ?? null,
    postEventReviews: postEventReviewsQ.data ?? null,
  })

  return { data: vm, loading: false, error: null }
}
