import type {
  Broker, StockTicker, Stock, Sector, BrokerStockOpinion,
} from '../domain'
import type {
  ConflictClosure, ConsensusPoint, DisagreementPoint, OutlierClassification,
  ResultantLogic, StrengthBand, ConfidenceDetail, TargetStats,
} from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint } from '../app/filters'
import { deriveConsensusRating, type ConsensusRating } from './arb'

export interface DivergenceCardViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly currency: string
  readonly brokerCount: number
  /** Every broker covering this stock, used as the column set in the matrix view. */
  readonly brokers: readonly BrokerRef[]
  readonly stanceDistribution: ConflictClosure['stanceDistribution']
  /** Plain consensus call (Buy · 5 of 8 / Mixed / No rating) for the list +
   *  header — the same wording the Stocks tab uses. */
  readonly consensusRating: ConsensusRating
  readonly targetStats: TargetStats
  /** Every covering broker's published price target on this stock, so the
   *  target-price scale can plot one dot per broker (not just low/median/
   *  high) and name each on hover. Sourced from per-broker opinions, which
   *  are available in both mock and live modes. */
  readonly brokerTargets: readonly BrokerTargetVM[]
  readonly resultant: ResultantLogic
  readonly confidence: ConfidenceDetail
  readonly strength: StrengthBand
  readonly consensus: readonly ConsensusPointVM[]
  readonly disagreements: readonly DisagreementPointVM[]
  readonly outliers: readonly OutlierVM[]
}

/** A broker referenced by a divergence point — id is kept so the UI can
 *  join calibration track-record onto the name. */
export interface BrokerRef {
  readonly id: string
  readonly name: string
}

/** One broker's published price target on a stock — the unit the target-
 *  price scale plots as a single dot the reader can hover to identify. */
export interface BrokerTargetVM {
  readonly brokerId: string
  readonly brokerName: string
  readonly targetPrice: number
}

export interface ConsensusPointVM {
  readonly dimension: ConsensusPoint['dimension']
  readonly topic: string
  readonly claim: string
  readonly polarity: ConsensusPoint['polarity']
  readonly brokers: readonly BrokerRef[]
  readonly supportingClaims: readonly string[]
  readonly evidenceCount: number
}

export interface DisagreementPointVM {
  readonly dimension: DisagreementPoint['dimension']
  readonly topic: string
  readonly bullClaims: readonly string[]
  readonly bearClaims: readonly string[]
  readonly bullBrokers: readonly BrokerRef[]
  readonly bearBrokers: readonly BrokerRef[]
  readonly bullCitationCount: number
  readonly bearCitationCount: number
}

export interface OutlierVM {
  readonly brokerId: string
  readonly brokerName: string
  readonly direction: OutlierClassification['direction']
  readonly reasons: readonly string[]
  readonly targetZScore: number | null
  readonly notes: string
}

export interface DivergenceViewModel {
  readonly cases: readonly DivergenceCardViewModel[]
  readonly totalStocks: number
}

interface Inputs {
  readonly closures: readonly ConflictClosure[]
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  readonly sectors: readonly Sector[]
  /** Per-broker opinions across all covered stocks — grouped by ticker to
   *  feed each card's per-broker target dots. */
  readonly opinions: readonly BrokerStockOpinion[]
  readonly filters: FiltersState
}

const REASON_LABELS: Readonly<Record<OutlierClassification['reasons'][number], string>> = {
  target_price_z:  'Target far from the consensus',
  rating_contrary: 'Rating contradicts majority',
  stance_contrary: 'Stance contradicts majority',
}

// A closure surfaces on the Street-view screen when ≥2 brokers cover the
// stock AND at least one of:
//  • the Street's target spread is ≥25% (material valuation divergence),
//  • there is at least one explicit DisagreementPoint,
//  • at least one broker qualifies as an outlier,
//  • there is at least one extracted ConsensusPoint, or
//  • the resultant state is a clear consensus call (so an all-Buy / all-Sell
//    name surfaces even when the server hasn't extracted a structured point).
// Single-broker stocks are excluded — no Street picture to assemble.
function isMaterialStreetCase(c: ConflictClosure): boolean {
  if (c.brokerCount < 2) return false
  const spread = c.targetStats.spreadPct
  if (spread !== null && spread >= 25) return true
  if (c.disagreements.length > 0) return true
  if (c.outliers.length > 0) return true
  if (c.consensus.length > 0) return true
  if (c.resultant.state === 'consensus_bullish' || c.resultant.state === 'consensus_bearish') return true
  return false
}

