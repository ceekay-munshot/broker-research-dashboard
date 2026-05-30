import type {
  Broker, ResearchReport, ReportSummary, Stance,
  BrokerId, PortfolioSnapshot, BrokerStockOpinion, Stock,
  CalibrationSnapshot, PostEventReview, ResolutionClass,
  Rating, IsoCurrency, ReportId,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../engine'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import {
  buildFeedItem, dedupeReports, indexBy, type FeedItemViewModel,
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
  /** Number of notes in the last 30 days where rating, stance, or target moved
   *  vs the broker's prior comparable note on the same stock. */
  readonly viewChangesLast30d: number
  /** Most recent rating/stance/target change across the broker's coverage. */
  readonly lastMove: BrokerLastMove | null
  /** Every note this broker published in range, newest first. Kept for the
   *  drawer's full per-stock timeline; the card itself renders `calls`. */
  readonly notes: readonly FeedItemViewModel[]
  /** The broker's CURRENT call per stock — latest note per ticker, newest
   *  first. This is what the card shows: what's the call, on what stock. */
  readonly calls: readonly BrokerCall[]
  /** Module 18: items this broker published on book / watchlist names. */
  readonly bookActivity: BrokerBookActivity
  /** How this broker was resolved — drives card ordering and labels. */
  readonly resolutionClass: ResolutionClass | null
  /** Reports flagged for QA (broker conflict or broker/stock overlap). */
  readonly conflictCount: number
}

export interface BrokerLastMove {
  readonly ticker: string
  readonly publishedAt: string
  readonly kind: 'rating' | 'target' | 'stance'
}

/** One current call: the broker's latest rating on a stock. `isNew` marks a
 *  call published recently AND not seen before for that ticker in range (a
 *  fresh initiation or a changed view), so the card can flag it. */
