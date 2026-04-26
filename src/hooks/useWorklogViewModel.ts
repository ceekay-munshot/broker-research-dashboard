import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import {
  buildDailyWorklogViewModel,
  type DailyWorklogViewModel,
  type WorklogFiltersState,
} from '../viewModels/worklog'
import type {
  ReportSummary, EvidenceSnippet, BrokerStockOpinion,
  ResearchReport, BrokerEmail, PortfolioSnapshot,
  CalibrationSnapshot, PostEventReview, SourcesHealthSnapshot,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import { buildPortfolioOverlay, EMPTY_PORTFOLIO_OVERLAY } from '../viewModels/portfolio'
import { stalenessDegradationsForKinds } from '../viewModels/sources'

/** Stable primitive dep fingerprint for worklog filters. */
function worklogFiltersFingerprint(f: WorklogFiltersState): string {
  return [
    f.dateWindow, f.grouping,
    [...f.brokerIds].sort().join(','),
    [...f.tickers].sort().join(','),
    [...f.sectorIds].sort().join(','),
    [...f.reportTypes].sort().join(','),
    [...f.stances].sort().join(','),
    [...f.ratings].sort().join(','),
    [...f.priorityBuckets].sort().join(','),
    [...f.origins].sort().join(','),
    String(f.hasTargetChange), String(f.hasDivergence), String(f.hasEvidence),
    f.bookFilter, String(f.bookFirst),
  ].join('|')
}

/**
 * Fetches exactly what the worklog needs through the canonical adapter
 * interface and runs the pure view-model builder. Missing optional data
 * (evidence, opinions, closures, broker-emails) degrades gracefully:
 * corresponding priority rules silently don't fire, divergence falls back
 * to the opinion-based heuristic, and the view records what's missing in
 * `vm.degradations` for surfacing in the UI.
 */
export function useDailyWorklogViewModel(filters: WorklogFiltersState): QueryResult<DailyWorklogViewModel> {
  const fp = worklogFiltersFingerprint(filters)

  // Required for the tab to render at all.
  const brokers  = useAdapterQuery((a, s) => a.listBrokers(s),  [])
  const sectors  = useAdapterQuery((a, s) => a.listSectors(s),  [])
  const stocks   = useAdapterQuery((a, s) => a.listStocks(s),   [])
  const reports  = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { limit: 200 }),
    [fp],
  )

  // Optional enrichments: tolerate errors so a missing upstream endpoint
  // doesn't kill the whole tab.
  const evidenceCollect = useAdapterQuery(
    async (a, s) => {
      const items = reports.data?.items ?? []
      const results = await Promise.allSettled(items.map((r) => a.listEvidenceSnippets(s, r.id)))
      return results.flatMap<EvidenceSnippet>((r) => r.status === 'fulfilled' ? [...r.value] : [])
    },
    [reports.data?.items.map((r) => r.id as string).join(',') ?? ''],
  )
  const summariesCollect = useAdapterQuery(
    async (a, s) => {
      const items = reports.data?.items ?? []
      const results = await Promise.allSettled(items.map((r) => a.getReportSummary(s, r.id)))
      return results
        .flatMap<ReportSummary>((r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [])
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
  const brokerEmailsQ = useAdapterQuery<readonly BrokerEmail[]>(
    async (a, s) => {
      try { const page = await a.listBrokerEmails(s, { limit: 200 }); return page.items }
      catch { return [] }
    },
    [],
  )

  const portfolioQ = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => {
      try { return await a.getPortfolioSnapshot(s) }
      catch { return null }
    },
    [],
  )

  // Module 23 — calibration + post-event reviews drive the adaptive
  // ranking annotation. Both are tolerated as missing.
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
  // Module 24 — sources health, used for degraded-mode banners.
  const sourcesQ = useAdapterQuery<SourcesHealthSnapshot | null>(
    async (a, s) => { try { return await a.getSourcesHealth(s) } catch { return null } },
    [],
  )

  const requiredLoading = brokers.loading || sectors.loading || stocks.loading || reports.loading
  const requiredError   = brokers.error ?? sectors.error ?? stocks.error ?? reports.error

  // Optional queries: we only block on them on first load (before data is
  // ever resolved). Refetches under the same keys don't re-gate the view.
  const optionalFirstLoad =
    (evidenceCollect.loading && !evidenceCollect.data)
    || (summariesCollect.loading && !summariesCollect.data)
    || (opinionsQ.loading && !opinionsQ.data)
    || (closuresQ.loading && !closuresQ.data)
    || (brokerEmailsQ.loading && !brokerEmailsQ.data)
    || (portfolioQ.loading && !portfolioQ.data)

  if (requiredLoading || optionalFirstLoad) return { data: null, loading: true, error: null }
  if (requiredError) return { data: null, loading: false, error: requiredError }
  if (!brokers.data || !sectors.data || !stocks.data || !reports.data) {
    return { data: null, loading: true, error: null }
  }

  const reportsArr: readonly ResearchReport[] = reports.data.items
  const summariesArr = summariesCollect.data ?? []
  const evidenceArr  = evidenceCollect.data ?? []
  const opinionsArr  = opinionsQ.data ?? []
  const closuresArr  = closuresQ.data ?? []
  const emailsArr    = brokerEmailsQ.data ?? []
  const snapshot     = portfolioQ.data ?? null

  const degradations: string[] = []
  if (summariesArr.length === 0)  degradations.push('No report summaries available — showing skeleton content only.')
  if (evidenceArr.length === 0)   degradations.push('No evidence snippets — priority scoring falls back without evidence signal.')
  if (closuresArr.length === 0)   degradations.push('No conflict closures — divergence inferred from opinions where possible.')
  if (opinionsArr.length === 0)   degradations.push('No broker opinions — multi-broker convergence and divergence signals unavailable.')
  if (emailsArr.length === 0)     degradations.push('No broker emails — parent-email lineage hidden.')
  if (snapshot === null)          degradations.push('No portfolio configured — book overlay disabled. See My Book tab.')
  // Module 24 — prepend stale/failing source notes so they're visible first.
  for (const note of stalenessDegradationsForKinds(sourcesQ.data ?? null, ['raw_upstream', 'portfolio'])) {
    degradations.unshift(note)
  }

  const overlay = snapshot
    ? buildPortfolioOverlay({
        snapshot,
        reports: reportsArr,
        summaries: summariesArr,
        opinions: opinionsArr,
        closures: closuresArr,
        stocks: stocks.data,
      })
    : EMPTY_PORTFOLIO_OVERLAY

  const vm = buildDailyWorklogViewModel({
    reports: reportsArr,
    summaries: summariesArr,
    evidence: evidenceArr,
    opinions: opinionsArr,
    closures: closuresArr,
    brokerEmails: emailsArr,
    brokers: brokers.data,
    sectors: sectors.data,
    stocks: stocks.data,
    filters,
    degradations,
    portfolio: overlay,
    calibration: calibrationQ.data ?? null,
    postEventReviews: postEventReviewsQ.data ?? null,
  })
  return { data: vm, loading: false, error: null }
}
