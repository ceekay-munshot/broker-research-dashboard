import type {
  Broker, ResearchReport, ReportSummary, Sector,
  SectorId, Stance, StockTicker, BrokerId,
} from '../domain'
import type {
  SectorIntelligence, SectorSignal, SectorSignalClassification, ResultantState,
  StrengthBand,
} from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import {
  buildFeedItem, indexBy, type FeedItemViewModel,
} from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint, resolveSince } from '../app/filters'

export interface SectorSignalVM {
  readonly theme: string
  readonly classification: SectorSignalClassification
  readonly classificationLabel: string
  readonly tickers: readonly StockTicker[]
  readonly brokerNames: readonly string[]
  readonly stanceLean: Stance
  readonly mentionCount: number
  readonly firstSeen: string
  readonly lastSeen: string
  readonly citationCount: number
}

export interface SectorResultantEntryVM {
  readonly ticker: StockTicker
  readonly state: ResultantState
  readonly strength: StrengthBand
}

export interface SectorTileViewModel {
  readonly sectorId: SectorId
  readonly name: string
  readonly reportCount: number
  readonly tickerCount: number
  readonly brokerCount: number
  readonly aggregateStance: Stance
  readonly sentimentScore: number
  readonly signals: readonly SectorSignalVM[]
  readonly resultantStates: readonly SectorResultantEntryVM[]
  readonly recentReports: readonly FeedItemViewModel[]
  readonly periodStart: string
  readonly periodEnd: string
}

export interface SectorFeedViewModel {
  readonly tiles: readonly SectorTileViewModel[]
}

interface Inputs {
  readonly sectors: readonly Sector[]
  readonly intelligence: readonly SectorIntelligence[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly brokers: readonly Broker[]
  readonly filters: FiltersState
}

const CLASSIFICATION_LABELS: Readonly<Record<SectorSignalClassification, string>> = {
  repeated_sector:   'Repeated · multiple names',
  unresolved_debate: 'Unresolved · bulls vs bears',
  broker_specific:   'Single broker',
  single_name:       'Single name',
}

export function buildSectorFeedViewModel(inputs: Inputs): SectorFeedViewModel {
  const intelligenceBySector = indexBy(inputs.intelligence, (i) => i.sectorId as string)
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const sectorFilter = new Set<string>(inputs.filters.sectorIds as readonly string[])
  const name = (id: BrokerId) => brokerById.get(id as unknown as string)?.shortName ?? (id as unknown as string).toUpperCase()

  const sectors = inputs.sectors.filter((s) => sectorFilter.size === 0 || sectorFilter.has(s.id as string))

  const tiles = sectors.map<SectorTileViewModel>((sector) => {
    const si = intelligenceBySector.get(sector.id as string)
    const tickerSet = new Set(sector.tickers as readonly string[])

    const sectorReports = inputs.reports
      .filter((r) => r.sectorIds.some((id) => id === sector.id) || r.tickers.some((t) => tickerSet.has(t as string)))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    const recentReports = sectorReports.slice(0, 4).map((r) => buildFeedItem(
      r,
      summaryByReport.get(r.id as string) ?? null,
      brokerById.get(r.brokerId as string) ?? null,
    ))

    const signals: SectorSignalVM[] = (si?.signals ?? []).slice(0, 6).map((s: SectorSignal) => ({
      theme: s.theme,
      classification: s.classification,
      classificationLabel: CLASSIFICATION_LABELS[s.classification],
      tickers: s.tickers,
      brokerNames: s.brokerIds.map((b) => name(b)),
      stanceLean: s.stanceLean,
      mentionCount: s.mentionCount,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      citationCount: s.evidenceIds.length,
    }))

    return {
      sectorId: sector.id,
      name: sector.name,
      reportCount: si?.reportCount ?? sectorReports.length,
      tickerCount: si?.tickerCount ?? 0,
      brokerCount: si?.brokerCount ?? 0,
      aggregateStance: si?.aggregateStance ?? 'neutral',
      sentimentScore: si?.aggregateStanceScore ?? 0,
      signals,
      resultantStates: (si?.resultantStates ?? []).map((r) => ({
        ticker: r.ticker,
        state: r.state,
        strength: r.strength,
      })),
      recentReports,
      periodStart: si?.periodStart ?? '',
      periodEnd: si?.periodEnd ?? '',
    }
  })

  return { tiles }
}

export function useSectorFeedViewModel(filters: FiltersState): QueryResult<SectorFeedViewModel> {
  const since = resolveSince(filters.dateRange)
  const fp = filtersFingerprint(filters)

  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const intelligence = useAdapterQuery((a, s) => a.listSectorIntelligence(s), [])
  const reportsPage = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { since, limit: 200 }),
    [fp],
  )

  const needsSummaries = reportsPage.data?.items.map((r) => r.id) ?? []
  const summariesQuery = useAdapterQuery(async (a, s) => {
    return Promise.all(needsSummaries.map((id) => a.getReportSummary(s, id)))
      .then((rs) => rs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [needsSummaries.join(',')])

  const loading = sectors.loading || brokers.loading || intelligence.loading
    || reportsPage.loading || summariesQuery.loading
  const error = sectors.error ?? brokers.error ?? intelligence.error
    ?? reportsPage.error ?? summariesQuery.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!sectors.data || !brokers.data || !intelligence.data || !reportsPage.data || !summariesQuery.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildSectorFeedViewModel({
    sectors: sectors.data,
    intelligence: intelligence.data,
    reports: reportsPage.data.items,
    summaries: summariesQuery.data,
    brokers: brokers.data,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
