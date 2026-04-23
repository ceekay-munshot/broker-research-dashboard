import type {
  Broker, DivergenceCase, DivergenceId, StockTicker,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint } from '../app/filters'

export interface ConflictViewModel {
  readonly topic: string
  readonly bullThesis: string
  readonly bearThesis: string
  readonly bullBrokerNames: readonly string[]
  readonly bearBrokerNames: readonly string[]
  readonly citationCount: number
}

export interface DivergenceCardViewModel {
  readonly id: DivergenceId
  readonly ticker: StockTicker
  readonly spreadPct: number
  readonly highBrokerName: string
  readonly lowBrokerName: string
  readonly highTargetPrice: number
  readonly lowTargetPrice: number
  readonly conflicts: readonly ConflictViewModel[]
  readonly aiConclusion: string | null
}

export interface DivergenceViewModel {
  readonly cases: readonly DivergenceCardViewModel[]
}

interface Inputs {
  readonly cases: readonly DivergenceCase[]
  readonly brokers: readonly Broker[]
}

export function buildDivergenceViewModel(inputs: Inputs): DivergenceViewModel {
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const brokerName = (id: string | null) => id ? (brokerById.get(id)?.shortName ?? id.toUpperCase()) : '—'

  const cases = inputs.cases.map<DivergenceCardViewModel>((d) => ({
    id: d.id,
    ticker: d.ticker,
    spreadPct: d.spreadPct,
    highBrokerName: brokerName(d.highBrokerId as string),
    lowBrokerName: brokerName(d.lowBrokerId as string),
    highTargetPrice: d.highTargetPrice,
    lowTargetPrice: d.lowTargetPrice,
    aiConclusion: d.aiConclusion,
    conflicts: d.conflicts.map<ConflictViewModel>((c) => ({
      topic: c.topic,
      bullThesis: c.bullThesis,
      bearThesis: c.bearThesis,
      bullBrokerNames: c.bullBrokerIds.map((id) => brokerName(id as string)),
      bearBrokerNames: c.bearBrokerIds.map((id) => brokerName(id as string)),
      citationCount: c.evidenceIds.length,
    })),
  }))

  return { cases }
}

export function useDivergenceViewModel(filters: FiltersState): QueryResult<DivergenceViewModel> {
  const fp = filtersFingerprint(filters)
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const cases = useAdapterQuery(
    (a, s) => a.listDivergenceCases(s, {
      tickers: filters.tickers.length ? filters.tickers : undefined,
    }),
    [fp],
  )

  const loading = brokers.loading || cases.loading
  const error = brokers.error ?? cases.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!brokers.data || !cases.data) return { data: null, loading: true, error: null }

  const vm = buildDivergenceViewModel({ cases: cases.data, brokers: brokers.data })
  return { data: vm, loading: false, error: null }
}
