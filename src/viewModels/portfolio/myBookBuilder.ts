// ─────────────────────────────────────────────────────────────────────────
// My Book view-model builder.
//
// Takes the canonical research slice + the portfolio snapshot + the
// portfolio overlay (relevance + coverage), and produces the view-model
// that the My Book tab renders.
//
// Pure transform. No React, no adapter, no fetch.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Broker, BrokerStockOpinion, ReportSummary, ResearchReport,
  Stock, PortfolioSnapshot, CalibrationSnapshot, PostEventReview,
} from '../../domain'
import type { ConflictClosure } from '../../engine/types'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../../engine'
import { buildPortfolioOverlay } from './overlay'
import type {
  MyBookActivityRow, MyBookPositionCardViewModel, MyBookSection,
  MyBookViewModel, PortfolioOverlay,
} from './types'
import { indexBy } from '../shared'
import type { AdaptiveAnnotation } from '../adaptiveRanking'

const DAY_MS = 86400e3

export interface MyBookInputs {
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  readonly now?: Date
  readonly degradations?: readonly string[]
  /** Module 23 — calibration snapshot drives adaptive-ranking adjustments. */
  readonly calibration?: CalibrationSnapshot | null
  /** Module 23 — post-event reviews feed catalyst-type and broker-event sources. */
  readonly postEventReviews?: readonly PostEventReview[] | null
}

export interface MyBookBuildOutput {
  readonly vm: MyBookViewModel
  readonly overlay: PortfolioOverlay
}

