import type {
  Broker, ResearchReport, ReportSummary, Stock, Sector,
  BrokerId, StockTicker, ReportId, Stance, Rating,
} from '../domain'
import type {
  ConflictClosure,
} from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import type {
  DisagreementPointVM, ConsensusPointVM, OutlierVM,
} from './divergence'

export interface LinkedReportVM {
  readonly reportId: ReportId
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly title: string
  readonly publishedAt: string
  readonly stance: Stance
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
}

export interface StockDetailViewModel {
  readonly ticker: StockTicker
  readonly stockName: string
  readonly sectorName: string
  readonly currency: string
  readonly spotPrice: number | null
  readonly closure: ConflictClosure
  readonly consensus: readonly ConsensusPointVM[]
  readonly disagreements: readonly DisagreementPointVM[]
  readonly outliers: readonly OutlierVM[]
  readonly linkedReports: readonly LinkedReportVM[]
}

interface Inputs {
  readonly stock: Stock
  readonly sector: Sector | null
  readonly closure: ConflictClosure
  readonly brokers: readonly Broker[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
}

const REASON_LABELS: Readonly<Record<string, string>> = {
  target_price_z:  'Target outside ±1.25σ',
  rating_contrary: 'Rating contradicts majority',
  stance_contrary: 'Stance contradicts majority',
}

export function buildStockDetailViewModel(inputs: Inputs): StockDetailViewModel {
  const { stock, sector, closure } = inputs
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const name = (id: BrokerId) => brokerById.get(id as unknown as string)?.shortName ?? (id as unknown as string).toUpperCase()

  const consensus: ConsensusPointVM[] = closure.consensus.map((p) => ({
    dimension: p.dimension,
    topic: p.topic,
    claim: p.claim,
    polarity: p.polarity,
    brokerNames: p.supportingBrokerIds.map((b) => name(b)),
    supportingClaims: p.supportingClaims,
    evidenceCount: p.evidenceIds.length,
  }))

  const disagreements: DisagreementPointVM[] = closure.disagreements.map((d) => ({
    dimension: d.dimension,
    topic: d.topic,
    bullClaims: d.bullClaims,
    bearClaims: d.bearClaims,
    bullBrokerNames: d.bullBrokerIds.map((b) => name(b)),
    bearBrokerNames: d.bearBrokerIds.map((b) => name(b)),
    bullCitationCount: d.bullEvidenceIds.length,
    bearCitationCount: d.bearEvidenceIds.length,
  }))

  const outliers: OutlierVM[] = closure.outliers.map((o) => ({
    brokerName: name(o.brokerId),
    direction: o.direction,
    reasons: o.reasons.map((r) => REASON_LABELS[r] ?? r),
    targetZScore: o.targetZScore,
    notes: o.notes,
  }))

  const linkedReports: LinkedReportVM[] = inputs.reports
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map<LinkedReportVM>((r) => {
      const broker = brokerById.get(r.brokerId as string)
      const summary = summaryByReport.get(r.id as string)
      return {
        reportId: r.id,
        brokerShortName: broker?.shortName ?? '—',
        brokerColor: broker?.brandColor ?? null,
        title: r.title,
        publishedAt: r.publishedAt,
        stance: summary?.stance ?? 'neutral',
        rating: summary?.rating ?? null,
        targetPrice: summary?.targetPrice ?? null,
        priorTargetPrice: summary?.priorTargetPrice ?? null,
      }
    })

  return {
    ticker: stock.ticker,
    stockName: stock.name,
    sectorName: sector?.name ?? '—',
    currency: stock.currency,
    spotPrice: stock.lastPrice,
    closure,
    consensus,
    disagreements,
    outliers,
    linkedReports,
  }
}

export function useStockDetailViewModel(ticker: StockTicker | null): QueryResult<StockDetailViewModel> {
  const tickerKey = ticker ?? ('' as StockTicker)

  const stock = useAdapterQuery(
    async (a, s) => ticker ? a.getStock(s, ticker) : null,
    [tickerKey],
  )
  const closure = useAdapterQuery(
    async (a, s) => ticker ? a.getConflictClosure(s, ticker) : null,
    [tickerKey],
  )
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const sectors = useAdapterQuery((a, s) => a.listSectors(s), [])

  // Fetch reports + summaries for the reports referenced by the closure.
  const reportIds = closure.data?.lastReportIds ?? []
  const reports = useAdapterQuery(async (a, s) => {
    return Promise.all(reportIds.map((id) => a.getResearchReport(s, id)))
      .then((xs) => xs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [reportIds.join(',')])
  const summaries = useAdapterQuery(async (a, s) => {
    return Promise.all(reportIds.map((id) => a.getReportSummary(s, id)))
      .then((xs) => xs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [reportIds.join(',')])

  if (!ticker) return { data: null, loading: false, error: null }

  const loading = stock.loading || closure.loading || brokers.loading || sectors.loading || reports.loading || summaries.loading
  const error = stock.error ?? closure.error ?? brokers.error ?? sectors.error ?? reports.error ?? summaries.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!stock.data || !closure.data || !brokers.data || !sectors.data || !reports.data || !summaries.data) {
    return { data: null, loading: true, error: null }
  }

  const sector = sectors.data.find((s) => s.id === stock.data!.sectorId) ?? null
  const vm = buildStockDetailViewModel({
    stock: stock.data,
    sector,
    closure: closure.data,
    brokers: brokers.data,
    reports: reports.data,
    summaries: summaries.data,
  })
  return { data: vm, loading: false, error: null }
}
