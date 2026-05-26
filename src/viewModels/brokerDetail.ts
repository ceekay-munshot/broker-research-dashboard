// ─────────────────────────────────────────────────────────────────────────
// Broker-detail view-model — powers the per-broker drawer that opens from
// the Brokers tab. Slices the broker-memory engine output by `brokerId`
// and groups change-sets by ticker so the UI can render a stock list and
// a chronological timeline of the broker's view on each stock.
//
// Pure data transform; the React hook is at the bottom and mirrors the
// adapter-loading pattern used by `StockBrokerChanges`.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import type {
  BrokerId, Broker, EvidenceSnippet, Iso8601, Rating, ReportId,
  ResearchReport, ReportSummary, Stance, Stock, StockTicker,
} from '../domain'
import { useAdapterQuery, type QueryResult } from './../hooks/useAdapterQuery'
import { buildBrokerMemoryViewModel } from './brokerMemory'
import type { ReportChangeSet, SignificanceBucket } from './brokerMemory/types'
import { indexBy } from './shared'

export interface BrokerDetailStockRow {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly noteCount: number
  readonly lastPublishedAt: Iso8601
  /** Significance bucket of this broker's most recent note on the stock. */
  readonly latestBucket: SignificanceBucket
  /** True if any change in the last 30 days had a major or moderate bucket. */
  readonly hasRecentMove: boolean
}

export interface BrokerTimelineEntry {
  readonly reportId: ReportId
  readonly publishedAt: Iso8601
  readonly title: string
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
  readonly thesis: string
  /** Pre-built one-liner from the change-set (e.g. "Rating Buy → Hold · Target cut 12.5%"). */
  readonly headline: string
  /** Full change-set vs prior comparable; carries deltas, bucket, themes added/dropped. */
  readonly change: ReportChangeSet
}

export interface BrokerDetailViewModel {
  readonly brokerId: BrokerId
  readonly brokerName: string
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly noteCount: number
  readonly stocksCovered: number
  readonly coverageSince: Iso8601 | null
  readonly stocks: readonly BrokerDetailStockRow[]
  /** Newest-first entries keyed by ticker (string for Map ergonomics). */
  readonly timelineByTicker: ReadonlyMap<string, readonly BrokerTimelineEntry[]>
}

