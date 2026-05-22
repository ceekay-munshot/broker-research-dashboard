import type {
  Broker, ResearchReport, ReportSummary, Stance,
  BrokerId, PortfolioSnapshot, BrokerStockOpinion, Stock,
  CalibrationSnapshot, PostEventReview, ResolutionClass,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../engine'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import {
  buildFeedItem, indexBy, type FeedItemViewModel,
} from './shared'
import type { FiltersState } from '../app/filters'
import { filtersFingerprint, resolveSince } from '../app/filters'
import { buildPortfolioOverlay } from './portfolio'
import type { AdaptiveAnnotation } from './adaptiveRanking'

export interface BrokerCardViewModel {
  readonly brokerId: BrokerId
  readonly name: string
  readonly shortName: string
  readonly color: string | null
  readonly reportCount: number
  /** Distinct tickers across this broker's reports. */
  readonly tickersCovered: number
  /** publishedAt of this broker's most recent report; null if none. */
  readonly latestReportAt: string | null
  readonly stanceCounts: Readonly<Record<Stance, number>>
  readonly topThemes: readonly { readonly theme: string; readonly count: number }[]
  readonly latestReports: readonly FeedItemViewModel[]
  /** Module 18: items this broker published on book / watchlist names. */
  readonly bookActivity: BrokerBookActivity
  /** How this broker was resolved — drives card ordering and labels. */
  readonly resolutionClass: ResolutionClass | null
  /** Reports flagged for QA (broker conflict or broker/stock overlap). */
  readonly conflictCount: number
}

export interface BrokerBookActivity {
  readonly hasPortfolio: boolean
  readonly onBookCount: number
  readonly outlierOnBookCount: number
  /** Latest items on book/watchlist names (max 3). */
  readonly latestOnBook: readonly BrokerBookActivityItem[]
}

export interface BrokerBookActivityItem extends FeedItemViewModel {
  readonly membership: 'held' | 'watchlist'
  readonly relevanceBucket: 'critical' | 'high' | 'medium' | 'low' | 'none'
  readonly bookSummary: string
  readonly isOutlier: boolean
  /** Module 23 — calibration-aware adjustment + rank delta vs baseline. */
  readonly adaptive: AdaptiveAnnotation | null
  /** Numeric baseline derived from relevance bucket — kept for sorting. */
  readonly relevanceBaseline: number
}

export interface ByBrokerViewModel {
  readonly brokers: readonly BrokerCardViewModel[]
}

