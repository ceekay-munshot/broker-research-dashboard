// ─────────────────────────────────────────────────────────────────────────
// Worklog view-model builder.
//
// Takes the canonical domain slice (reports + summaries + evidence +
// opinions + closures + catalogs) plus the analyst's filter selection and
// produces a `DailyWorklogViewModel`:
//   1. Explode every (report × ticker) into a raw WorklogItem.
//   2. Enrich each with broker / sector / stock labels.
//   3. Compute divergence flag from ConflictClosure.
//   4. Score priority deterministically.
//   5. Collapse duplicates (broker × ticker × day).
//   6. Apply filters.
//   7. Group + sort.
//   8. Compute today's daily summary from the *pre-filter* canonical set.
//
// Pure transform. No React, no adapter, no fetch.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Broker, BrokerEmail, BrokerStockOpinion, EvidenceSnippet, ResearchReport,
  ReportSummary, Sector, Stock, BrokerId, StockTicker,
  CalibrationSnapshot, PostEventReview,
} from '../../domain'
import type { ConflictClosure } from '../../engine/types'
import { indexBy, groupBy } from '../shared'
import type { PortfolioOverlay } from '../portfolio/types'
import type {
  DailyWorklogSummary, DailyWorklogViewModel, WorklogFiltersState, WorklogGroup,
  WorklogItem, WorklogOrigin, WorklogBookOverlay, WorklogAdaptiveAnnotation,
} from './types'
import { scoreWorklogItem } from './priority'
import { dedupeWorklogItems } from './dedupe'
import { buildBrokerMemoryViewModel } from '../brokerMemory/builder'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../../engine'

export interface WorklogBuilderInputs {
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly brokerEmails: readonly BrokerEmail[]
  readonly brokers: readonly Broker[]
  readonly sectors: readonly Sector[]
  readonly stocks: readonly Stock[]
  readonly filters: WorklogFiltersState
  /** Anchor for "today" + recency scoring. Defaults to `new Date()`. */
  readonly now?: Date
  /** Resource-level degradation notes captured by the caller. */
  readonly degradations?: readonly string[]
  /** Portfolio overlay (Module 18). When provided and configured, every
   *  worklog item gets a `book` decoration and the bookFilter / bookFirst
   *  filter knobs apply. */
  readonly portfolio?: PortfolioOverlay
  /** Calibration snapshot (Module 20). Drives Module-23 adaptive ranking
   *  per-broker / per-alert-kind nudges. */
  readonly calibration?: CalibrationSnapshot | null
  /** Post-event reviews (Module 22). Drives event-driven correctness
   *  contributions to the adaptive-ranking adjustment. */
  readonly postEventReviews?: readonly PostEventReview[] | null
}