export interface BrokerDetailInputs {
  readonly brokerId: BrokerId
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  readonly now?: Date
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function buildBrokerDetailViewModel(inp: BrokerDetailInputs): BrokerDetailViewModel | null {
  const broker = inp.brokers.find((b) => b.id === inp.brokerId)
  if (!broker) return null

  const summaryByReport = indexBy(inp.summaries, (s) => s.reportId as string)
  const reportById = indexBy(inp.reports, (r) => r.id as string)
  const stockByTicker = indexBy(inp.stocks, (s) => s.ticker as string)

  const memory = buildBrokerMemoryViewModel({
    reports: inp.reports,
    summaries: inp.summaries,
    evidence: inp.evidence,
    brokers: inp.brokers,
    stocks: inp.stocks,
    now: inp.now,
  })

  const byTicker = new Map<string, ReportChangeSet[]>()
  for (const c of memory.changeByKey.values()) {
    if (c.currentBrokerId !== inp.brokerId) continue
    if (!c.currentTicker) continue
    const k = c.currentTicker as unknown as string
    const arr = byTicker.get(k) ?? []
    arr.push(c)
    byTicker.set(k, arr)
  }

  const timelineByTicker = new Map<string, readonly BrokerTimelineEntry[]>()
  for (const [ticker, changes] of byTicker) {
    changes.sort((a, b) => b.currentPublishedAt.localeCompare(a.currentPublishedAt))
    const entries = changes.map<BrokerTimelineEntry>((c) => {
      const report = reportById.get(c.currentReportId as string)
      const summary = summaryByReport.get(c.currentReportId as string)
      return {
        reportId: c.currentReportId,
        publishedAt: c.currentPublishedAt,
        title: report?.title ?? '—',
        rating: summary?.rating ?? c.ratingAfter,
        stance: summary?.stance ?? c.stanceAfter ?? 'neutral',
        targetPrice: summary?.targetPrice ?? c.targetAfter,
        targetCurrency: summary?.targetCurrency ?? null,
        thesis: summary?.thesis ?? '',
        headline: c.headline,
        change: c,
      }
    })
    timelineByTicker.set(ticker, entries)
  }

  const nowMs = (inp.now ?? new Date()).getTime()
  const stocks: BrokerDetailStockRow[] = []
  for (const [ticker, entries] of timelineByTicker) {
    const latest = entries[0]
    if (!latest) continue
    const hasRecentMove = entries.some((e) => {
      const bucket = e.change.significance.bucket
      if (bucket !== 'major' && bucket !== 'moderate') return false
      return nowMs - Date.parse(e.publishedAt) <= THIRTY_DAYS_MS
    })
    stocks.push({
      ticker: ticker as unknown as StockTicker,
      stockName: stockByTicker.get(ticker)?.name ?? null,
      noteCount: entries.length,
      lastPublishedAt: latest.publishedAt,
      latestBucket: latest.change.significance.bucket,
      hasRecentMove,
    })
  }
  stocks.sort((a, b) => b.lastPublishedAt.localeCompare(a.lastPublishedAt))

  let coverageSince: Iso8601 | null = null
  for (const entries of timelineByTicker.values()) {
    const oldest = entries[entries.length - 1]
    if (!oldest) continue
    if (coverageSince === null || oldest.publishedAt < coverageSince) {
      coverageSince = oldest.publishedAt
    }
  }

  let noteCount = 0
  for (const entries of timelineByTicker.values()) noteCount += entries.length

  return {
    brokerId: broker.id,
    brokerName: broker.name,
    brokerShortName: broker.shortName,
    brokerColor: broker.brandColor,
    noteCount,
    stocksCovered: timelineByTicker.size,
    coverageSince,
    stocks,
    timelineByTicker,
  }
}

export function useBrokerDetailViewModel(brokerId: BrokerId | null): QueryResult<BrokerDetailViewModel> {
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const stocks  = useAdapterQuery((a, s) => a.listStocks(s),  [])
  const reports = useAdapterQuery(
    (a, s) => a.listResearchReports(s, brokerId ? { brokerIds: [brokerId], limit: 200 } : { limit: 0 }),
    [brokerId as unknown as string ?? ''],
  )

  const reportIds = reports.data?.items.map((r) => r.id as string).join(',') ?? ''
  const summaries = useAdapterQuery<readonly ReportSummary[]>(async (a, s) => {
    const rs = reports.data?.items ?? []
    const results = await Promise.allSettled(rs.map((r) => a.getReportSummary(s, r.id)))
    return results.flatMap<ReportSummary>(
      (r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [],
    )
  }, [reportIds])
  const evidence = useAdapterQuery<readonly EvidenceSnippet[]>(async (a, s) => {
    const rs = reports.data?.items ?? []
    const results = await Promise.allSettled(rs.map((r) => a.listEvidenceSnippets(s, r.id)))
    return results.flatMap<EvidenceSnippet>((r) => r.status === 'fulfilled' ? [...r.value] : [])
  }, [reportIds])

  const data = useMemo<BrokerDetailViewModel | null>(() => {
    if (!brokerId) return null
    if (!brokers.data || !stocks.data || !reports.data || !summaries.data || !evidence.data) return null
    return buildBrokerDetailViewModel({
      brokerId,
      reports: reports.data.items,
      summaries: summaries.data,
      evidence: evidence.data,
      brokers: brokers.data,
      stocks: stocks.data,
    })
  }, [brokerId, brokers.data, stocks.data, reports.data, summaries.data, evidence.data])

  const loading = !brokerId
    ? false
    : brokers.loading || stocks.loading || reports.loading || summaries.loading || evidence.loading
  const error = brokers.error ?? stocks.error ?? reports.error ?? summaries.error ?? evidence.error

  if (!brokerId) return { data: null, loading: false, error: null }
  if (error)     return { data: null, loading: false, error }
  if (loading)   return { data: null, loading: true, error: null }
  return { data, loading: false, error: null }
}
