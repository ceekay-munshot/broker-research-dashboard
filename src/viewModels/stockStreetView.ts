// ─────────────────────────────────────────────────────────────────────────
// Stock Street View — the new shape consumed by the right-side drawer.
//
// The contract is generous: every section can be empty, every field can be
// null. The UI renders placeholders where data is missing rather than
// breaking. Fields that the backend does not extract yet (consensus
// estimates table, per-KPI revisions, quarter view / forward outlook) come
// through as empty arrays / null today; the shape is reserved so when the
// backend starts emitting them, the UI lights up without further work.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import type {
  BrokerId, Iso8601, Rating, ReportId, ReportSummary, ResearchReport,
  Stance, StockTicker,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'
import { useStockDetailViewModel } from './stockDetail'

export interface ConsensusTarget {
  readonly median: number | null
  readonly min: number | null
  readonly max: number | null
  readonly currency: string | null
}

export interface RatingCounts {
  readonly buy: number
  readonly hold: number
  readonly sell: number
  readonly notRated: number
}

export interface EstimateValue {
  readonly period: string
  readonly point: number | null
  readonly rangeLow: number | null
  readonly rangeHigh: number | null
}

export interface EstimateRow {
  readonly metric: string
  readonly values: readonly EstimateValue[]
  readonly cagr2yr: number | null
}

export type QuarterView = 'positive' | 'mixed' | 'negative' | 'in_line'
export type ForwardOutlook = 'bullish' | 'cautiously_optimistic' | 'neutral' | 'cautious' | 'bearish'

export interface BrokerSnapshotRow {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
  readonly quarterView: QuarterView | null
  readonly forwardOutlook: ForwardOutlook | null
}

export interface RevisionDelta {
  readonly metric: string
  readonly direction: 'up' | 'down' | 'unchanged'
  readonly pctText: string | null
}

export interface RevisionEntry {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly deltas: readonly RevisionDelta[]
}

export interface DivergenceCard {
  readonly title: string
  readonly summary: string
  readonly spreadText: string | null
  readonly bullBrokers: readonly string[]
  readonly bearBrokers: readonly string[]
}

export interface BrokerDetail {
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: string | null
  readonly author: string | null
  readonly bullets: readonly string[]
  readonly tags: readonly string[]
  readonly reportId: ReportId
  readonly publishedAt: Iso8601
}

export interface StockStreetView {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly contextLine: string
  readonly brokerCount: number
  readonly ratingCounts: RatingCounts
  readonly consensusTarget: ConsensusTarget
  readonly consensusEstimates: readonly EstimateRow[]
  readonly brokerSnapshot: readonly BrokerSnapshotRow[]
  readonly revisions: readonly RevisionEntry[]
  readonly divergences: readonly DivergenceCard[]
  readonly brokerDetails: readonly BrokerDetail[]
}

// ── Builder inputs ──────────────────────────────────────────────────────

export interface StockStreetViewInputs {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly currency: string | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly brokers: readonly { readonly id: BrokerId; readonly shortName: string; readonly brandColor: string | null }[]
  /** Optional pre-computed divergences from the existing stockDetail VM. */
  readonly divergences?: readonly { readonly topic: string; readonly bullClaims: readonly string[]; readonly bearClaims: readonly string[]; readonly bullBrokers: readonly { readonly name: string }[]; readonly bearBrokers: readonly { readonly name: string }[] }[]
}

// ── Mapping helpers ─────────────────────────────────────────────────────

const REPORT_TYPE_LABEL: Readonly<Record<string, string>> = {
  initiation: 'Coverage initiation',
  update: 'Coverage update',
  flash: 'Flash note',
  earnings_preview: 'Earnings preview',
  earnings_review: 'Result update',
  morning_note: 'Morning note',
  sector_note: 'Sector note',
  deep_dive: 'Deep dive',
  other: 'Note',
}

