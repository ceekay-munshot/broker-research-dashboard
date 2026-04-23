import type {
  Broker, BrokerStockOpinion, ConsensusView, Stock,
  BrokerId, StockTicker, Rating, Stance, ReportId,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint } from '../app/filters'

export interface OpinionCell {
  readonly brokerId: BrokerId
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetDelta: number | null
  readonly impliedUpsidePct: number | null
  readonly lastUpdatedAt: string
  readonly lastReportId: ReportId
  readonly outlier: boolean
}

export interface ByStockRowViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly spotPrice: number | null
  readonly avgTarget: number | null
  readonly spreadSigma: number | null
  readonly consensusUpsidePct: number | null
  readonly opinionsByBroker: Readonly<Record<BrokerId, OpinionCell | undefined>>
}

export interface ByStockViewModel {
  readonly rows: readonly ByStockRowViewModel[]
  readonly brokers: readonly Broker[]
}

interface Inputs {
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly consensus: readonly ConsensusView[]
  readonly sectorNameById: ReadonlyMap<string, string>
  readonly filters: FiltersState
}

const OUTLIER_SIGMA = 1.25

function stdev(nums: readonly number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.map((n) => (n - mean) ** 2).reduce((a, b) => a + b, 0) / nums.length
  return Math.sqrt(variance)
}

export function buildByStockViewModel(inputs: Inputs): ByStockViewModel {
  const consensusByTicker = indexBy(inputs.consensus, (c) => c.ticker as string)
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
    const targets = tickerOpinions
      .map((o) => o.targetPrice)
      .filter((t): t is number => t !== null)
    const sd = stdev(targets)
    const mean = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null

    const opinionsByBroker: Record<string, OpinionCell | undefined> = {}
    for (const o of tickerOpinions) {
      const outlier = sd > 0 && o.targetPrice !== null && mean !== null
        && Math.abs(o.targetPrice - mean) / sd > OUTLIER_SIGMA
      opinionsByBroker[o.brokerId as string] = {
        brokerId: o.brokerId,
        rating: o.rating,
        stance: o.stance,
        targetPrice: o.targetPrice,
        priorTargetPrice: o.priorTargetPrice,
        targetDelta: o.targetPrice !== null && o.priorTargetPrice !== null
          ? o.targetPrice - o.priorTargetPrice
          : null,
        impliedUpsidePct: o.impliedUpsidePct,
        lastUpdatedAt: o.lastUpdatedAt,
        lastReportId: o.lastReportId,
        outlier,
      }
    }

    const consensus = consensusByTicker.get(stock.ticker as string)
    const consensusUpsidePct = mean !== null && stock.lastPrice !== null
      ? ((mean / stock.lastPrice) - 1) * 100
      : null

    return {
      ticker: stock.ticker,
      stockName: stock.name,
      sectorName: inputs.sectorNameById.get(stock.sectorId as string) ?? '—',
      spotPrice: stock.lastPrice,
      avgTarget: consensus?.avgTargetPrice ?? mean,
      spreadSigma: sd > 0 ? sd : null,
      consensusUpsidePct,
      opinionsByBroker: opinionsByBroker as Readonly<Record<BrokerId, OpinionCell | undefined>>,
    }
  })

  // Column set: only brokers that appear in at least one opinion on screen.
  const shownBrokerIds = new Set<string>()
  for (const row of rows) {
    for (const bid of Object.keys(row.opinionsByBroker)) shownBrokerIds.add(bid)
  }
  const shownBrokers = inputs.brokers.filter((b) => shownBrokerIds.has(b.id as string))

  return { rows, brokers: shownBrokers }
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
  const consensus = useAdapterQuery(async (a, s) => {
    const stockList = await a.listStocks(s)
    const views = await Promise.all(stockList.map((st) => a.getConsensusView(s, st.ticker)))
    return views.filter((v): v is NonNullable<typeof v> => v !== null)
  }, [])

  const loading = stocks.loading || brokers.loading || sectors.loading || opinions.loading || consensus.loading
  const error = stocks.error ?? brokers.error ?? sectors.error ?? opinions.error ?? consensus.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!stocks.data || !brokers.data || !sectors.data || !opinions.data || !consensus.data) {
    return { data: null, loading: true, error: null }
  }

  const sectorNameById = new Map(sectors.data.map((s) => [s.id as string, s.name]))
  const vm = buildByStockViewModel({
    stocks: stocks.data,
    brokers: brokers.data,
    opinions: opinions.data,
    consensus: consensus.data,
    sectorNameById,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
