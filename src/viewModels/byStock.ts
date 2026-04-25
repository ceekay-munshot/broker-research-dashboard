import type {
  Broker, BrokerStockOpinion, Stock,
  BrokerId, StockTicker, Rating, Stance, ReportId,
  PortfolioMembership, PortfolioDirection, PortfolioConviction,
  PortfolioCoverageSummary, PortfolioSnapshot,
} from '../domain'
import type { ConflictClosure, ResultantState, StrengthBand } from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint } from '../app/filters'
import { buildPortfolioOverlay } from './portfolio'

export interface OpinionCell {
  readonly brokerId: BrokerId
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetDelta: number | null
  readonly targetCurrency: string | null
  readonly impliedUpsidePct: number | null
  readonly lastUpdatedAt: string
  readonly lastReportId: ReportId
  readonly outlier: boolean
}

export interface ByStockRowViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly currency: string
  readonly spotPrice: number | null
  readonly avgTarget: number | null
  readonly medianTarget: number | null
  readonly spreadPct: number | null
  readonly consensusUpsidePct: number | null
  readonly brokerCount: number
  readonly resultantState: ResultantState
  readonly resultantStrength: StrengthBand
  readonly outlierBrokerIds: readonly BrokerId[]
  readonly opinionsByBroker: Readonly<Record<BrokerId, OpinionCell | undefined>>
  /** Module 18 portfolio context. Null when no portfolio is configured. */
  readonly book: ByStockBookContext | null
}

export interface ByStockBookContext {
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  readonly daysSinceLastReport: number | null
  readonly distinctBrokersLast7d: number
  readonly riskFlags: readonly string[]
}

export interface ByStockViewModel {
  readonly rows: readonly ByStockRowViewModel[]
  readonly brokers: readonly Broker[]
}

interface Inputs {
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly sectorNameById: ReadonlyMap<string, string>
  readonly filters: FiltersState
  /** Per-ticker portfolio coverage. Empty map when no portfolio. */
  readonly coverageByTicker?: ReadonlyMap<string, PortfolioCoverageSummary>
}

