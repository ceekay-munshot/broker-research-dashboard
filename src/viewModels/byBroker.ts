import type {
  Broker, ResearchReport, ReportSummary, Stance,
  BrokerId,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import {
  buildFeedItem, indexBy, type FeedItemViewModel,
} from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint, resolveSince } from '../app/filters'

export interface BrokerCardViewModel {
  readonly brokerId: BrokerId
  readonly name: string
  readonly shortName: string
  readonly color: string | null
  readonly reportCount: number
  readonly stanceCounts: Readonly<Record<Stance, number>>
  readonly topThemes: readonly { readonly theme: string; readonly count: number }[]
  readonly latestReports: readonly FeedItemViewModel[]
}

export interface ByBrokerViewModel {
  readonly brokers: readonly BrokerCardViewModel[]
}

interface Inputs {
  readonly brokers: readonly Broker[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly filters: FiltersState
}

export function buildByBrokerViewModel(inputs: Inputs): ByBrokerViewModel {
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const brokerFilter = new Set<string>(inputs.filters.brokerIds as readonly string[])
  const brokers = inputs.brokers.filter((b) => brokerFilter.size === 0 || brokerFilter.has(b.id as string))

  const cards = brokers.map<BrokerCardViewModel>((broker) => {
    const theirs = inputs.reports
      .filter((r) => r.brokerId === broker.id)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    const stanceCounts: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 }
    const themeTally = new Map<string, number>()

    for (const r of theirs) {
      const sum = summaryByReport.get(r.id as string)
      if (!sum) continue
      stanceCounts[sum.stance] += 1
      for (const theme of sum.themes) {
        themeTally.set(theme, (themeTally.get(theme) ?? 0) + 1)
      }
    }

    const topThemes = Array.from(themeTally.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)

    const latestReports = theirs.slice(0, 3).map((r) => buildFeedItem(
      r, summaryByReport.get(r.id as string) ?? null, broker,
    ))

    return {
      brokerId: broker.id,
      name: broker.name,
      shortName: broker.shortName,
      color: broker.brandColor,
      reportCount: theirs.length,
      stanceCounts,
      topThemes,
      latestReports,
    }
  })

  return { brokers: cards }
}

export function useByBrokerViewModel(filters: FiltersState): QueryResult<ByBrokerViewModel> {
  const since = resolveSince(filters.dateRange)
  const fp = filtersFingerprint(filters)

  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const reportsPage = useAdapterQuery(
    (a, s) => a.listResearchReports(s, {
      since,
      brokerIds: filters.brokerIds.length ? filters.brokerIds : undefined,
      tickers: filters.tickers.length ? filters.tickers : undefined,
      sectorIds: filters.sectorIds.length ? filters.sectorIds : undefined,
      limit: 200,
    }),
    [fp],
  )

  const needsSummaries = reportsPage.data?.items.map((r) => r.id) ?? []
  const summariesQuery = useAdapterQuery(async (a, s) => {
    return Promise.all(needsSummaries.map((id) => a.getReportSummary(s, id)))
      .then((rs) => rs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [needsSummaries.join(',')])

  const loading = brokers.loading || reportsPage.loading || summariesQuery.loading
  const error = brokers.error ?? reportsPage.error ?? summariesQuery.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!brokers.data || !reportsPage.data || !summariesQuery.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildByBrokerViewModel({
    brokers: brokers.data,
    reports: reportsPage.data.items,
    summaries: summariesQuery.data,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
