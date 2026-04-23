import type {
  Broker, ResearchReport, ReportSummary, Sector, SectorKnowledgeItem,
  SectorId, Stance,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import {
  buildFeedItem, indexBy, type FeedItemViewModel,
} from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint, resolveSince } from '../app/filters'

export interface SectorTileViewModel {
  readonly sectorId: SectorId
  readonly name: string
  readonly reportCount: number
  readonly aggregateStance: Stance
  readonly sentimentScore: number  // −1..+1
  readonly topThemes: readonly { readonly theme: string; readonly mentions: number; readonly stanceLean: Stance }[]
  readonly recentReports: readonly FeedItemViewModel[]
}

export interface SectorFeedViewModel {
  readonly tiles: readonly SectorTileViewModel[]
}

interface Inputs {
  readonly sectors: readonly Sector[]
  readonly knowledge: readonly SectorKnowledgeItem[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly brokers: readonly Broker[]
  readonly filters: FiltersState
}

function stanceToScore(s: Stance): number {
  return s === 'bullish' ? 1 : s === 'bearish' ? -1 : 0
}

export function buildSectorFeedViewModel(inputs: Inputs): SectorFeedViewModel {
  const knowledgeBySector = indexBy(inputs.knowledge, (k) => k.sectorId as string)
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const sectorFilter = new Set<string>(inputs.filters.sectorIds as readonly string[])

  const sectors = inputs.sectors.filter((s) => sectorFilter.size === 0 || sectorFilter.has(s.id as string))

  const tiles = sectors.map<SectorTileViewModel>((sector) => {
    const knowledge = knowledgeBySector.get(sector.id as string)
    const tickerSet = new Set(sector.tickers as readonly string[])

    const sectorReports = inputs.reports
      .filter((r) => r.sectorIds.some((id) => id === sector.id) || r.tickers.some((t) => tickerSet.has(t as string)))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    const recentReports = sectorReports.slice(0, 4).map((r) => buildFeedItem(
      r,
      summaryByReport.get(r.id as string) ?? null,
      brokerById.get(r.brokerId as string) ?? null,
    ))

    const stanceValues = sectorReports
      .map((r) => summaryByReport.get(r.id as string))
      .filter((s): s is ReportSummary => s !== undefined)
      .map((s) => stanceToScore(s.stance))
    const sentimentScore = stanceValues.length
      ? stanceValues.reduce((a, b) => a + b, 0) / stanceValues.length
      : 0

    return {
      sectorId: sector.id,
      name: sector.name,
      reportCount: knowledge?.reportCount ?? sectorReports.length,
      aggregateStance: knowledge?.aggregateStance ?? 'neutral',
      sentimentScore,
      topThemes: knowledge?.topThemes ?? [],
      recentReports,
    }
  })

  return { tiles }
}

export function useSectorFeedViewModel(filters: FiltersState): QueryResult<SectorFeedViewModel> {
  const since = resolveSince(filters.dateRange)
  const fp = filtersFingerprint(filters)

  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const reportsPage = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { since, limit: 200 }),
    [fp],
  )

  const visibleSectors = sectors.data ?? []
  const knowledgeQuery = useAdapterQuery(async (a, s) => {
    const results = await Promise.all(visibleSectors.map((sec) => a.getSectorKnowledge(s, sec.id)))
    return results.filter((r): r is NonNullable<typeof r> => r !== null)
  }, [visibleSectors.map((v) => v.id).join(',')])

  const needsSummaries = reportsPage.data?.items.map((r) => r.id) ?? []
  const summariesQuery = useAdapterQuery(async (a, s) => {
    return Promise.all(needsSummaries.map((id) => a.getReportSummary(s, id)))
      .then((rs) => rs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [needsSummaries.join(',')])

  const loading = sectors.loading || brokers.loading || reportsPage.loading || knowledgeQuery.loading || summariesQuery.loading
  const error = sectors.error ?? brokers.error ?? reportsPage.error ?? knowledgeQuery.error ?? summariesQuery.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!sectors.data || !brokers.data || !reportsPage.data || !knowledgeQuery.data || !summariesQuery.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildSectorFeedViewModel({
    sectors: sectors.data,
    knowledge: knowledgeQuery.data,
    reports: reportsPage.data.items,
    summaries: summariesQuery.data,
    brokers: brokers.data,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
