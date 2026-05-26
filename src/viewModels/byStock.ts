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
import {
  deriveArbVerdict, deriveConsensusRating, targetExtremesFromMap, ARB_RANK,
  type ArbVerdict, type ConsensusRating,
} from './arb'

/** Ordering lens for the By Stock matrix. Re-sorts only — never filters rows. */
export type StockView = 'most-covered' | 'consensus' | 'contested' | 'portfolio'

export interface OpinionCell {
  readonly brokerId: BrokerId
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetDelta: number | null
  readonly targetCurrency: string | null
  readonly lastUpdatedAt: string
  readonly lastReportId: ReportId
  readonly outlier: boolean
}

export interface ByStockRowViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly currency: string
  readonly avgTarget: number | null
  readonly medianTarget: number | null
  readonly spreadPct: number | null
  /** The per-stock ARB (broker-disagreement) verdict — band + subtext. */
  readonly arbVerdict: ArbVerdict
  /** The Street's consensus rating, or a tie / no-rating result. */
  readonly consensusRating: ConsensusRating
  /** Broker(s) holding the highest / lowest published target (ties → many). */
  readonly highTargetBrokerIds: readonly BrokerId[]
  readonly lowTargetBrokerIds: readonly BrokerId[]
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
  /** True when a portfolio is loaded — gates the "My portfolio" view. */
  readonly hasPortfolio: boolean
}

interface Inputs {
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly sectorNameById: ReadonlyMap<string, string>
  readonly filters: FiltersState
  readonly view: StockView
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
        lastUpdatedAt: o.lastUpdatedAt,
        lastReportId: o.lastReportId,
        outlier: outlierIds.has(o.brokerId as string),
      }
    }

    const avgTarget = closure?.targetStats.mean ?? null
    const medianTarget = closure?.targetStats.median ?? null
    const spreadPct = closure?.targetStats.spreadPct ?? null

    // ARB closure verdict — band, consensus rating, high/low target broker.
    const brokerCount = closure?.brokerCount ?? tickerOpinions.length
    const arbVerdict = deriveArbVerdict(closure ?? null, brokerCount)
    const consensusRating: ConsensusRating = closure
      ? deriveConsensusRating(closure)
      : { kind: 'none' }
    const targetByBroker = new Map<string, number>()
    for (const o of tickerOpinions) {
      if (o.targetPrice !== null) targetByBroker.set(o.brokerId as string, o.targetPrice)
    }
    const targetExtremes = targetExtremesFromMap(targetByBroker)

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
      avgTarget,
      medianTarget,
      spreadPct,
      arbVerdict,
      consensusRating,
      highTargetBrokerIds: targetExtremes.highIds,
      lowTargetBrokerIds: targetExtremes.lowIds,
      brokerCount,
      resultantState: closure?.resultant.state ?? 'unresolved',
      resultantStrength: closure?.resultant.strength ?? 'weak',
      outlierBrokerIds: closure?.outliers.map((o) => o.brokerId) ?? [],
      opinionsByBroker: opinionsByBroker as Readonly<Record<BrokerId, OpinionCell | undefined>>,
      book,
    }
  })

  // The view selector only re-orders rows; every row stays on screen.
  const hasPortfolio = !!(inputs.coverageByTicker && inputs.coverageByTicker.size > 0)
  rows.sort((a, b) => compareRows(a, b, inputs.view))

  // Column set: brokers with at least one opinion on screen.
  // Order by coverage density (descending) so brokers with the most data
  // sit just after the Disagreement column — sparse / mostly-empty
  // brokers slide to the right and don't dominate the user's first scan.
  const opinionCountByBroker = new Map<string, number>()
  for (const row of rows) {
    for (const bid of Object.keys(row.opinionsByBroker)) {
      if (row.opinionsByBroker[bid as unknown as BrokerId] === undefined) continue
      opinionCountByBroker.set(bid, (opinionCountByBroker.get(bid) ?? 0) + 1)
    }
  }
  const shownBrokers = inputs.brokers
    .filter((b) => opinionCountByBroker.has(b.id as string))
    .sort((a, b) => {
      const ca = opinionCountByBroker.get(a.id as string) ?? 0
      const cb = opinionCountByBroker.get(b.id as string) ?? 0
      if (ca !== cb) return cb - ca
      // Tie-break by name so the column order is stable across reloads
      // when two brokers have identical coverage counts.
      return a.shortName.localeCompare(b.shortName)
    })

  return { rows, brokers: shownBrokers, hasPortfolio }
}

function membershipRank(m: PortfolioMembership | undefined): number {
  if (m === 'held') return 0
  if (m === 'watchlist') return 1
  if (m === 'adjacent') return 2
  return 3
}

const STRENGTH_RANK: Readonly<Record<StrengthBand, number>> = {
  strong: 0, moderate: 1, weak: 2,
}

// How consensus-aligned a resultant state is — lower sorts first in Consensus view.
const CONSENSUS_RANK: Readonly<Record<ResultantState, number>> = {
  consensus_bullish: 0,
  consensus_bearish: 0,
  mixed_constructive: 1,
  mixed_cautious: 1,
  outlier_driven: 2,
  unresolved: 3,
}

function tickerCmp(a: ByStockRowViewModel, b: ByStockRowViewModel): number {
  return (a.ticker as string).localeCompare(b.ticker as string)
}

/**
 * Row comparator for a given view. Every branch ends with a ticker tiebreak so
 * ordering is stable and deterministic; null spread/upside sort last.
 */
function compareRows(a: ByStockRowViewModel, b: ByStockRowViewModel, view: StockView): number {
  switch (view) {
    case 'most-covered':
      return (b.brokerCount - a.brokerCount) || tickerCmp(a, b)
    case 'consensus':
      return (CONSENSUS_RANK[a.resultantState] - CONSENSUS_RANK[b.resultantState])
        || (STRENGTH_RANK[a.resultantStrength] - STRENGTH_RANK[b.resultantStrength])
        || (b.brokerCount - a.brokerCount)
        || tickerCmp(a, b)
    // ARB severity: High > Moderate > Low > No-comparison, then target spread.
    case 'contested':
      return (ARB_RANK[a.arbVerdict.band] - ARB_RANK[b.arbVerdict.band])
        || ((b.spreadPct ?? -Infinity) - (a.spreadPct ?? -Infinity))
        || (b.outlierBrokerIds.length - a.outlierBrokerIds.length)
        || tickerCmp(a, b)
    case 'portfolio': {
      const am = membershipRank(a.book?.membership)
      const bm = membershipRank(b.book?.membership)
      if (am !== bm) return am - bm
      if (a.book?.membership === 'held' && b.book?.membership === 'held') {
        return (b.book.weightPct ?? 0) - (a.book.weightPct ?? 0)
      }
      return tickerCmp(a, b)
    }
  }
}

export function useByStockViewModel(
  filters: FiltersState,
  view: StockView = 'most-covered',
): QueryResult<ByStockViewModel> {
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
    view,
    coverageByTicker: overlay?.coverageByTicker,
  })
  return { data: vm, loading: false, error: null }
}