export function buildByStockViewModel(inputs: Inputs): ByStockViewModel {
  const closureByTicker = indexBy(inputs.closures, (c) => c.ticker as string)
  const tickerFilter = new Set<string>(inputs.filters.tickers as readonly string[])
  const sectorFilter = new Set<string>(inputs.filters.sectorIds as readonly string[])

  // Only stocks that have at least one opinion in this org.
  const tickersWithCoverage = new Set(inputs.opinions.map((o) => o.ticker as string))
  const filtered = inputs.stocks
    .filter((s) => tickersWithCoverage.has(s.ticker as string))
    .filter((s) => tickerFilter.size === 0 || tickerFilter.has(s.ticker as string))
    .filter((s) => sectorFilter.size === 0 || sectorFilter.has(s.sectorId as string))

  const rows = filtered.map<ByStockRowViewModel>((stock) => {
    const tickerOpinions = inputs.opinions.filter((o) => o.ticker === stock.ticker)
    const closure = closureByTicker.get(stock.ticker as string)
    const outlierIds = new Set((closure?.outliers ?? []).map((o) => o.brokerId as string))

    const opinionsByBroker: Record<string, OpinionCell | undefined> = {}
    for (const o of tickerOpinions) {
      opinionsByBroker[o.brokerId as string] = {
        brokerId: o.brokerId,
        rating: o.rating,
        stance: o.stance,
        targetPrice: o.targetPrice,
        priorTargetPrice: o.priorTargetPrice,
        targetDelta: o.targetPrice !== null && o.priorTargetPrice !== null
          ? o.targetPrice - o.priorTargetPrice
          : null,
        targetCurrency: o.targetCurrency,
        impliedUpsidePct: o.impliedUpsidePct,
        lastUpdatedAt: o.lastUpdatedAt,
        lastReportId: o.lastReportId,
        outlier: outlierIds.has(o.brokerId as string),
      }
    }

    const avgTarget = closure?.targetStats.mean ?? null
    const medianTarget = closure?.targetStats.median ?? null
    const spreadPct = closure?.targetStats.spreadPct ?? null
    const consensusUpsidePct = avgTarget !== null && stock.lastPrice !== null
      ? ((avgTarget / stock.lastPrice) - 1) * 100
      : null

    const cov = inputs.coverageByTicker?.get(stock.ticker as string) ?? null
    const book: ByStockBookContext | null = cov
      ? {
          membership: cov.membership,
          direction: cov.direction,
          conviction: cov.conviction,
          weightPct: cov.weightPct,
          daysSinceLastReport: cov.activity.daysSinceLastReport,
          distinctBrokersLast7d: cov.activity.distinctBrokersLast7d,
          riskFlags: cov.riskFlags,
        }
      : null

    return {
      ticker: stock.ticker,
      stockName: stock.name,
      sectorName: inputs.sectorNameById.get(stock.sectorId as string) ?? '—',
      currency: stock.currency,
      spotPrice: stock.lastPrice,
      avgTarget,
      medianTarget,
      spreadPct,
      consensusUpsidePct,
      brokerCount: closure?.brokerCount ?? tickerOpinions.length,
      resultantState: closure?.resultant.state ?? 'unresolved',
      resultantStrength: closure?.resultant.strength ?? 'weak',
      outlierBrokerIds: closure?.outliers.map((o) => o.brokerId) ?? [],
      opinionsByBroker: opinionsByBroker as Readonly<Record<BrokerId, OpinionCell | undefined>>,
      book,
    }
  })

  // If a portfolio is loaded, sort book rows first.
  if (inputs.coverageByTicker && inputs.coverageByTicker.size > 0) {
    rows.sort((a, b) => {
      const am = membershipRank(a.book?.membership)
      const bm = membershipRank(b.book?.membership)
      if (am !== bm) return am - bm
      if (a.book?.membership === 'held' && b.book?.membership === 'held') {
        return (b.book.weightPct ?? 0) - (a.book.weightPct ?? 0)
      }
      return (a.ticker as string).localeCompare(b.ticker as string)
    })
  }

  // Column set: brokers with at least one opinion on screen.
  const shownBrokerIds = new Set<string>()
  for (const row of rows) {
    for (const bid of Object.keys(row.opinionsByBroker)) shownBrokerIds.add(bid)
  }
  const shownBrokers = inputs.brokers.filter((b) => shownBrokerIds.has(b.id as string))

  return { rows, brokers: shownBrokers }
}

function membershipRank(m: PortfolioMembership | undefined): number {
  if (m === 'held') return 0
  if (m === 'watchlist') return 1
  if (m === 'adjacent') return 2
  return 3
}

export function useByStockViewModel(filters: FiltersState): QueryResult<ByStockViewModel> {
  const fp = filtersFingerprint(filters)

  const stocks = useAdapterQuery((a, s) => a.listStocks(s), [])
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const opinions = useAdapterQuery(
    (a, s) => a.listBrokerStockOpinions(s, {
      brokerIds: filters.brokerIds.length ? filters.brokerIds : undefined,
      tickers: filters.tickers.length ? filters.tickers : undefined,
    }),
    [fp],
  )
  const closures = useAdapterQuery((a, s) => a.listConflictClosures(s), [])
  const reports = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { limit: 200 }),
    [],
  )
  const portfolio = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => {
      try { return await a.getPortfolioSnapshot(s) }
      catch { return null }
    },
    [],
  )

  const loading = stocks.loading || brokers.loading || sectors.loading || opinions.loading || closures.loading
  const error = stocks.error ?? brokers.error ?? sectors.error ?? opinions.error ?? closures.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!stocks.data || !brokers.data || !sectors.data || !opinions.data || !closures.data) {
    return { data: null, loading: true, error: null }
  }

  const sectorNameById = new Map(sectors.data.map((s) => [s.id as string, s.name]))
  const overlay = portfolio.data
    ? buildPortfolioOverlay({
        snapshot: portfolio.data,
        reports: reports.data?.items ?? [],
        summaries: [],
        opinions: opinions.data,
        closures: closures.data,
        stocks: stocks.data,
      })
    : null

  const vm = buildByStockViewModel({
    stocks: stocks.data,
    brokers: brokers.data,
    opinions: opinions.data,
    closures: closures.data,
    sectorNameById,
    filters,
    coverageByTicker: overlay?.coverageByTicker,
  })
  return { data: vm, loading: false, error: null }
}