interface Inputs {
  readonly brokers: readonly Broker[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly filters: FiltersState
  /** Module 18: optional portfolio inputs. When absent, bookActivity is empty. */
  readonly portfolio?: {
    readonly snapshot: PortfolioSnapshot | null
    readonly opinions: readonly BrokerStockOpinion[]
    readonly closures: readonly ConflictClosure[]
    readonly stocks: readonly Stock[]
  }
  /** Module 23 — calibration snapshot for adaptive ranking. */
  readonly calibration?: CalibrationSnapshot | null
  /** Module 23 — post-event reviews for catalyst/event sources. */
  readonly postEventReviews?: readonly PostEventReview[] | null
}

/** Numeric baseline for relevance buckets so the engine has a scalar to nudge. */
function bucketBaseline(b: 'critical' | 'high' | 'medium' | 'low' | 'none'): number {
  switch (b) {
    case 'critical': return 80
    case 'high':     return 60
    case 'medium':   return 40
    case 'low':      return 20
    case 'none':     return 0
  }
}

/** Card order: real research houses first, then unmapped, then non-broker
 *  buckets, then unresolved. */
const CLASS_RANK: Record<ResolutionClass, number> = {
  mapped: 0,
  unmapped_research_house: 1,
  other_source: 2,
  unknown: 3,
}

export function buildByBrokerViewModel(inputs: Inputs): ByBrokerViewModel {
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const brokerFilter = new Set<string>(inputs.filters.brokerIds as readonly string[])
  const brokers = inputs.brokers.filter((b) => brokerFilter.size === 0 || brokerFilter.has(b.id as string))

  // Module 18: build portfolio overlay once if portfolio inputs are provided.
  const overlay = inputs.portfolio?.snapshot
    ? buildPortfolioOverlay({
        snapshot: inputs.portfolio.snapshot,
        reports: inputs.reports,
        summaries: inputs.summaries,
        opinions: inputs.portfolio.opinions,
        closures: inputs.portfolio.closures,
        stocks: inputs.portfolio.stocks,
      })
    : null

  // Module 23 — calibration-aware adaptive ranking inputs.
  const flags = adaptiveRankingFlags()
  const calibration = inputs.calibration ?? null
  const postEventReviews = inputs.postEventReviews ?? null

  const cards = brokers.map<BrokerCardViewModel>((broker) => {
    const theirs = inputs.reports
      .filter((r) => r.brokerId === broker.id)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    const tickersCovered = new Set(
      theirs.flatMap((r) => r.tickers.map((t) => t as unknown as string)),
    ).size
    const latestReportAt = theirs[0]?.publishedAt ?? null

    const stanceCounts: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 }
    const themeTally = new Map<string, number>()

    for (const r of theirs) {
      const sum = summaryByReport.get(r.id as string)
      if (!sum) continue
      stanceCounts[sum.stance] += 1
      for (const theme of sum.themes) {
        themeTally.set(theme, (themeTally.get(theme) ?? 0) + 1)
      }
    }

    const topThemes = Array.from(themeTally.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)

    const latestReports = theirs.slice(0, 3).map((r) => buildFeedItem(
      r, summaryByReport.get(r.id as string) ?? null, broker,
    ))

    // Module 18: items this broker published on the book / watchlist.
    const bookActivity: BrokerBookActivity = (() => {
      if (!overlay || !overlay.hasPortfolio) {
        return { hasPortfolio: false, onBookCount: 0, outlierOnBookCount: 0, latestOnBook: [] }
      }
      const items: BrokerBookActivityItem[] = []
      let outlierCount = 0
      for (const r of theirs) {
        for (const t of r.tickers) {
          const tk = t as string
          const ctx = overlay.contextByTicker.get(tk)
          if (!ctx) continue
          if (ctx.membership !== 'held' && ctx.membership !== 'watchlist') continue
          const rel = overlay.relevanceByKey.get(`${r.id}:${tk}`)
          if (!rel) continue
          const cov = overlay.coverageByTicker.get(tk)
          const isOutlier = cov?.hasOutlier
            ? !!inputs.portfolio?.closures
                .find((c) => (c.ticker as string) === tk)
                ?.outliers.find((o) => (o.brokerId as string) === (broker.id as string))
            : false
          if (isOutlier) outlierCount++
          const feed = buildFeedItem(r, summaryByReport.get(r.id as string) ?? null, broker)
          const relevanceBaseline = bucketBaseline(rel.bucket)
          let adaptive: AdaptiveAnnotation | null = null
          if (calibration) {
            const adjustment = computeRankAdjustment({
              baselineScore: relevanceBaseline,
              brokerId: broker.id,
              alertKind: null,
              catalystType: null,
              calibration,
              postEventReviews,
            })
            adaptive = {
              adjustment,
              rankDelta: 0,
              moved: adjustment.delta !== 0,
            }
          }
          items.push({
            ...feed,
            ticker: t,
            membership: ctx.membership,
            relevanceBucket: rel.bucket,
            bookSummary: rel.bookSummary,
            isOutlier,
            adaptive,
            relevanceBaseline,
          })
        }
      }
      // Build baseline + adaptive orderings to derive rank deltas.
      const baselineSorted = [...items].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        const ar = order[a.relevanceBucket]
        const br = order[b.relevanceBucket]
        if (ar !== br) return ar - br
        return b.publishedAt.localeCompare(a.publishedAt)
      })
      const adaptiveSorted = [...items].sort((a, b) => {
        const aScore = a.adaptive ? a.adaptive.adjustment.adjustedScore : a.relevanceBaseline
        const bScore = b.adaptive ? b.adaptive.adjustment.adjustedScore : b.relevanceBaseline
        if (aScore !== bScore) return bScore - aScore
        return b.publishedAt.localeCompare(a.publishedAt)
      })
      const baseIdx = new Map<string, number>()
      baselineSorted.forEach((it, i) => baseIdx.set(`${it.reportId}:${it.ticker as unknown as string}`, i))
      const adaptIdx = new Map<string, number>()
      adaptiveSorted.forEach((it, i) => adaptIdx.set(`${it.reportId}:${it.ticker as unknown as string}`, i))
      const stamped = (flags.enabled ? adaptiveSorted : baselineSorted).map((it) => {
        if (!it.adaptive) return it
        const k = `${it.reportId}:${it.ticker as unknown as string}`
        const rankDelta = (baseIdx.get(k) ?? 0) - (adaptIdx.get(k) ?? 0)
        return {
          ...it,
          adaptive: {
            ...it.adaptive,
            rankDelta,
            moved: it.adaptive.adjustment.delta !== 0 || rankDelta !== 0,
          },
        }
      })
      return {
        hasPortfolio: true,
        onBookCount: stamped.length,
        outlierOnBookCount: outlierCount,
        latestOnBook: stamped.slice(0, 3),
      }
    })()