export interface BrokerCall {
  readonly ticker: string
  readonly stockName: string | null
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly targetCurrency: IsoCurrency | null
  readonly publishedAt: string
  readonly reportId: ReportId
  readonly isNew: boolean
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
  /** Stock catalog for resolving display names on the per-stock calls. */
  readonly stocks?: readonly Stock[]
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Per-broker move statistics — counts notes in the last 30d where rating,
 *  stance, or target changed vs the broker's prior comparable note on the
 *  same ticker, and surfaces the most recent move for the card "last move"
 *  line. Walks each (broker, ticker) bucket in publish order so the prior
 *  comparable is the immediate predecessor on the same stock. */
function computeMoveStats(
  reports: readonly ResearchReport[],
  summaryByReport: ReadonlyMap<string, ReportSummary>,
): { viewChangesLast30d: number; lastMove: BrokerLastMove | null } {
  const byTicker = new Map<string, ResearchReport[]>()
  for (const r of reports) {
    for (const t of r.tickers) {
      const k = t as unknown as string
      const arr = byTicker.get(k) ?? []
      arr.push(r)
      byTicker.set(k, arr)
    }
  }

  const nowMs = Date.now()
  let viewChangesLast30d = 0
  let lastMove: BrokerLastMove | null = null

  for (const [ticker, bucket] of byTicker) {
    bucket.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    for (let i = 1; i < bucket.length; i++) {
      const prev = summaryByReport.get(bucket[i - 1]!.id as string)
      const cur = summaryByReport.get(bucket[i]!.id as string)
      if (!cur) continue
      const ratingChanged = !!prev && prev.rating !== cur.rating
      const stanceChanged = !!prev && prev.stance !== cur.stance
      const priorTp = prev?.targetPrice ?? cur.priorTargetPrice ?? null
      const targetChanged = priorTp !== null && cur.targetPrice !== null && priorTp !== cur.targetPrice
      if (!ratingChanged && !stanceChanged && !targetChanged) continue
      const publishedAt = bucket[i]!.publishedAt
      if (nowMs - Date.parse(publishedAt) <= THIRTY_DAYS_MS) viewChangesLast30d += 1
      if (!lastMove || publishedAt > lastMove.publishedAt) {
        lastMove = {
          ticker,
          publishedAt,
          kind: ratingChanged ? 'rating' : targetChanged ? 'target' : 'stance',
        }
      }
    }
  }
  return { viewChangesLast30d, lastMove }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Collapse a broker's reports into one CURRENT call per stock — the latest
 *  note per ticker. A call is flagged `isNew` when its latest note is recent
 *  (≤7d) AND it either initiated coverage or changed the rating vs the prior
 *  note on that stock — i.e. genuinely new information, not a reiteration. */
function buildCalls(
  reports: readonly ResearchReport[],
  summaryByReport: ReadonlyMap<string, ReportSummary>,
  stockNameByTicker: ReadonlyMap<string, string>,
): BrokerCall[] {
  const byTicker = new Map<string, ResearchReport[]>()
  for (const r of reports) {
    const t = r.tickers[0] as unknown as string | undefined
    if (!t) continue
    const arr = byTicker.get(t) ?? []
    arr.push(r)
    byTicker.set(t, arr)
  }

  const nowMs = Date.now()
  const calls: BrokerCall[] = []
  for (const [ticker, bucket] of byTicker) {
    bucket.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)) // oldest→newest
    const latest = bucket[bucket.length - 1]!
    const prev = bucket.length > 1 ? bucket[bucket.length - 2]! : null
    const sum = summaryByReport.get(latest.id as string) ?? null
    const prevSum = prev ? summaryByReport.get(prev.id as string) ?? null : null

    const recent = nowMs - Date.parse(latest.publishedAt) <= SEVEN_DAYS_MS
    const initiated = prev === null
    const ratingChanged = !!prevSum && prevSum.rating !== (sum?.rating ?? null)
    const isNew = recent && (initiated || ratingChanged)

    calls.push({
      ticker,
      stockName: stockNameByTicker.get(ticker) ?? null,
      rating: sum?.rating ?? null,
      stance: sum?.stance ?? 'neutral',
      targetPrice: sum?.targetPrice ?? null,
      targetCurrency: sum?.targetCurrency ?? null,
      publishedAt: latest.publishedAt,
      reportId: latest.id,
      isNew,
    })
  }
  // New calls first, then newest-published.
  calls.sort((a, b) =>
    (Number(b.isNew) - Number(a.isNew)) || b.publishedAt.localeCompare(a.publishedAt))
  return calls
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
  // Collapse re-forwarded duplicates once, up front, so every card-level
  // number — note count, stance mix, latest notes — counts each distinct
  // note exactly once.
  const reports = dedupeReports(inputs.reports)
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as string)
  const stockNameByTicker = new Map<string, string>(
    (inputs.stocks ?? []).map((s) => [s.ticker as unknown as string, s.name]),
  )
  const brokerFilter = new Set<string>(inputs.filters.brokerIds as readonly string[])
  const brokers = inputs.brokers.filter((b) => brokerFilter.size === 0 || brokerFilter.has(b.id as string))

  // Module 18: build portfolio overlay once if portfolio inputs are provided.
  const overlay = inputs.portfolio?.snapshot
    ? buildPortfolioOverlay({
        snapshot: inputs.portfolio.snapshot,
        reports,
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

  // Rating filter applies at the per-broker note level: when the sidebar's
  // "Formal call" chips are selected, drop notes whose summary's rating
  // isn't in the selection (and drop notes with no rating at all). When
  // the array is empty, the filter is inactive and every note passes.
  const ratingFilter = new Set<string>(inputs.filters.ratings as readonly string[])
  const ratingFilterActive = ratingFilter.size > 0

  const cards = brokers.map<BrokerCardViewModel>((broker) => {
    const theirs = reports
      .filter((r) => r.brokerId === broker.id)
      .filter((r) => {
        if (!ratingFilterActive) return true
        const sum = summaryByReport.get(r.id as string)
        const rating = sum?.rating ?? null
        return rating !== null && ratingFilter.has(rating)
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    const tickersCovered = new Set(
      theirs.flatMap((r) => r.tickers.map((t) => t as unknown as string)),
    ).size
    const latestReportAt = theirs[0]?.publishedAt ?? null

    const stanceCounts: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 }

    for (const r of theirs) {
      const sum = summaryByReport.get(r.id as string)
      if (!sum) continue
      stanceCounts[sum.stance] += 1
    }

    const { viewChangesLast30d, lastMove } = computeMoveStats(theirs, summaryByReport)

    const notes = theirs.map((r) => buildFeedItem(
      r, summaryByReport.get(r.id as string) ?? null, broker,
    ))
    const calls = buildCalls(theirs, summaryByReport, stockNameByTicker)

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
      viewChangesLast30d,
      lastMove,
      notes,
      calls,
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
    stocks: stocks.data,
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