export function buildDivergenceViewModel(inputs: Inputs): DivergenceViewModel {
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const stockByTicker = indexBy(inputs.stocks, (s) => s.ticker as string)
  const sectorById = indexBy(inputs.sectors, (s) => s.id as string)
  const tickerFilter = new Set<string>(inputs.filters.tickers as readonly string[])
  const sectorFilter = new Set<string>(inputs.filters.sectorIds as readonly string[])
  const brokerFilter = new Set<string>(inputs.filters.brokerIds as readonly string[])
  const name = (id: string | null | undefined) =>
    id ? (brokerById.get(id)?.shortName ?? id.toUpperCase()) : '—'
  const ref = (id: string): BrokerRef => ({ id, name: name(id) })

  // Group every published target by ticker so each card can plot one dot
  // per broker. Keyed by ticker string for O(1) lookup inside the map below.
  const opinionsByTicker = new Map<string, BrokerStockOpinion[]>()
  for (const o of inputs.opinions) {
    const t = o.ticker as unknown as string
    const bucket = opinionsByTicker.get(t)
    if (bucket) bucket.push(o)
    else opinionsByTicker.set(t, [o])
  }

  const cases = inputs.closures
    .filter((c) => tickerFilter.size === 0 || tickerFilter.has(c.ticker as string))
    .filter((c) => {
      if (sectorFilter.size === 0) return true
      const stock = stockByTicker.get(c.ticker as string)
      return stock !== undefined && sectorFilter.has(stock.sectorId as string)
    })
    // Broker filter: keep a case only when at least one of its brokers is
    // selected. The full broker set still renders inside the card so the
    // disagreement stays legible — we gate which cases appear, not who shows.
    .filter((c) => brokerFilter.size === 0
      || c.brokerIds.some((b) => brokerFilter.has(b as unknown as string)))
    .filter(isMaterialStreetCase)
    .sort((a, b) =>
      (b.targetStats.spreadPct ?? 0) - (a.targetStats.spreadPct ?? 0)
      || b.disagreements.length - a.disagreements.length)
    .map<DivergenceCardViewModel>((c) => {
      const stock = stockByTicker.get(c.ticker as string)
      const sectorId = stock?.sectorId as string | undefined
      const sectorName = sectorId ? (sectorById.get(sectorId)?.name ?? '—') : '—'

      return {
        ticker: c.ticker,
        stockName: stock?.name ?? (c.ticker as unknown as string),
        sectorName,
        currency: stock?.currency ?? 'INR',
        brokerCount: c.brokerCount,
        brokers: c.brokerIds.map((b) => ref(b as unknown as string)),
        stanceDistribution: c.stanceDistribution,
        consensusRating: deriveConsensusRating(c),
        targetStats: c.targetStats,
        brokerTargets: (opinionsByTicker.get(c.ticker as unknown as string) ?? [])
          .filter((o) => o.targetPrice !== null)
          .map<BrokerTargetVM>((o) => ({
            brokerId: o.brokerId as unknown as string,
            brokerName: name(o.brokerId as unknown as string),
            targetPrice: o.targetPrice as number,
          })),
        resultant: c.resultant,
        confidence: c.confidence,
        strength: c.resultant.strength,
        consensus: c.consensus.map<ConsensusPointVM>((p) => ({
          dimension: p.dimension,
          topic: p.topic,
          claim: p.claim,
          polarity: p.polarity,
          brokers: p.supportingBrokerIds.map((b) => ref(b as unknown as string)),
          supportingClaims: p.supportingClaims,
          evidenceCount: p.evidenceIds.length,
        })),
        disagreements: c.disagreements.map<DisagreementPointVM>((d) => ({
          dimension: d.dimension,
          topic: d.topic,
          bullClaims: d.bullClaims,
          bearClaims: d.bearClaims,
          bullBrokers: d.bullBrokerIds.map((b) => ref(b as unknown as string)),
          bearBrokers: d.bearBrokerIds.map((b) => ref(b as unknown as string)),
          bullCitationCount: d.bullEvidenceIds.length,
          bearCitationCount: d.bearEvidenceIds.length,
        })),
        outliers: c.outliers.map<OutlierVM>((o) => ({
          brokerId: o.brokerId as unknown as string,
          brokerName: name(o.brokerId as unknown as string),
          direction: o.direction,
          reasons: o.reasons.map((r) => REASON_LABELS[r]),
          targetZScore: o.targetZScore,
          notes: o.notes,
        })),
      }
    })

  return { cases, totalStocks: inputs.closures.length }
}

export function useDivergenceViewModel(filters: FiltersState): QueryResult<DivergenceViewModel> {
  const fp = filtersFingerprint(filters)
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const stocks = useAdapterQuery((a, s) => a.listStocks(s), [])
  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const opinions = useAdapterQuery((a, s) => a.listBrokerStockOpinions(s), [])
  const closures = useAdapterQuery(
    (a, s) => a.listConflictClosures(s, {
      tickers: filters.tickers.length ? filters.tickers : undefined,
      sectorIds: filters.sectorIds.length ? filters.sectorIds : undefined,
    }),
    // fp includes brokerIds/ratings/dateRange so the broker gate below re-runs
    // when any filter changes, even though the closures query itself only
    // narrows by ticker/sector.
    [fp],
  )

  const loading = brokers.loading || stocks.loading || sectors.loading || opinions.loading || closures.loading
  const error = brokers.error ?? stocks.error ?? sectors.error ?? opinions.error ?? closures.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!brokers.data || !stocks.data || !sectors.data || !opinions.data || !closures.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildDivergenceViewModel({
    closures: closures.data,
    brokers: brokers.data,
    stocks: stocks.data,
    sectors: sectors.data,
    opinions: opinions.data,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