    const resolutionClass = theirs[0]?.brokerResolution?.resolutionClass ?? null
    const conflictCount = theirs.filter(
      (r) => r.brokerResolution?.brokerConflict || r.brokerStockConflict,
    ).length

    return {
      brokerId: broker.id,
      name: broker.name,
      shortName: broker.shortName,
      color: broker.brandColor,
      reportCount: theirs.length,
      tickersCovered,
      latestReportAt,
      stanceCounts,
      topThemes,
      latestReports,
      bookActivity,
      resolutionClass,
      conflictCount,
    }
  })

  // Only brokers with reports surface as cards — zero-report buckets (e.g.
  // "Mixed Sources") never appear. Order by resolution class, then activity.
  const visible = cards.filter((c) => c.reportCount > 0)
  visible.sort((a, b) => {
    const ra = CLASS_RANK[a.resolutionClass ?? 'mapped']
    const rb = CLASS_RANK[b.resolutionClass ?? 'mapped']
    if (ra !== rb) return ra - rb
    if (overlay && overlay.hasPortfolio
      && a.bookActivity.onBookCount !== b.bookActivity.onBookCount) {
      return b.bookActivity.onBookCount - a.bookActivity.onBookCount
    }
    return b.reportCount - a.reportCount
  })

  return { brokers: visible }
}

export function useByBrokerViewModel(filters: FiltersState): QueryResult<ByBrokerViewModel> {
  const since = resolveSince(filters.dateRange)
  const fp = filtersFingerprint(filters)

  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const stocks  = useAdapterQuery((a, s) => a.listStocks(s),  [])
  const reportsPage = useAdapterQuery(
    (a, s) => a.listResearchReports(s, {
      since,
      brokerIds: filters.brokerIds.length ? filters.brokerIds : undefined,
      tickers: filters.tickers.length ? filters.tickers : undefined,
      sectorIds: filters.sectorIds.length ? filters.sectorIds : undefined,
      limit: 200,
    }),
    [fp],
  )

  const needsSummaries = reportsPage.data?.items.map((r) => r.id) ?? []
  const summariesQuery = useAdapterQuery(async (a, s) => {
    return Promise.all(needsSummaries.map((id) => a.getReportSummary(s, id)))
      .then((rs) => rs.filter((x): x is NonNullable<typeof x> => x !== null))
  }, [needsSummaries.join(',')])

  const opinionsQ = useAdapterQuery<readonly BrokerStockOpinion[]>(
    async (a, s) => { try { return await a.listBrokerStockOpinions(s) } catch { return [] } }, [],
  )
  const closuresQ = useAdapterQuery<readonly ConflictClosure[]>(
    async (a, s) => { try { return await a.listConflictClosures(s) } catch { return [] } }, [],
  )
  const portfolioQ = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => { try { return await a.getPortfolioSnapshot(s) } catch { return null } }, [],
  )
  const calibrationQ = useAdapterQuery<CalibrationSnapshot | null>(
    async (a, s) => { try { return await a.getCalibrationSnapshot(s) } catch { return null } }, [],
  )
  const postEventReviewsQ = useAdapterQuery<readonly PostEventReview[]>(
    async (a, s) => { try { return await a.listPostEventReviews(s) } catch { return [] } }, [],
  )

  const loading = brokers.loading || reportsPage.loading || summariesQuery.loading || stocks.loading
  const error = brokers.error ?? reportsPage.error ?? summariesQuery.error ?? stocks.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!brokers.data || !reportsPage.data || !summariesQuery.data || !stocks.data) {
    return { data: null, loading: true, error: null }
  }

  const vm = buildByBrokerViewModel({
    brokers: brokers.data,
    reports: reportsPage.data.items,
    summaries: summariesQuery.data,
    filters,
    portfolio: {
      snapshot: portfolioQ.data ?? null,
      opinions: opinionsQ.data ?? [],
      closures: closuresQ.data ?? [],
      stocks: stocks.data,
    },
    calibration: calibrationQ.data ?? null,
    postEventReviews: postEventReviewsQ.data ?? null,
  })
  return { data: vm, loading: false, error: null }
}
