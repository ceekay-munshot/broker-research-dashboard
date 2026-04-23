import type {
  Broker, ResearchReport, ReportSummary, EvidenceSnippet,
  Sector, Stock, BrokerEmail,
  ReportId, EmailProcessingStatus, Rating, Stance, ReportCatalyst,
  EvidenceSupportingField, StockTicker,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { groupBy } from './shared'

export interface EvidenceBySection {
  readonly thesis: readonly EvidenceSnippet[]
  readonly rating: readonly EvidenceSnippet[]
  readonly targetPrice: readonly EvidenceSnippet[]
  readonly keyPointByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly riskByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly themeByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly catalystByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
}

export interface ReportDetailViewModel {
  readonly reportId: ReportId
  readonly title: string
  readonly publishedAt: string
  readonly receivedAt: string
  readonly language: string
  readonly pageCount: number | null
  readonly reportType: ResearchReport['reportType']
  readonly processingStatus: EmailProcessingStatus
  readonly processingMessage: string | null

  readonly broker: { readonly name: string; readonly shortName: string; readonly color: string | null }
  readonly stocks: readonly { readonly ticker: StockTicker; readonly name: string }[]
  readonly sectors: readonly { readonly name: string }[]

  readonly stance: Stance | null
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetChanged: boolean
  readonly targetDelta: number | null
  readonly targetCurrency: string | null

  readonly thesis: string | null
  readonly keyPoints: readonly string[]
  readonly themes: readonly string[]
  readonly risks: readonly string[]
  readonly catalysts: readonly ReportCatalyst[]
  readonly confidence: number | null

  readonly evidence: EvidenceBySection
  readonly evidenceCount: number

  readonly sourceEmail: {
    readonly subject: string
    readonly senderName: string
    readonly receivedAt: string
    readonly status: EmailProcessingStatus
  } | null
}

interface Inputs {
  readonly report: ResearchReport
  readonly summary: ReportSummary | null
  readonly evidence: readonly EvidenceSnippet[]
  readonly broker: Broker | null
  readonly stocks: readonly Stock[]
  readonly sectors: readonly Sector[]
  readonly sourceEmail: BrokerEmail | null
}

function groupEvidenceByField(
  snippets: readonly EvidenceSnippet[],
  field: EvidenceSupportingField,
): ReadonlyMap<number, readonly EvidenceSnippet[]> {
  const filtered = snippets.filter((s) => s.supportingField === field)
  const grouped = groupBy(filtered, (s) => {
    const parsed = Number.parseInt(s.fieldRef, 10)
    return (Number.isFinite(parsed) ? parsed : 0).toString()
  })
  const out = new Map<number, readonly EvidenceSnippet[]>()
  for (const [k, v] of grouped) out.set(Number.parseInt(k, 10), v)
  return out
}

export function buildReportDetailViewModel(inputs: Inputs): ReportDetailViewModel {
  const { report, summary, evidence, broker, stocks, sectors, sourceEmail } = inputs

  const targetChanged = summary?.targetPrice != null && summary.priorTargetPrice != null
    && summary.targetPrice !== summary.priorTargetPrice
  const targetDelta = summary?.targetPrice != null && summary.priorTargetPrice != null
    ? summary.targetPrice - summary.priorTargetPrice
    : null

  const evidenceBySection: EvidenceBySection = {
    thesis: evidence.filter((e) => e.supportingField === 'thesis'),
    rating: evidence.filter((e) => e.supportingField === 'rating'),
    targetPrice: evidence.filter((e) => e.supportingField === 'targetPrice'),
    keyPointByIndex: groupEvidenceByField(evidence, 'keyPoint'),
    riskByIndex: groupEvidenceByField(evidence, 'risk'),
    themeByIndex: groupEvidenceByField(evidence, 'theme'),
    catalystByIndex: groupEvidenceByField(evidence, 'catalyst'),
  }

  return {
    reportId: report.id,
    title: report.title,
    publishedAt: report.publishedAt,
    receivedAt: report.receivedAt,
    language: report.language,
    pageCount: report.pageCount,
    reportType: report.reportType,
    processingStatus: report.status,
    processingMessage: null,

    broker: {
      name: broker?.name ?? '—',
      shortName: broker?.shortName ?? '—',
      color: broker?.brandColor ?? null,
    },
    stocks: stocks.map((s) => ({ ticker: s.ticker, name: s.name })),
    sectors: sectors.map((s) => ({ name: s.name })),

    stance: summary?.stance ?? null,
    rating: summary?.rating ?? null,
    targetPrice: summary?.targetPrice ?? null,
    priorTargetPrice: summary?.priorTargetPrice ?? null,
    targetChanged,
    targetDelta,
    targetCurrency: summary?.targetCurrency ?? null,

    thesis: summary?.thesis ?? null,
    keyPoints: summary?.keyPoints ?? [],
    themes: summary?.themes ?? [],
    risks: summary?.risks ?? [],
    catalysts: summary?.catalysts ?? [],
    confidence: summary?.confidence ?? null,

    evidence: evidenceBySection,
    evidenceCount: evidence.length,

    sourceEmail: sourceEmail ? {
      subject: sourceEmail.subject,
      senderName: sourceEmail.senderName,
      receivedAt: sourceEmail.receivedAt,
      status: sourceEmail.status,
    } : null,
  }
}

export function useReportDetailViewModel(reportId: ReportId | null): QueryResult<ReportDetailViewModel> {
  const report = useAdapterQuery(
    async (a, s) => reportId ? a.getResearchReport(s, reportId) : null,
    [reportId ?? ''],
  )
  const summary = useAdapterQuery(
    async (a, s) => reportId ? a.getReportSummary(s, reportId) : null,
    [reportId ?? ''],
  )
  const evidence = useAdapterQuery(
    async (a, s) => reportId ? a.listEvidenceSnippets(s, reportId) : [],
    [reportId ?? ''],
  )
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const allStocks = useAdapterQuery((a, s) => a.listStocks(s), [])
  const allSectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const sourceEmail = useAdapterQuery(
    async (a, s) => report.data ? a.getBrokerEmail(s, report.data.sourceEmailId) : null,
    [report.data?.sourceEmailId ?? ''],
  )

  if (!reportId) return { data: null, loading: false, error: null }

  const loading = report.loading || summary.loading || evidence.loading
    || brokers.loading || allStocks.loading || allSectors.loading || sourceEmail.loading
  const error = report.error ?? summary.error ?? evidence.error
    ?? brokers.error ?? allStocks.error ?? allSectors.error ?? sourceEmail.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!report.data || !brokers.data || !allStocks.data || !allSectors.data) {
    return { data: null, loading: true, error: null }
  }

  const broker = brokers.data.find((b) => b.id === report.data!.brokerId) ?? null
  const tickerSet = new Set<string>(report.data.tickers as readonly string[])
  const sectorSet = new Set<string>(report.data.sectorIds as readonly string[])
  const stocks = allStocks.data.filter((s) => tickerSet.has(s.ticker as string))
  const sectors = allSectors.data.filter((s) => sectorSet.has(s.id as string))

  const vm = buildReportDetailViewModel({
    report: report.data,
    summary: summary.data,
    evidence: evidence.data ?? [],
    broker,
    stocks,
    sectors,
    sourceEmail: sourceEmail.data ?? null,
  })
  return { data: vm, loading: false, error: null }
}