export function buildDailyWorklogViewModel(inputs: WorklogBuilderInputs): DailyWorklogViewModel {
  const now = inputs.now ?? new Date()

  const brokerById  = indexBy(inputs.brokers,  (b) => b.id as string)
  const sectorById  = indexBy(inputs.sectors,  (s) => s.id as string)
  const stockByTkr  = indexBy(inputs.stocks,   (s) => s.ticker as string)
  const summaryByR  = indexBy(inputs.summaries, (s) => s.reportId as string)
  const emailById   = indexBy(inputs.brokerEmails, (e) => e.id as string)
  const evidenceByR = groupBy(inputs.evidence, (e) => e.reportId as string)
  const closureByT  = indexBy(inputs.closures, (c) => c.ticker as string)

  // Broker memory produces change-sets keyed by `${reportId}:${ticker}`
  // — the same key shape as WorklogItem.id, so lookup is O(1).
  const memory = buildBrokerMemoryViewModel({
    reports: inputs.reports,
    summaries: inputs.summaries,
    evidence: inputs.evidence,
    brokers: inputs.brokers,
    stocks: inputs.stocks,
    now,
  })

  // Same-day coverage index: (utcDate, ticker) → set of brokerIds covering
  // that ticker that day. Used by the priority scorer.
  const coverageIdx = new Map<string, Set<BrokerId>>()
  for (const r of inputs.reports) {
    const utcDate = toUtcDate(r.receivedAt)
    for (const t of r.tickers) {
      const k = `${utcDate}|${t}`
      const s = coverageIdx.get(k) ?? new Set<BrokerId>()
      s.add(r.brokerId)
      coverageIdx.set(k, s)
    }
  }

  // ── Step 1 + 2 + 3 + 4: explode + enrich + score ──────────────────────

  const scored: WorklogItem[] = []
  for (const r of inputs.reports) {
    const summary = summaryByR.get(r.id as string) ?? null
    const broker  = brokerById.get(r.brokerId as string) ?? null
    const evidenceCount = evidenceByR.get(r.id as string)?.length ?? 0
    const isMulti = r.tickers.length > 1
    const hasAttachment = r.sourceAttachmentId !== null
    const email = emailById.get(r.sourceEmailId as string) ?? null

    // If the report has no tickers, emit a single anchor-less item so
    // sector-level digests still show up in the worklog.
    const tickers: readonly (StockTicker | null)[] = r.tickers.length === 0 ? [null] : r.tickers

    for (const ticker of tickers) {
      const origin: WorklogOrigin =
        isMulti          ? 'digest_split'
        : hasAttachment  ? 'direct_attachment'
        :                   'direct_body'

      const utcDate = toUtcDate(r.receivedAt)
      const overlapKey = ticker ? `${utcDate}|${ticker}` : ''
      const coveringBrokers = ticker ? coverageIdx.get(overlapKey) ?? new Set() : new Set()
      const sameDayBrokerOverlap = Math.max(0, coveringBrokers.size - 1)

      const closure = ticker ? closureByT.get(ticker as unknown as string) ?? null : null
      const closureSignalsDivergence = !!closure && (
        closure.resultant.state === 'mixed_constructive'
        || closure.resultant.state === 'mixed_cautious'
        || closure.resultant.state === 'outlier_driven'
        || closure.disagreements.length > 0
      )
      // Degraded-mode fallback: when no ConflictClosure is available for
      // this ticker, infer divergence from opinions — any ticker with
      // opposing stances (≥1 bullish AND ≥1 bearish) across brokers
      // counts as divergent.
      const hasDivergence = closure
        ? closureSignalsDivergence
        : ticker
          ? divergenceFromOpinions(inputs.opinions, ticker)
          : false

      const sectorId = r.sectorIds[0] ?? (ticker ? stockByTkr.get(ticker as unknown as string)?.sectorId ?? null : null)
      const sector   = sectorId ? sectorById.get(sectorId as unknown as string) ?? null : null
      const stock    = ticker ? stockByTkr.get(ticker as unknown as string) ?? null : null

      const targetChangeAbs = (summary?.targetPrice ?? null) !== null && (summary?.priorTargetPrice ?? null) !== null
        ? (summary!.targetPrice as number) - (summary!.priorTargetPrice as number)
        : null
      const targetChangePct = targetChangeAbs !== null && summary!.priorTargetPrice! !== 0
        ? (targetChangeAbs / (summary!.priorTargetPrice as number)) * 100
        : null

      const priority = scoreWorklogItem({
        reportType: r.reportType,
        rating: summary?.rating ?? null,
        targetPrice: summary?.targetPrice ?? null,
        priorTargetPrice: summary?.priorTargetPrice ?? null,
        stance: summary?.stance ?? 'neutral',
        origin,
        evidenceCount,
        hasDivergence,
        sameDayBrokerOverlap,
        receivedAt: r.receivedAt,
        now,
      })

      const itemId = ticker ? `${r.id}:${ticker}` : (r.id as unknown as string)
      const change = ticker ? memory.changeByKey.get(itemId) ?? null : null

      // Portfolio overlay decoration. The relevance map is keyed exactly
      // the same as `itemId` so lookup is O(1).
      let book: WorklogBookOverlay | null = null
      if (inputs.portfolio && inputs.portfolio.hasPortfolio) {
        const rel = inputs.portfolio.relevanceByKey.get(itemId)
        if (rel) book = { membership: rel.membership, relevance: rel }
      }

      const item: WorklogItem = {
        id: itemId,
        reportId: r.id,
        ticker: ticker,
        brokerId: r.brokerId,
        brokerName: broker?.name ?? '—',
        brokerShortName: broker?.shortName ?? '—',
        brokerColor: broker?.brandColor ?? null,
        sectorId,
        sectorName: sector?.name ?? null,
        stockName: stock?.name ?? null,
        receivedAt: r.receivedAt,
        publishedAt: r.publishedAt,
        utcDate,
        reportType: r.reportType,
        title: r.title,
        headline: buildHeadline(r.title, ticker, origin, isMulti),
        summaryShort: buildSummaryShort(summary, r.reportType),
        stance: summary?.stance ?? 'neutral',
        rating: summary?.rating ?? null,
        targetPrice: summary?.targetPrice ?? null,
        priorTargetPrice: summary?.priorTargetPrice ?? null,
        targetCurrency: summary?.targetCurrency ?? null,
        targetChangeAbs,
        targetChangePct,
        origin,
        source: {
          parentEmailId: r.sourceEmailId,
          parentSubject: email?.subject ?? null,
          isSplitFromDigest: isMulti,
          collapsedIds: [],
          duplicateCount: 0,
        },
        hasAttachment,
        evidenceCount,
        hasDivergence,
        priority,
        change,
        book,
        adaptive: null, // populated below in a single pass after dedupe.
      }
      scored.push(item)
    }
  }

  // ── Step 5: dedupe. ────────────────────────────────────────────────────
  const { canonical: canonicalAll } = dedupeWorklogItems(scored)

  // ── Step 5b: Module-23 adaptive ranking annotation.
  //
  // We always compute the annotation when calibration data is present —
  // even when the flag is off — so consumers can render compare-mode
  // chips. Sort behavior is gated by the flag below.
  const flags = adaptiveRankingFlags()
  const calibration = inputs.calibration ?? null
  const postEventReviews = inputs.postEventReviews ?? null
  const annotated: readonly WorklogItem[] = calibration
    ? canonicalAll.map((it) => {
        const adjustment = computeRankAdjustment({
          baselineScore: it.priority.score,
          brokerId: it.brokerId,
          alertKind: null,
          catalystType: null,
          calibration,
          postEventReviews,
        })
        const adaptive: WorklogAdaptiveAnnotation = {
          adjustment,
          rankDelta: 0, // computed below after sorting both orderings
          moved: adjustment.delta !== 0,
        }
        return { ...it, adaptive }
      })
    : canonicalAll

  // Compute baseline + adaptive orderings to derive rank deltas.
  const baselineSorted = [...annotated].sort(
    inputs.filters.bookFirst && inputs.portfolio?.hasPortfolio
      ? compareByBookThenPriority
      : compareByPriorityThenRecency,
  )
  const adaptiveSorted = [...annotated].sort(
    inputs.filters.bookFirst && inputs.portfolio?.hasPortfolio
      ? compareByBookThenPriorityAdaptive
      : compareByPriorityThenRecencyAdaptive,
  )
  const baselineIdx = new Map<string, number>()
  baselineSorted.forEach((it, i) => baselineIdx.set(it.id, i))
  const adaptiveIdx = new Map<string, number>()
  adaptiveSorted.forEach((it, i) => adaptiveIdx.set(it.id, i))

  // Re-attach `rankDelta` on each annotation now that we have both orderings.
  const withRankDelta: WorklogItem[] = annotated.map((it) => {
    if (!it.adaptive) return it
    const a = adaptiveIdx.get(it.id) ?? 0
    const b = baselineIdx.get(it.id) ?? 0
    const rankDelta = b - a
    return { ...it, adaptive: { ...it.adaptive, rankDelta, moved: it.adaptive.adjustment.delta !== 0 || rankDelta !== 0 } }
  })

  // ── Step 8a: summary header (from today's *canonical* items, pre-filter).
  const todayKey = toUtcDate(now.toISOString())
  const todaysCanonical = withRankDelta.filter((i) => i.utcDate === todayKey)
  const todaysRaw = scored.filter((i) => i.utcDate === todayKey)
  const summary: DailyWorklogSummary = buildSummary(todayKey, todaysCanonical, todaysRaw)

  // ── Step 6: filters (applied to canonical, not raw). ───────────────────
  const filtered = withRankDelta.filter((it) => passesFilters(it, inputs.filters, now))

  // ── Step 7: grouping + ordering. The adaptive ordering is used only
  //    when the flag is on. Compare chips remain visible regardless.
  const sortFn = flags.enabled
    ? (inputs.filters.bookFirst && inputs.portfolio?.hasPortfolio
        ? compareByBookThenPriorityAdaptive
        : compareByPriorityThenRecencyAdaptive)
    : (inputs.filters.bookFirst && inputs.portfolio?.hasPortfolio
        ? compareByBookThenPriority
        : compareByPriorityThenRecency)
  const sorted = [...filtered].sort(sortFn)
  const groups = groupItems(sorted, inputs.filters.grouping)

  return {
    summary,
    items: sorted,
    groups,
    degradations: inputs.degradations ?? [],
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildHeadline(
  title: string,
  ticker: StockTicker | null,
  origin: WorklogOrigin,
  isMulti: boolean,
): string {
  if (ticker && (origin === 'digest_split' || isMulti)) {
    // Prefix split items with the ticker so the headline is actionable at
    // a glance even when the parent title is generic ("JMFL Morning Brief").
    return `${ticker as unknown as string} — ${title}`
  }
  return title
}

function buildSummaryShort(summary: ReportSummary | null, reportType: string): string {
  if (!summary) return typeLabel(reportType)
  // Prefer thesis if present and short enough; else the first key point.
  const thesis = (summary.thesis ?? '').trim()
  if (thesis.length > 0 && thesis.length <= 180) return thesis
  const firstKey = (summary.keyPoints[0] ?? '').trim()
  if (firstKey.length > 0) return firstKey
  if (thesis.length > 0) return thesis.slice(0, 180).trim() + '…'
  return typeLabel(reportType)
}

function typeLabel(t: string): string {
  return t.replace(/_/g, ' ')
}

function buildSummary(
  utcDate: string,
  canonical: readonly WorklogItem[],
  raw: readonly WorklogItem[],
): DailyWorklogSummary {
  const activeBrokers = new Set(canonical.map((i) => i.brokerId as unknown as string))
  const mentionedStocks = new Set(
    canonical.map((i) => (i.ticker as unknown as string) ?? '').filter(Boolean),
  )
  const ratingChangeItems = canonical.filter((i) =>
    i.rating !== null && i.rating !== 'Not Rated' && i.targetChangeAbs !== null,
  ).length
  const targetChangeItems = canonical.filter((i) => i.targetChangeAbs !== null && i.targetChangeAbs !== 0).length
  const divergenceItems = canonical.filter((i) => i.hasDivergence).length
  const highPriority = canonical.filter((i) => i.priority.bucket === 'high').length

  return {
    utcDate,
    totalItems: canonical.length,
    totalItemsRaw: raw.length,
    highPriority,
    activeBrokers: activeBrokers.size,
    mentionedStocks: mentionedStocks.size,
    ratingChangeItems,
    targetChangeItems,
    divergenceItems,
  }
}

function passesFilters(item: WorklogItem, f: WorklogFiltersState, now: Date): boolean {
  // Date window.
  const nowIso = now.toISOString()
  const nowMs = Date.parse(nowIso)
  const ageDays = (nowMs - Date.parse(item.receivedAt)) / (1000 * 60 * 60 * 24)
  if (f.dateWindow === 'today' && item.utcDate !== toUtcDate(nowIso)) return false
  if (f.dateWindow === 'last3' && ageDays > 3) return false
  if (f.dateWindow === 'last7' && ageDays > 7) return false

  if (f.brokerIds.length > 0 && !f.brokerIds.includes(item.brokerId)) return false
  if (f.tickers.length > 0 && (!item.ticker || !f.tickers.includes(item.ticker))) return false
  if (f.sectorIds.length > 0 && (!item.sectorId || !f.sectorIds.includes(item.sectorId))) return false
  if (f.reportTypes.length > 0 && !f.reportTypes.includes(item.reportType)) return false
  if (f.stances.length > 0 && !f.stances.includes(item.stance)) return false
  if (f.ratings.length > 0 && (item.rating === null || !f.ratings.includes(item.rating))) return false
  if (f.priorityBuckets.length > 0 && !f.priorityBuckets.includes(item.priority.bucket)) return false
  if (f.origins.length > 0 && !f.origins.includes(item.origin)) return false

  if (f.hasTargetChange && (item.targetChangeAbs === null || item.targetChangeAbs === 0)) return false
  if (f.hasDivergence && !item.hasDivergence) return false
  if (f.hasEvidence && item.evidenceCount < 1) return false

  // Book filter — silently no-ops when no overlay attached.
  if (f.bookFilter && f.bookFilter !== 'any') {
    const m = item.book?.membership ?? 'none'
    if (f.bookFilter === 'held' && m !== 'held') return false
    if (f.bookFilter === 'watchlist' && m !== 'watchlist') return false
    if (f.bookFilter === 'book' && m !== 'held' && m !== 'watchlist') return false
    if (f.bookFilter === 'uncovered' && (m === 'held' || m === 'watchlist')) return false
    if (f.bookFilter === 'against') {
      const reasons = item.book?.relevance.reasons ?? []
      if (!reasons.some((r) => r.code === 'pf_against')) return false
    }
  }

  return true
}

function compareByPriorityThenRecency(a: WorklogItem, b: WorklogItem): number {
  const byScore = b.priority.score - a.priority.score
  if (byScore !== 0) return byScore
  return b.receivedAt.localeCompare(a.receivedAt)
}

function compareByBookThenPriority(a: WorklogItem, b: WorklogItem): number {
  const byBook = (b.book?.relevance.score ?? 0) - (a.book?.relevance.score ?? 0)
  if (byBook !== 0) return byBook
  return compareByPriorityThenRecency(a, b)
}

function compareByPriorityThenRecencyAdaptive(a: WorklogItem, b: WorklogItem): number {
  const aScore = a.adaptive ? a.adaptive.adjustment.adjustedScore : a.priority.score
  const bScore = b.adaptive ? b.adaptive.adjustment.adjustedScore : b.priority.score
  const byScore = bScore - aScore
  if (byScore !== 0) return byScore
  return b.receivedAt.localeCompare(a.receivedAt)
}

function compareByBookThenPriorityAdaptive(a: WorklogItem, b: WorklogItem): number {
  const byBook = (b.book?.relevance.score ?? 0) - (a.book?.relevance.score ?? 0)
  if (byBook !== 0) return byBook
  return compareByPriorityThenRecencyAdaptive(a, b)
}

function groupItems(items: readonly WorklogItem[], grouping: WorklogFiltersState['grouping']): readonly WorklogGroup[] {
  if (grouping === 'chronological') {
    // Group by UTC date, descending. Keeps the "today first" feel.
    const map = new Map<string, WorklogItem[]>()
    for (const it of items) {
      const k = it.utcDate
      const bucket = map.get(k) ?? []
      bucket.push(it)
      map.set(k, bucket)
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, its]) => ({ key: k, label: prettyDate(k), items: its }))
  }
  if (grouping === 'broker') {
    const map = new Map<string, WorklogItem[]>()
    for (const it of items) {
      const k = it.brokerId as unknown as string
      const bucket = map.get(k) ?? []
      bucket.push(it)
      map.set(k, bucket)
    }
    return [...map.entries()].map(([k, its]) => ({
      key: k, label: its[0]?.brokerShortName ?? k, items: its,
    })).sort((a, b) => a.label.localeCompare(b.label))
  }
  if (grouping === 'stock') {
    const map = new Map<string, WorklogItem[]>()
    for (const it of items) {
      const k = (it.ticker as unknown as string) ?? '—'
      const bucket = map.get(k) ?? []
      bucket.push(it)
      map.set(k, bucket)
    }
    return [...map.entries()].map(([k, its]) => ({
      key: k, label: k, items: its,
    })).sort((a, b) => a.label.localeCompare(b.label))
  }
  if (grouping === 'book') {
    // Held → watchlist → adjacent → none, in this fixed order.
    const order: readonly { key: string; label: string; pred: (it: WorklogItem) => boolean }[] = [
      { key: 'held',      label: 'In book',     pred: (i) => (i.book?.membership ?? 'none') === 'held' },
      { key: 'watchlist', label: 'Watchlist',   pred: (i) => (i.book?.membership ?? 'none') === 'watchlist' },
      { key: 'adjacent',  label: 'Adjacent',    pred: (i) => (i.book?.membership ?? 'none') === 'adjacent' },
      { key: 'none',      label: 'Not in book', pred: (i) => !i.book || i.book.membership === 'none' },
    ]
    return order
      .map((g) => ({ key: g.key, label: g.label, items: items.filter(g.pred) }))
      .filter((g) => g.items.length > 0)
  }
  // priority
  const order = ['high', 'medium', 'low'] as const
  return order.map((bucket) => {
    const its = items.filter((i) => i.priority.bucket === bucket)
    return { key: bucket, label: bucket.toUpperCase(), items: its }
  }).filter((g) => g.items.length > 0)
}

/** Degraded-mode helper: divergence inferred from broker opinions when no
 *  ConflictClosure is available. A ticker with any bullish + any bearish
 *  opinion is considered divergent. */
function divergenceFromOpinions(
  opinions: readonly BrokerStockOpinion[],
  ticker: StockTicker,
): boolean {
  let hasBull = false, hasBear = false
  for (const o of opinions) {
    if ((o.ticker as unknown as string) !== (ticker as unknown as string)) continue
    if (o.stance === 'bullish') hasBull = true
    if (o.stance === 'bearish') hasBear = true
    if (hasBull && hasBear) return true
  }
  return false
}

export function toUtcDate(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD from YYYY-MM-DDTHH:mm:ss.sssZ
}

function prettyDate(utcDate: string): string {
  // `2026-04-24` → `Fri 24 Apr 2026`
  const d = new Date(`${utcDate}T00:00:00Z`)
  const wday = d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })
  const day  = d.toLocaleDateString('en', { day: '2-digit', timeZone: 'UTC' })
  const mon  = d.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
  const yr   = d.getUTCFullYear()
  return `${wday} ${day} ${mon} ${yr}`
}