export function buildMyBookViewModel(inputs: MyBookInputs): MyBookBuildOutput {
  const now = inputs.now ?? new Date()
  const overlay = buildPortfolioOverlay({
    snapshot: inputs.snapshot,
    reports: inputs.reports,
    summaries: inputs.summaries,
    opinions: inputs.opinions,
    closures: inputs.closures,
    stocks: inputs.stocks,
    now,
  })

  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const stockByTicker = indexBy(inputs.stocks, (s) => s.ticker as string)

  if (!overlay.hasPortfolio) {
    return {
      overlay,
      vm: {
        hasPortfolio: false,
        snapshotAsOf: inputs.snapshot?.asOf ?? null,
        headline: emptyHeadline(),
        todayOnBook:          emptySection('Today on the book',           'Reports landed today on held or watchlist names.', ''),
        significantChanges:   emptySection('Significant broker changes',   'Material rating or target moves on positions in the past 7 days.', ''),
        unresolvedDivergence: emptySection('Unresolved divergence on book', 'Held / watchlist names where the Street disagrees.', ''),
        watchlistFresh:       emptySection('Watchlist with fresh research', 'Recent broker activity on names you are tracking.', ''),
        staleCoverage:        emptySection('Stale or thin coverage',         'Important positions with stale or single-broker coverage.', ''),
        positions:            [],
        degradations:         inputs.degradations ?? [],
      },
    }
  }

  // Build per-position cards.
  const positions = (inputs.snapshot!.positions.map((p) => p.ticker as string))
    .concat(inputs.snapshot!.watchlist.map((w) => w.ticker as string))
  const positionCards: MyBookPositionCardViewModel[] = []

  for (const tk of positions) {
    const cov = overlay.coverageByTicker.get(tk)
    if (!cov) continue
    const reportsThisTicker = inputs.reports
      .filter((r) => r.tickers.some((t) => (t as string) === tk))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

    const headlineReport = reportsThisTicker[0] ?? null
    const headlineKey = headlineReport ? `${headlineReport.id}:${tk}` : null
    const headlineRelevance = headlineKey ? overlay.relevanceByKey.get(headlineKey) ?? null : null

    const note = inputs.snapshot!.positions.find((p) => (p.ticker as string) === tk)?.note
              ?? inputs.snapshot!.watchlist.find((w) => (w.ticker as string) === tk)?.note
              ?? null

    positionCards.push({
      ticker: cov.ticker,
      stockName: stockByTicker.get(tk)?.name ?? cov.stockName,
      membership: cov.membership === 'watchlist' ? 'watchlist' : 'held',
      direction: cov.direction,
      conviction: cov.conviction,
      weightPct: cov.weightPct,
      note,
      reportsLast24h: cov.activity.reportsLast24h,
      reportsLast7d: cov.activity.reportsLast7d,
      distinctBrokersLast7d: cov.activity.distinctBrokersLast7d,
      daysSinceLastReport: cov.activity.daysSinceLastReport,
      hasUnresolvedDivergence: cov.hasUnresolvedDivergence,
      hasOutlier: cov.hasOutlier,
      recentChangeBucket: cov.recentChangeBucket,
      riskFlags: cov.riskFlags,
      headlineRelevance,
      headlineReportId: headlineReport?.id ?? null,
    })
  }

  // Sort: held by weight desc, then watchlist alpha.
  positionCards.sort((a, b) => {
    if (a.membership !== b.membership) return a.membership === 'held' ? -1 : 1
    if (a.membership === 'held') return (b.weightPct ?? 0) - (a.weightPct ?? 0)
    return (a.ticker as string).localeCompare(b.ticker as string)
  })

  // Build activity rows from relevance map for bookable items only.
  const todayKey = now.toISOString().slice(0, 10)
  const todayRows: MyBookActivityRow[] = []
  const significantRows: MyBookActivityRow[] = []
  const watchlistFresh: MyBookActivityRow[] = []
  let reportsOnBookToday = 0
  let reportsOnBookLast7d = 0

  for (const r of inputs.reports) {
    for (const t of r.tickers) {
      const tk = t as string
      const ctx = overlay.contextByTicker.get(tk)
      if (!ctx) continue
      if (ctx.membership === 'none') continue
      const relevance = overlay.relevanceByKey.get(`${r.id}:${tk}`)
      if (!relevance || relevance.bucket === 'none') continue

      const summary = summaryByReport.get(r.id as string) ?? null
      const broker = brokerById.get(r.brokerId as string) ?? null
      const ageMs = Date.parse(now.toISOString()) - Date.parse(r.receivedAt)

      if (ageMs <= 7 * DAY_MS) reportsOnBookLast7d++
      if (r.receivedAt.slice(0, 10) === todayKey) reportsOnBookToday++

      const row: MyBookActivityRow = {
        reportId: r.id,
        ticker: t,
        brokerId: r.brokerId,
        brokerShortName: broker?.shortName ?? '—',
        brokerColor: broker?.brandColor ?? null,
        headline: r.tickers.length > 1 ? `${tk} — ${r.title}` : r.title,
        publishedAt: r.publishedAt,
        receivedAt: r.receivedAt,
        relevance,
        stance: summary?.stance ?? 'neutral',
        rating: summary?.rating ?? null,
        targetPrice: summary?.targetPrice ?? null,
        targetCurrency: summary?.targetCurrency ?? null,
        priorTargetPrice: summary?.priorTargetPrice ?? null,
        membership: (ctx.membership === 'held' || ctx.membership === 'watchlist' || ctx.membership === 'adjacent') ? ctx.membership : 'adjacent',
        adaptive: null, // populated below in the adaptive-ranking pass.
      }

      if (ageMs <= 1 * DAY_MS && (ctx.membership === 'held' || ctx.membership === 'watchlist')) {
        todayRows.push(row)
      }
      const isSig = !!relevance.reasons.find(
        (rs) => rs.code === 'sig_target' || rs.code === 'sig_type' || rs.code === 'pf_against',
      )
      if (isSig && ageMs <= 7 * DAY_MS && ctx.membership === 'held') {
        significantRows.push(row)
      }
      if (ageMs <= 7 * DAY_MS && ctx.membership === 'watchlist') {
        watchlistFresh.push(row)
      }
    }
  }

  // ── Module 23 — adaptive ranking annotation + sort ─────────────────────
  // Annotate every row with a calibration-aware `adaptive` adjustment so the
  // UI can render compare chips. The adaptive sort is gated by the feature
  // flag — when off, the rows fall back to the baseline relevance ordering
  // bit-for-bit. Compare chips remain visible in either mode.
  const flags = adaptiveRankingFlags()
  const calibration = inputs.calibration ?? null
  const postEventReviews = inputs.postEventReviews ?? null
  const annotateRow = (row: MyBookActivityRow): MyBookActivityRow => {
    if (!calibration) return row
    const adjustment = computeRankAdjustment({
      baselineScore: row.relevance.score,
      brokerId: row.brokerId,
      alertKind: null,
      catalystType: null,
      calibration,
      postEventReviews,
    })
    const adaptive: AdaptiveAnnotation = {
      adjustment,
      rankDelta: 0,
      moved: adjustment.delta !== 0,
    }
    return { ...row, adaptive }
  }
  const annotatedToday = todayRows.map(annotateRow)
  const annotatedSignificant = significantRows.map(annotateRow)
  const annotatedWatchlist = watchlistFresh.map(annotateRow)

  const finalToday = sortAndStampRankDelta(annotatedToday, flags.enabled)
  const finalSignificant = sortAndStampRankDelta(annotatedSignificant, flags.enabled)
  const finalWatchlist = sortAndStampRankDelta(annotatedWatchlist, flags.enabled)
  todayRows.length = 0;          for (const r of finalToday)        todayRows.push(r)
  significantRows.length = 0;    for (const r of finalSignificant)  significantRows.push(r)
  watchlistFresh.length = 0;     for (const r of finalWatchlist)    watchlistFresh.push(r)

  // Risk-flagged positions for stale/thin coverage and unresolved divergence.
  const unresolvedCards = positionCards.filter((c) => c.hasUnresolvedDivergence)
  const staleCards = positionCards.filter(
    (c) => c.riskFlags.includes('stale_coverage')
        || c.riskFlags.includes('single_broker_coverage')
        || c.riskFlags.includes('no_coverage'),
  )

  const heldCount = inputs.snapshot!.positions.length
  const watchlistCount = inputs.snapshot!.watchlist.length
  const criticalToday = todayRows.filter((r) => r.relevance.bucket === 'critical' || r.relevance.bucket === 'high').length

  const vm: MyBookViewModel = {
    hasPortfolio: true,
    snapshotAsOf: inputs.snapshot!.asOf,
    headline: {
      heldCount,
      watchlistCount,
      grossExposurePct: inputs.snapshot!.totalGrossExposurePct,
      reportsOnBookToday,
      reportsOnBookLast7d,
      criticalToday,
      staleCoverageCount: staleCards.length,
      singleBrokerCount: positionCards.filter((c) => c.distinctBrokersLast7d <= 1 && c.membership === 'held').length,
      unresolvedDivergenceCount: unresolvedCards.length,
    },
    todayOnBook: {
      title: 'Today on the book',
      subtitle: 'Held or watchlist names with new research in the last 24h, ranked by relevance.',
      items: todayRows.slice(0, 12),
      emptyText: 'No new research on the book today. Try widening the worklog window.',
    },
    significantChanges: {
      title: 'Significant broker changes (7d)',
      subtitle: 'Material rating or target moves, or broker views opposing your position.',
      items: significantRows.slice(0, 12),
      emptyText: 'No significant changes on the book in the past 7 days.',
    },
    unresolvedDivergence: {
      title: 'Unresolved divergence on the book',
      subtitle: 'Held names where the Street disagrees or an outlier is active.',
      items: unresolvedCards,
      emptyText: 'The Street is aligned across your held names. (Closures may be unavailable.)',
    },
    watchlistFresh: {
      title: 'Watchlist with fresh research',
      subtitle: 'Names you are tracking with broker activity in the past 7 days.',
      items: watchlistFresh.slice(0, 10),
      emptyText: 'No fresh broker research on watchlist names this week.',
    },
    staleCoverage: {
      title: 'Stale or thin coverage',
      subtitle: 'Important positions with no recent broker note or only one broker on the name.',
      items: staleCards,
      emptyText: 'Coverage looks healthy across the book.',
    },
    positions: positionCards,
    degradations: inputs.degradations ?? [],
  }
  return { vm, overlay }
}

