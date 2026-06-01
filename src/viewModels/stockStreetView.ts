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
import type { TargetStats } from '../engine/types'
import { computeTargetStats } from '../engine/stats'
import { OUTLIER_Z_THRESHOLD } from '../engine/conflictClosure'
import { indexBy } from './shared'
import type { BrokerTargetVM, OutlierVM } from './divergence'
import { useStockDetailViewModel } from './stockDetail'
import { REVISIONS_BY_TICKER } from '../mocks/consensusEstimates'
import { BROKER_ESTIMATES_BY_BROKER_TICKER, type BrokerKpiEstimate } from '../mocks/brokerEstimates'

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
  /** The broker's latest report on this stock — clicking the row opens it. */
  readonly reportId: ReportId
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

/** A single broker call on the stock at a point in time — the unit the
 *  calls-over-time chart plots (every call, not just the latest per broker). */
export interface StockCall {
  readonly reportId: ReportId
  readonly publishedAt: Iso8601
  readonly brokerId: BrokerId
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
}

export interface StockStreetView {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly contextLine: string
  readonly brokerCount: number
  readonly ratingCounts: RatingCounts
  readonly consensusTarget: ConsensusTarget
  /** True-scale spread of the Street's price targets — feeds the interactive
   *  target-price line in the drawer header. */
  readonly targetStats: TargetStats
  /** One entry per covering broker that issued a target, carrying its call —
   *  the dots the target-price line plots, coloured by Buy / Hold / Sell. */
  readonly brokerTargets: readonly BrokerTargetVM[]
  /** Brokers whose target sits far from the Street (z-score), so the line can
   *  flag them. Same threshold the disagreements engine uses. */
  readonly targetOutliers: readonly OutlierVM[]
  readonly consensusEstimates: readonly EstimateRow[]
  readonly brokerSnapshot: readonly BrokerSnapshotRow[]
  /** Every individual call over time (not just the latest per broker) — the
   *  points on the calls-over-time chart. */
  readonly calls: readonly StockCall[]
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
  /** ISO date used as the anchor for FY label resolution. Typically the
   *  stock's latest note `publishedAt`. Falls back to `now`, then real
   *  wall-clock when both are absent. */
  readonly asOfDate?: string
  /** Test/storybook override for the anchor date. Used only when
   *  `asOfDate` is absent. */
  readonly now?: Date
}

// ── Mapping helpers ─────────────────────────────────────────────────────

