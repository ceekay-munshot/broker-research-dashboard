// ─────────────────────────────────────────────────────────────────────────
// Broker-memory builder — orchestrates linker → comparator → significance
// and rolls the per-report change-sets into stock-level and broker-level
// aggregates.
//
// Pure function. Consumers (Daily Worklog, By Stock, By Broker) all call
// this once with the canonical slice and then index into the resulting
// maps.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Broker, BrokerId, EvidenceSnippet, ResearchReport, ReportSummary,
  Stock, StockTicker,
} from '../../domain'
import { groupBy, indexBy } from '../shared'
import type {
  BrokerMemoryViewModel, BrokerRecentChange, BrokerRecentChangesSummary,
  ReportChangeSet, StockBrokerChangesSummary, StockBrokerLatestChange,
} from './types'
import { linkReportHistory } from './linker'
import { compareLinkedPair } from './comparator'

export interface BrokerMemoryInputs {
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  /** Anchor for "recent" windows on the per-broker summary. Defaults to now. */
  readonly now?: Date
  /** Sliding window (days) for `BrokerRecentChangesSummary`. Default 14. */
  readonly brokerWindowDays?: number
}

export function buildBrokerMemoryViewModel(inp: BrokerMemoryInputs): BrokerMemoryViewModel {
  const now = inp.now ?? new Date()
  const windowDays = inp.brokerWindowDays ?? 14
  const degradations: string[] = []

  const summaryByReport = indexBy(inp.summaries, (s) => s.reportId as string)
  const evidenceByReport = groupBy(inp.evidence, (e) => e.reportId as string)
  const brokerById = indexBy(inp.brokers, (b) => b.id as string)
  const stockByTicker = indexBy(inp.stocks, (s) => s.ticker as string)

  if (inp.summaries.length === 0) degradations.push('No report summaries — comparison degrades to metadata (type/recency) only.')
  if (inp.evidence.length === 0)  degradations.push('No evidence — evidence-delta signal unavailable.')

  // ── Link + compare ───────────────────────────────────────────────────
  const linked = linkReportHistory(inp.reports)
  const changeSets: ReportChangeSet[] = linked.map((pair) => compareLinkedPair({
    link: pair,
    currentSummary: summaryByReport.get(pair.current.id as string) ?? null,
    priorSummary:   pair.prior ? summaryByReport.get(pair.prior.id as string) ?? null : null,
    currentEvidenceCount: (evidenceByReport.get(pair.current.id as string) ?? []).length,
    priorEvidenceCount:   pair.prior ? (evidenceByReport.get(pair.prior.id as string) ?? []).length : 0,
  }))

  const changeByKey = new Map<string, ReportChangeSet>()
  for (const c of changeSets) changeByKey.set(c.key, c)

  // ── Stock-level aggregates ───────────────────────────────────────────
  // For each ticker, group by broker and pick the most recent change-set
  // per broker. "Latest change" is always the most recent report's
  // change-set, which already embeds the comparison against its prior.
  const byTicker = new Map<string, StockBrokerLatestChange[]>()
  const byTickerBroker = new Map<string, ReportChangeSet>()
  for (const c of changeSets) {
    if (!c.currentTicker) continue
    const tickerKey = c.currentTicker as unknown as string
    const tbKey = `${tickerKey}|${c.currentBrokerId as unknown as string}`
    const existing = byTickerBroker.get(tbKey)
    if (!existing || existing.currentPublishedAt < c.currentPublishedAt) {
      byTickerBroker.set(tbKey, c)
    }
  }
  for (const [tbKey, change] of byTickerBroker) {
    const [tickerKey] = tbKey.split('|')
    const broker = brokerById.get(change.currentBrokerId as string) ?? null
    const entry: StockBrokerLatestChange = {
      brokerId: change.currentBrokerId,
      brokerShortName: broker?.shortName ?? '—',
      brokerColor: broker?.brandColor ?? null,
      latestReportId: change.currentReportId,
      latestPublishedAt: change.currentPublishedAt,
      priorReportId: change.priorReportId,
      priorPublishedAt: change.priorPublishedAt,
      change,
    }
    const bucket = byTicker.get(tickerKey!) ?? []
    bucket.push(entry)
    byTicker.set(tickerKey!, bucket)
  }

  const stockSummaries = new Map<string, StockBrokerChangesSummary>()
  for (const [tickerKey, entries] of byTicker) {
    entries.sort(rankByMagnitude)
    const stock = stockByTicker.get(tickerKey) ?? null
    stockSummaries.set(tickerKey, {
      ticker: tickerKey as unknown as StockTicker,
      stockName: stock?.name ?? null,
      brokerEntries: entries,
      majorCount:         entries.filter((e) => e.change.significance.bucket === 'major').length,
      moderateCount:      entries.filter((e) => e.change.significance.bucket === 'moderate').length,
      unchangedCount:     entries.filter((e) => e.change.significance.bucket === 'minor').length,
      firstCoverageCount: entries.filter((e) => e.change.significance.bucket === 'first_coverage').length,
    })
  }

  // ── Broker-level aggregates (windowed) ───────────────────────────────
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const cutoff = now.getTime() - windowMs
  const brokerSummaries = new Map<string, BrokerRecentChangesSummary>()

  const byBroker = groupBy(
    changeSets.filter((c) => c.currentTicker && Date.parse(c.currentPublishedAt) >= cutoff),
    (c) => c.currentBrokerId as unknown as string,
  )

  for (const [brokerKey, list] of byBroker) {
    const broker = brokerById.get(brokerKey) ?? null
    const changes: BrokerRecentChange[] = list.map((c) => ({
      ticker: c.currentTicker!,
      stockName: stockByTicker.get(c.currentTicker as unknown as string)?.name ?? null,
      reportId: c.currentReportId,
      receivedAt: c.currentPublishedAt,
      change: c,
    }))

    const withTp = changes.filter((c) => c.change.targetChangePct !== null && c.change.targetChangePct !== 0)
    const biggestTargetRaises = [...withTp]
      .filter((c) => c.change.targetChangePct! > 0)
      .sort((a, b) => (b.change.targetChangePct! - a.change.targetChangePct!))
      .slice(0, 3)
    const biggestTargetCuts = [...withTp]
      .filter((c) => c.change.targetChangePct! < 0)
      .sort((a, b) => (a.change.targetChangePct! - b.change.targetChangePct!))
      .slice(0, 3)

    const ratingChanges = changes.filter((c) => c.change.ratingChanged)
    const majorViewChanges = changes.filter((c) => c.change.significance.bucket === 'major')
    const repeatedThesis = changes.filter((c) =>
      c.change.significance.bucket === 'minor' && c.change.priorReportId !== null,
    )

    brokerSummaries.set(brokerKey, {
      brokerId: brokerKey as unknown as BrokerId,
      brokerShortName: broker?.shortName ?? '—',
      biggestTargetRaises,
      biggestTargetCuts,
      ratingChanges,
      majorViewChanges,
      repeatedThesis,
      totalCompared: changes.length,
      windowDays,
    })
  }

  return { changeByKey, stockSummaries, brokerSummaries, degradations }
}

// Rank per-broker change-set entries on a stock page: majors first,
// then moderates, then most-recent-first within each bucket.
function rankByMagnitude(a: StockBrokerLatestChange, b: StockBrokerLatestChange): number {
  const rank: Readonly<Record<string, number>> = {
    major: 4, moderate: 3, minor: 2, first_coverage: 1,
  }
  const ba = rank[a.change.significance.bucket] ?? 0
  const bb = rank[b.change.significance.bucket] ?? 0
  if (ba !== bb) return bb - ba
  return b.latestPublishedAt.localeCompare(a.latestPublishedAt)
}