function emptyHeadline(): MyBookViewModel['headline'] {
  return {
    heldCount: 0,
    watchlistCount: 0,
    grossExposurePct: null,
    reportsOnBookToday: 0,
    reportsOnBookLast7d: 0,
    criticalToday: 0,
    staleCoverageCount: 0,
    singleBrokerCount: 0,
    unresolvedDivergenceCount: 0,
  }
}

function emptySection<T>(title: string, subtitle: string, emptyText: string): MyBookSection<T> {
  return { title, subtitle, items: [], emptyText }
}

// ── Module 23 — sort helper ─────────────────────────────────────────────
//
// Computes baseline + adaptive orderings for a list of activity rows, then
// re-attaches `rankDelta` on each annotation. When the flag is off, the
// returned ordering matches the baseline (relevance.score desc); when on,
// the adjusted score takes over. Either way every row carries a `rankDelta`
// so compare chips reflect the movement vs baseline.
function sortAndStampRankDelta(
  rows: readonly MyBookActivityRow[],
  flagEnabled: boolean,
): MyBookActivityRow[] {
  if (rows.length === 0) return []
  const baselineSorted = [...rows].sort((a, b) => b.relevance.score - a.relevance.score)
  const adaptiveSorted = [...rows].sort((a, b) => {
    const aScore = a.adaptive ? a.adaptive.adjustment.adjustedScore : a.relevance.score
    const bScore = b.adaptive ? b.adaptive.adjustment.adjustedScore : b.relevance.score
    return bScore - aScore
  })
  const baseIdx = new Map<string, number>()
  baselineSorted.forEach((r, i) => baseIdx.set(rowKey(r), i))
  const adaptIdx = new Map<string, number>()
  adaptiveSorted.forEach((r, i) => adaptIdx.set(rowKey(r), i))
  const stamped = (flagEnabled ? adaptiveSorted : baselineSorted).map((r) => {
    if (!r.adaptive) return r
    const k = rowKey(r)
    const rankDelta = (baseIdx.get(k) ?? 0) - (adaptIdx.get(k) ?? 0)
    return {
      ...r,
      adaptive: {
        ...r.adaptive,
        rankDelta,
        moved: r.adaptive.adjustment.delta !== 0 || rankDelta !== 0,
      },
    }
  })
  return stamped
}

function rowKey(r: MyBookActivityRow): string {
  return `${r.reportId}:${r.ticker as string}`
}