const REPORT_TYPE_LABEL: Readonly<Record<string, string>> = {
  initiation: 'Coverage initiation',
  update: 'Coverage update',
  flash: 'Flash note',
  earnings_preview: 'Pre-results review',
  earnings_review: 'Earnings update',
  management_meeting: 'Management meeting',
  field_visit: 'Field visit',
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

/** Target-price outliers for the drawer's line — mirrors the disagreements
 *  engine's `target_price_z` rule: only meaningful with ≥3 brokers and a real
 *  spread; a broker more than OUTLIER_Z_THRESHOLD standard deviations from the
 *  mean target is flagged. Returns the minimal `OutlierVM` the scale reads
 *  (brokerId, brokerName, signed z-score). */
function detectTargetOutliers(
  brokerTargets: readonly BrokerTargetVM[],
  stats: TargetStats,
): OutlierVM[] {
  if (brokerTargets.length < 3 || stats.mean === null || stats.stdev === null || stats.stdev <= 0) {
    return []
  }
  const out: OutlierVM[] = []
  for (const b of brokerTargets) {
    const z = (b.targetPrice - stats.mean) / stats.stdev
    if (Math.abs(z) <= OUTLIER_Z_THRESHOLD) continue
    out.push({
      brokerId: b.brokerId,
      brokerName: b.brokerName,
      direction: z > 0 ? 'bullish' : 'bearish',
      reasons: ['Target far from the consensus'],
      targetZScore: z,
      notes: '',
    })
  }
  return out
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

/** Mid-May cutover for treating an Indian FY as "reported actual".
 *  Demo heuristic — Indian companies typically file Q4/annual results
 *  through April and into mid-May; a single month threshold is good
 *  enough for label rendering. Tighten later if real cutover matters. */
const DEMO_FY_RESULTS_REPORTED_FROM_MONTH = 5 // May

/** Latest reported Indian FY as a 2-digit number relative to `now`.
 *  Local-time getters so the user's clock (e.g. IST) doesn't flip the
 *  result when new Date() lands the day before/after in UTC. */
function currentBaseFY(now: Date): number {
  const y = now.getFullYear() % 100
  const m = now.getMonth() + 1 // 1-12
  return m >= DEMO_FY_RESULTS_REPORTED_FROM_MONTH ? y : y - 1
}

function periodLabel(baseFY: number, yearOffset: number): string {
  const fy = baseFY + yearOffset
  const kind = yearOffset <= 0 ? 'A' : 'E'
  const fy2 = ((fy % 100) + 100) % 100  // handle negative offsets too
  return `FY${fy2.toString().padStart(2, '0')}${kind}`
}

/** Percentage / ratio metrics where CAGR is meaningless (you don't take a
 *  CAGR over a margin). Pattern is loose on purpose so the demo data
 *  doesn't need to declare its metric kind explicitly. */
function isPercentageMetric(metric: string): boolean {
  return /\(%\)|margin|ratio|\bbps\b/i.test(metric)
}

/** Aggregate per-broker KPI estimates into consensus rows. For every
 *  (metric, yearOffset) tuple any covering broker mentioned, compute
 *  median (point) plus min/max (range when ≥ 2 brokers agree on the
 *  same metric/period). Metric ordering reflects insertion order of
 *  the brokers we touch — typically a P&L-ish flow. */
function aggregateBrokerEstimates(
  brokerIds: readonly BrokerId[],
  ticker: string,
  baseFY: number,
): readonly EstimateRow[] {
  // Preserve insertion order across both metric and yearOffset.
  const byMetric = new Map<string, Map<number, number[]>>()
  for (const bId of brokerIds) {
    const key = `${bId as unknown as string}|${ticker}`
    const items: readonly BrokerKpiEstimate[] = BROKER_ESTIMATES_BY_BROKER_TICKER[key] ?? []
    for (const e of items) {
      let yearMap = byMetric.get(e.metric)
      if (!yearMap) {
        yearMap = new Map<number, number[]>()
        byMetric.set(e.metric, yearMap)
      }
      const arr = yearMap.get(e.yearOffset) ?? []
      arr.push(e.value)
      yearMap.set(e.yearOffset, arr)
    }
  }

  const rows: EstimateRow[] = []
  for (const [metric, yearMap] of byMetric) {
    const offsets = [...yearMap.keys()].sort((a, b) => a - b)
    const values: EstimateValue[] = offsets.map((yo) => {
      const xs = yearMap.get(yo)!
      const point = median(xs)
      const hasSpread = xs.length > 1
      return {
        period: periodLabel(baseFY, yo),
        point,
        rangeLow: hasSpread ? Math.min(...xs) : null,
        rangeHigh: hasSpread ? Math.max(...xs) : null,
      }
    })
    let cagr2yr: number | null = null
    if (!isPercentageMetric(metric)) {
      const m0 = median(yearMap.get(0) ?? [])
      const m2 = median(yearMap.get(2) ?? [])
      if (m0 != null && m2 != null && m0 > 0) {
        cagr2yr = (Math.pow(m2 / m0, 1 / 2) - 1) * 100
      }
    }
    rows.push({ metric, values, cagr2yr })
  }
  return rows
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

  // Section B — consensus estimates. Built by aggregating each covering
  // broker's KPI estimates: union all metrics they mention, compute
  // median (point) + min/max (range) per (metric, yearOffset). FY column
  // labels resolve from the stock's latest note date so an older note
  // still reads correctly.
  const anchor = inp.asOfDate ? new Date(inp.asOfDate) : (inp.now ?? new Date())
  const baseFY = currentBaseFY(anchor)
  const consensusEstimates = aggregateBrokerEstimates(
    [...latestByBroker.values()].map((r) => r.brokerId),
    ticker,
    baseFY,
  )

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
      reportId: r.id,
    }
  }).sort((a, b) => a.brokerShortName.localeCompare(b.brokerShortName))

  // Section A (cont.) — target-price line. One dot per broker that issued a
  // target, carrying its call so the line can colour Buy / Hold / Sell. Stats
  // and outliers come off the SAME targets that drive the consensus number
  // above, so the rail and the headline always agree.
  const brokerTargets: BrokerTargetVM[] = brokerSnapshot
    .filter((r) => r.targetPrice != null)
    .map((r) => ({
      brokerId: r.brokerId as unknown as string,
      brokerName: r.brokerShortName,
      targetPrice: r.targetPrice as number,
      rating: r.rating,
    }))
  const targetStats = computeTargetStats(brokerTargets.map((b) => b.targetPrice))
  const targetOutliers = detectTargetOutliers(brokerTargets, targetStats)

  // Section D — revisions. Prefer the structured per-broker fixture when
  // available (same shape the backend will emit). Fall back to a single
  // "TP" delta derived from priorTargetPrice on the summary.
  const fixtureRevisions = REVISIONS_BY_TICKER[ticker as unknown as string]
  const revisions: RevisionEntry[] = fixtureRevisions
    ? [...fixtureRevisions]
    : (() => {
        const derived: RevisionEntry[] = []
        for (const r of latestByBroker.values()) {
          const sum = summaryByReport.get(r.id as string)
          if (!sum || sum.targetPrice == null || sum.priorTargetPrice == null || sum.priorTargetPrice === 0) continue
          const pct = ((sum.targetPrice - sum.priorTargetPrice) / sum.priorTargetPrice) * 100
          if (Math.abs(pct) < 0.5) continue
          const broker = brokerById.get(r.brokerId as unknown as string)
          derived.push({
            brokerId: r.brokerId,
            brokerShortName: broker?.shortName ?? '—',
            deltas: [{
              metric: 'TP',
              direction: pct > 0 ? 'up' : 'down',
              pctText: formatPctDelta(pct),
            }],
          })
        }
        return derived
      })()

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

  // Every call over time (all reports for the ticker, not deduped to the
  // latest per broker) — the points the calls-over-time chart plots.
  const calls: StockCall[] = ourReports.map((r) => {
    const broker = brokerById.get(r.brokerId as unknown as string)
    const sum = summaryByReport.get(r.id as string)
    return {
      reportId: r.id,
      publishedAt: r.publishedAt,
      brokerId: r.brokerId,
      brokerShortName: broker?.shortName ?? '—',
      brokerColor: broker?.brandColor ?? null,
      rating: sum?.rating ?? null,
      targetPrice: sum?.targetPrice ?? null,
      targetCurrency: sum?.targetCurrency ?? currency,
    }
  })

  return {
    ticker: inp.ticker,
    stockName: inp.stockName,
    contextLine,
    brokerCount,
    ratingCounts,
    consensusTarget,
    targetStats,
    brokerTargets,
    targetOutliers,
    consensusEstimates,
    brokerSnapshot,
    calls,
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
    // Anchor FY label resolution to the stock's latest note — so a note
    // from 2025 reads "FY25A/26E/27E" even when opened in 2027.
    const latestPublishedAt = reports.data.items
      .map((r) => r.publishedAt)
      .sort()
      .at(-1)
    return buildStockStreetView({
      ticker,
      stockName: stockDetail.data?.stockName ?? null,
      currency: stockDetail.data?.currency ?? null,
      reports: reports.data.items,
      summaries: summaries.data,
      brokers: brokers.data.map((b) => ({ id: b.id, shortName: b.shortName, brandColor: b.brandColor })),
      divergences: stockDetail.data?.disagreements,
      asOfDate: latestPublishedAt,
    })
  }, [ticker, brokers.data, reports.data, summaries.data, stockDetail.data])

  if (!ticker) return { data: null, loading: false, error: null }
  const loading = brokers.loading || reports.loading || summaries.loading || stockDetail.loading
  const error = brokers.error ?? reports.error ?? summaries.error ?? stockDetail.error
  if (error) return { data: null, loading: false, error }
  if (loading || !data) return { data: null, loading: true, error: null }
  return { data, loading: false, error: null }
}
