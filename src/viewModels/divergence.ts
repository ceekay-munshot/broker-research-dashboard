import type {
  Broker, StockTicker, Stock, Sector,
} from '../domain'
import type {
  ConflictClosure, ConsensusPoint, DisagreementPoint, OutlierClassification,
  ResultantLogic, StrengthBand, ConfidenceDetail, TargetStats,
} from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint } from '../app/filters'

export interface DivergenceCardViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly currency: string
  readonly brokerCount: number
  readonly stanceDistribution: ConflictClosure['stanceDistribution']
  readonly targetStats: TargetStats
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
  readonly filters: FiltersState
}

const REASON_LABELS: Readonly<Record<OutlierClassification['reasons'][number], string>> = {
  target_price_z:  'Target far from the consensus',
  rating_contrary: 'Rating contradicts majority',
  stance_contrary: 'Stance contradicts majority',
}

// A closure surfaces on the divergence screen when either:
//  • the Street's target spread is ≥25% (material valuation divergence),
//  • there is at least one explicit DisagreementPoint, or
//  • at least one broker qualifies as an outlier.
function isMaterialDisagreement(c: ConflictClosure): boolean {
  const spread = c.targetStats.spreadPct
  if (spread !== null && spread >= 25) return true
  if (c.disagreements.length > 0) return true
  if (c.outliers.length > 0) return true
  return false
}

export function buildDivergenceViewModel(inputs: Inputs): DivergenceViewModel {
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const stockByTicker = indexBy(inputs.stocks, (s) => s.ticker as string)
  const sectorById = indexBy(inputs.sectors, (s) => s.id as string)
  const tickerFilter = new Set<string>(inputs.filters.tickers as readonly string[])
  const sectorFilter = new Set<string>(inputs.filters.sectorIds as readonly string[])
  const name = (id: string | null | undefined) =>
    id ? (brokerById.get(id)?.shortName ?? id.toUpperCase()) : '—'
  const ref = (id: string): BrokerRef => ({ id, name: name(id) })

  const cases = inputs.closures
    .filter((c) => tickerFilter.size === 0 || tickerFilter.has(c.ticker as string))
    .filter((c) => {
      if (sectorFilter.size === 0) return true
      const stock = stockByTicker.get(c.ticker as string)
      return stock !== undefined && sectorFilter.has(stock.sectorId as string)
    })
    .filter(isMaterialDisagreement)
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
        stanceDistribution: c.stanceDistribution,
        targetStats: c.targetStats,
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
  const closures = useAdapterQuery(
    (a, s) => a.listConflictClosures(s, {
      tickers: filters.tickers.length ? filters.tickers : undefined,
      sectorIds: filters.sectorIds.length ? filters.sectorIds : undefined,
    }),
    [fp],
  )

  const loading = brokers.loading || stocks.loading || sectors.loading || closures.loading
  const error = brokers.error ?? stocks.error ?? sectors.error ?? closures.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!brokers.data || !stocks.data || !sectors.data || !closures.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildDivergenceViewModel({
    closures: closures.data,
    brokers: brokers.data,
    stocks: stocks.data,
    sectors: sectors.data,
    filters,
  })
  return { data: vm, loading: false, error: null }
}
