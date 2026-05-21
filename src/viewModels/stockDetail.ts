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
  DisagreementPointVM, ConsensusPointVM, OutlierVM, BrokerRef,
} from './divergence'
import {
  deriveArbVerdict, deriveConsensusRating, targetExtremesFromMap,
  type ArbVerdict, type ConsensusRating,
} from './arb'

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
  /** The per-stock ARB (broker-disagreement) verdict — band + subtext. */
  readonly arb: ArbVerdict
  /** The Street's consensus rating, or a tie / no-rating result. */
  readonly consensusRating: ConsensusRating
  /** Broker on the highest / lowest published target, with the count of any
   *  others tied at the same value. Null when no broker published a target. */
  readonly highTargetBroker: BrokerRef | null
  readonly highTargetTieCount: number
  readonly lowTargetBroker: BrokerRef | null
  readonly lowTargetTieCount: number
  /** True when there is real ARB evidence but no extracted prose reason yet. */
  readonly whyMissing: boolean
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
  const ref = (id: BrokerId) => ({ id: id as unknown as string, name: name(id) })

  const consensus: ConsensusPointVM[] = closure.consensus.map((p) => ({
    dimension: p.dimension,
    topic: p.topic,
    claim: p.claim,
    polarity: p.polarity,
    brokers: p.supportingBrokerIds.map((b) => ref(b)),
    supportingClaims: p.supportingClaims,
    evidenceCount: p.evidenceIds.length,
  }))

  const disagreements: DisagreementPointVM[] = closure.disagreements.map((d) => ({
    dimension: d.dimension,
    topic: d.topic,
    bullClaims: d.bullClaims.filter((c) => c.trim().length > 0),
    bearClaims: d.bearClaims.filter((c) => c.trim().length > 0),
    bullBrokers: d.bullBrokerIds.map((b) => ref(b)),
    bearBrokers: d.bearBrokerIds.map((b) => ref(b)),
    bullCitationCount: d.bullEvidenceIds.length,
    bearCitationCount: d.bearEvidenceIds.length,
  }))

  const outliers: OutlierVM[] = closure.outliers.map((o) => ({
    brokerId: o.brokerId as unknown as string,
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

  // ── ARB verdict + consensus + high/low target broker ──────────────────
  const arb = deriveArbVerdict(closure, closure.brokerCount)
  const consensusRating = deriveConsensusRating(closure)

  const targetByBroker = new Map<string, number>()
  for (const r of inputs.reports) {
    const sum = summaryByReport.get(r.id as string)
    if (sum?.targetPrice != null) targetByBroker.set(r.brokerId as string, sum.targetPrice)
  }
  const extremes = targetExtremesFromMap(targetByBroker)
  const highId = extremes.highIds[0]
  const lowId = extremes.lowIds[0]

  // The "why" is missing when there is real ARB evidence but no extracted
  // prose reason — never invent one; surface the source reports instead.
  const hasArbEvidence =
    arb.band === 'high' || arb.band === 'moderate'
    || closure.outliers.length > 0 || closure.disagreements.length > 0
  const hasProseReason =
    closure.disagreements.some((d) =>
      d.dimension !== 'rating' && d.dimension !== 'target_price'
      && [...d.bullClaims, ...d.bearClaims].some((c) => c.trim().length > 0))
    || inputs.summaries.some((s) => s.thesis.trim().length > 0 || s.keyPoints.length > 0)
  const whyMissing = hasArbEvidence && !hasProseReason

  return {
    ticker: stock.ticker,
    stockName: stock.name,
    sectorName: sector?.name ?? '—',
    currency: stock.currency,
    spotPrice: stock.lastPrice,
    closure,
    arb,
    consensusRating,
    highTargetBroker: highId ? ref(highId) : null,
    highTargetTieCount: Math.max(0, extremes.highIds.length - 1),
    lowTargetBroker: lowId ? ref(lowId) : null,
    lowTargetTieCount: Math.max(0, extremes.lowIds.length - 1),
    whyMissing,
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