function ratingBucket(rating: Rating | null): keyof RatingCounts {
  if (rating === 'Buy' || rating === 'Overweight') return 'buy'
  if (rating === 'Hold') return 'hold'
  if (rating === 'Sell' || rating === 'Underweight') return 'sell'
  return 'notRated'
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function quarterViewFromStance(s: Stance): QuarterView {
  return s === 'bullish' ? 'positive' : s === 'bearish' ? 'negative' : 'mixed'
}

function forwardOutlookFromStance(s: Stance): ForwardOutlook {
  return s === 'bullish' ? 'bullish' : s === 'bearish' ? 'bearish' : 'neutral'
}

function formatPctDelta(pct: number): string {
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : ''
  const abs = Math.abs(pct).toFixed(0)
  return `${arrow} ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${abs}%`.trim()
}

// ── Builder ─────────────────────────────────────────────────────────────

export function buildStockStreetView(inp: StockStreetViewInputs): StockStreetView {
  const summaryByReport = indexBy(inp.summaries, (s) => s.reportId as string)
  const brokerById = indexBy(inp.brokers, (b) => b.id as string)

  // Latest report per broker covering this ticker. Reports might list the
  // ticker among many; we still count one note per broker.
  const ticker = inp.ticker as unknown as string
  const ourReports = inp.reports.filter((r) => (r.tickers as readonly StockTicker[]).some((t) => (t as unknown as string) === ticker))
  ourReports.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const latestByBroker = new Map<string, ResearchReport>()
  for (const r of ourReports) {
    const k = r.brokerId as unknown as string
    if (!latestByBroker.has(k)) latestByBroker.set(k, r)
  }

  const latestReport = ourReports[0] ?? null
  const brokerCount = latestByBroker.size

  // Section A — context line
  const latestType = latestReport ? REPORT_TYPE_LABEL[latestReport.reportType] ?? 'Note' : null
  const latestDate = latestReport ? formatDate(latestReport.publishedAt) : null
  const contextLine = [
    latestType,
    brokerCount > 0 ? `${brokerCount} broker${brokerCount === 1 ? '' : 's'}` : null,
    latestDate,
  ].filter(Boolean).join(' · ')

  // Section A — rating counts (from latest summary per broker)
  const counts: Record<keyof RatingCounts, number> = { buy: 0, hold: 0, sell: 0, notRated: 0 }
  for (const r of latestByBroker.values()) {
    const sum = summaryByReport.get(r.id as string)
    counts[ratingBucket(sum?.rating ?? null)] += 1
  }
  const ratingCounts: RatingCounts = counts

  // Section A — consensus target (median/min/max from latest TP per broker)
  const targets: number[] = []
  let currency: string | null = inp.currency
  for (const r of latestByBroker.values()) {
    const sum = summaryByReport.get(r.id as string)
    if (sum?.targetPrice != null) {
      targets.push(sum.targetPrice)
      if (!currency) currency = sum.targetCurrency
    }
  }
  const consensusTarget: ConsensusTarget = targets.length > 0
    ? {
        median: median(targets),
        min: Math.min(...targets),
        max: Math.max(...targets),
        currency,
      }
    : { median: null, min: null, max: null, currency }

  // Section B — consensus estimates. Backend doesn't extract a structured
  // FYxxA/E table yet, so leave empty; the UI renders a placeholder.
  const consensusEstimates: readonly EstimateRow[] = []

  // Section C — Street views at a glance
  const brokerSnapshot: BrokerSnapshotRow[] = [...latestByBroker.values()].map((r) => {
    const broker = brokerById.get(r.brokerId as unknown as string)
    const sum = summaryByReport.get(r.id as string)
    const stance = sum?.stance ?? 'neutral'
    return {
      brokerId: r.brokerId,
      brokerShortName: broker?.shortName ?? '—',
      brokerColor: broker?.brandColor ?? null,
      rating: sum?.rating ?? null,
      targetPrice: sum?.targetPrice ?? null,
      targetCurrency: sum?.targetCurrency ?? currency,
      // Stance is the only directional signal we have today; map to both
      // pills until the backend extracts them separately. Marked nullable
      // in the type so a later backend can return a real one or omit it.
      quarterView: sum ? quarterViewFromStance(stance) : null,
      forwardOutlook: sum ? forwardOutlookFromStance(stance) : null,
    }
  }).sort((a, b) => a.brokerShortName.localeCompare(b.brokerShortName))

  // Section D — revisions. We have target-price prior, not per-KPI deltas;
  // emit a single "TP" delta where a meaningful change exists.
  const revisions: RevisionEntry[] = []
  for (const r of latestByBroker.values()) {
    const sum = summaryByReport.get(r.id as string)
    if (!sum || sum.targetPrice == null || sum.priorTargetPrice == null || sum.priorTargetPrice === 0) continue
    const pct = ((sum.targetPrice - sum.priorTargetPrice) / sum.priorTargetPrice) * 100
    if (Math.abs(pct) < 0.5) continue
    const broker = brokerById.get(r.brokerId as unknown as string)
    revisions.push({
      brokerId: r.brokerId,
      brokerShortName: broker?.shortName ?? '—',
      deltas: [{
        metric: 'TP',
        direction: pct > 0 ? 'up' : 'down',
        pctText: formatPctDelta(pct),
      }],
    })
  }

  // Section E — divergences (mapped from existing stockDetail output)
  const divergences: DivergenceCard[] = (inp.divergences ?? [])
    .filter((d) => d.bullClaims.length + d.bearClaims.length > 0)
    .slice(0, 6)
    .map((d) => {
      const summary = [
        d.bullClaims[0] && `Bulls: ${d.bullClaims[0]}`,
        d.bearClaims[0] && `Bears: ${d.bearClaims[0]}`,
      ].filter(Boolean).join(' • ')
      return {
        title: d.topic,
        summary: summary || 'Brokers disagree on this topic.',
        spreadText: null,
        bullBrokers: d.bullBrokers.map((b) => b.name),
        bearBrokers: d.bearBrokers.map((b) => b.name),
      }
    })

  // Section F — detailed broker views (latest report per broker)
  const brokerDetails: BrokerDetail[] = [...latestByBroker.values()].map((r) => {
    const broker = brokerById.get(r.brokerId as unknown as string)
    const sum = summaryByReport.get(r.id as string)
    const bullets: string[] = (sum?.keyPoints ?? []).slice(0, 6)
    const tags: string[] = (sum?.themes ?? []).slice(0, 3)
    return {
      brokerId: r.brokerId,
      brokerShortName: broker?.shortName ?? '—',
      brokerColor: broker?.brandColor ?? null,
      rating: sum?.rating ?? null,
      stance: sum?.stance ?? 'neutral',
      targetPrice: sum?.targetPrice ?? null,
      priorTargetPrice: sum?.priorTargetPrice ?? null,
      targetCurrency: sum?.targetCurrency ?? currency,
      author: null,
      bullets,
      tags,
      reportId: r.id,
      publishedAt: r.publishedAt,
    }
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  return {
    ticker: inp.ticker,
    stockName: inp.stockName,
    contextLine,
    brokerCount,
    ratingCounts,
    consensusTarget,
    consensusEstimates,
    brokerSnapshot,
    revisions,
    divergences,
    brokerDetails,
  }
}

function formatDate(iso: Iso8601): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// ── React hook ──────────────────────────────────────────────────────────

export function useStockStreetView(ticker: StockTicker | null): QueryResult<StockStreetView> {
  const stockDetail = useStockDetailViewModel(ticker)
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const reports = useAdapterQuery(
    (a, s) => ticker
      ? a.listResearchReports(s, { tickers: [ticker], limit: 200 })
      : Promise.resolve({ items: [], nextCursor: null } as unknown as Awaited<ReturnType<typeof a.listResearchReports>>),
    [ticker as unknown as string ?? ''],
  )
  const reportIds = reports.data?.items.map((r) => r.id as string).join(',') ?? ''
  const summaries = useAdapterQuery<readonly ReportSummary[]>(
    async (a, s) => {
      const rs = reports.data?.items ?? []
      const results = await Promise.allSettled(rs.map((r) => a.getReportSummary(s, r.id)))
      return results.flatMap<ReportSummary>(
        (r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [],
      )
    },
    [reportIds],
  )

  const data = useMemo<StockStreetView | null>(() => {
    if (!ticker) return null
    if (!brokers.data || !reports.data || !summaries.data) return null
    return buildStockStreetView({
      ticker,
      stockName: stockDetail.data?.stockName ?? null,
      currency: stockDetail.data?.currency ?? null,
      reports: reports.data.items,
      summaries: summaries.data,
      brokers: brokers.data.map((b) => ({ id: b.id, shortName: b.shortName, brandColor: b.brandColor })),
      divergences: stockDetail.data?.disagreements,
    })
  }, [ticker, brokers.data, reports.data, summaries.data, stockDetail.data])

  if (!ticker) return { data: null, loading: false, error: null }
  const loading = brokers.loading || reports.loading || summaries.loading || stockDetail.loading
  const error = brokers.error ?? reports.error ?? summaries.error ?? stockDetail.error
  if (error) return { data: null, loading: false, error }
  if (loading || !data) return { data: null, loading: true, error: null }
  return { data, loading: false, error: null }
}
