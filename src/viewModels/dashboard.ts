import type {
  Broker, KpiSnapshot, ResearchReport, ReportSummary, IngestionStatus,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { buildFeedItem, indexBy, type FeedItemViewModel } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint, resolveSince } from '../app/filters'

export interface KpiCardViewModel {
  readonly key: 'brokersTracked' | 'reportsIngested' | 'stocksCovered' | 'divergenceFlags'
  readonly label: string
  readonly value: number
  readonly deltaValue: number
  readonly deltaWindowDays: number
  readonly trend: 'up' | 'down' | 'flat' | 'mix'
  readonly hint: string
}

export interface IngestionSummaryViewModel {
  readonly queued: number
  readonly processing: number
  readonly readyLast24h: number
  readonly failedLast24h: number
  readonly throughputPerHour: number
}

export interface DashboardViewModel {
  readonly asOf: string
  readonly kpis: readonly KpiCardViewModel[]
  readonly rollingFeed: readonly FeedItemViewModel[]
  readonly ingestion: IngestionSummaryViewModel
}

interface Inputs {
  readonly kpi: KpiSnapshot
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly brokers: readonly Broker[]
  readonly ingestion: IngestionStatus
}

const KPI_CARDS: readonly { key: KpiCardViewModel['key']; label: string; hint: string; trend: KpiCardViewModel['trend'] }[] = [
  { key: 'brokersTracked',  label: 'Brokers tracked',  hint: 'Sell-side + independent research',           trend: 'up'  },
  { key: 'reportsIngested', label: 'Reports ingested', hint: 'From monitored inboxes & terminals',         trend: 'up'  },
  { key: 'stocksCovered',   label: 'Stocks covered',   hint: 'Unique tickers with ≥1 active rating',       trend: 'mix' },
  { key: 'divergenceFlags', label: 'Divergence flags', hint: 'Spread ≥ 25% between Street highs/lows',     trend: 'up'  },
]

export function buildDashboardViewModel(inputs: Inputs): DashboardViewModel {
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)

  const rollingFeed = [...inputs.reports]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 10)
    .map((r) => buildFeedItem(
      r,
      summaryByReport.get(r.id as string) ?? null,
      brokerById.get(r.brokerId as string) ?? null,
    ))

  const kpis = KPI_CARDS.map<KpiCardViewModel>((card) => ({
    key: card.key,
    label: card.label,
    hint: card.hint,
    trend: card.trend,
    value: inputs.kpi[card.key],
    deltaValue: inputs.kpi.windowDeltas[card.key].value,
    deltaWindowDays: inputs.kpi.windowDeltas[card.key].windowDays,
  }))

  return {
    asOf: inputs.kpi.asOf,
    kpis,
    rollingFeed,
    ingestion: {
      queued: inputs.ingestion.queued,
      processing: inputs.ingestion.processing,
      readyLast24h: inputs.ingestion.readyLast24h,
      failedLast24h: inputs.ingestion.failedLast24h,
      throughputPerHour: inputs.ingestion.throughputPerHour,
    },
  }
}

export function useDashboardViewModel(filters: FiltersState): QueryResult<DashboardViewModel> {
  const since = resolveSince(filters.dateRange)
  const fp = filtersFingerprint(filters)

  const kpi = useAdapterQuery((a, s) => a.getKpiSnapshot(s), [])
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const ingestion = useAdapterQuery((a, s) => a.getIngestionStatus(s), [])
  const reportsPage = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { since, limit: 40 }),
    [fp],
  )

  const loading = kpi.loading || brokers.loading || ingestion.loading || reportsPage.loading
  const error = kpi.error ?? brokers.error ?? ingestion.error ?? reportsPage.error

  // Summaries are fetched one-shot per visible report. For phase-1 volumes
  // (≤ ~40 reports in view) this is cheap; the real adapter will return them
  // inlined and this loop collapses to a single call.
  const reportsData = reportsPage.data?.items ?? []
  const needsSummaries = reportsData.map((r) => r.id)
  const summariesQuery = useAdapterQuery(async (a, s) => {
    return Promise.all(needsSummaries.map((id) => a.getReportSummary(s, id)))
      .then((results) => results.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [needsSummaries.join(',')])

  if (loading || summariesQuery.loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (summariesQuery.error) return { data: null, loading: false, error: summariesQuery.error }
  if (!kpi.data || !brokers.data || !ingestion.data || !reportsPage.data || !summariesQuery.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildDashboardViewModel({
    kpi: kpi.data,
    reports: reportsPage.data.items,
    summaries: summariesQuery.data,
    brokers: brokers.data,
    ingestion: ingestion.data,
  })
  return { data: vm, loading: false, error: null }
}
