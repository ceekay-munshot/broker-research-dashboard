import type {
  CatalystEvent, PostEventReview,
} from '../../domain'
import type {
  CompletedEventCardViewModel, CompletedEventsViewModel,
  PostEventReviewViewModel,
} from './types'

const DAY_MS = 86400e3

export function buildCompletedEventsViewModel(args: {
  readonly catalysts: readonly CatalystEvent[]
  readonly reviews: readonly PostEventReview[]
  readonly now?: Date
  readonly degradations?: readonly string[]
}): CompletedEventsViewModel {
  const now = args.now ?? new Date()
  if (args.reviews.length === 0) {
    return {
      hasData: false,
      items: [],
      degradations: args.degradations ?? ['No completed-event reviews yet.'],
    }
  }
  const catalystById = new Map(args.catalysts.map((c) => [c.id as unknown as string, c]))
  const items: CompletedEventCardViewModel[] = args.reviews.map((r) => {
    const c = catalystById.get(r.catalystId as unknown as string) ?? null
    const fiveDay = r.realizedOutcome.windows.find((w) => w.window === '5d')
    return {
      catalystId: r.catalystId,
      ticker: c?.ticker as unknown as string ?? r.realizedOutcome.ticker as unknown as string,
      stockName: c?.stockName ?? null,
      headline: c?.headline ?? r.preEventSnapshot.tiltSummary,
      type: c?.type ?? 'other',
      importance: c?.importance ?? 'medium',
      expectedAt: c?.expectedAt ?? r.realizedOutcome.anchorDate,
      expectedDate: c?.expectedDate ?? r.realizedOutcome.anchorDate,
      daysSinceEvent: Math.floor((now.getTime() - Date.parse(c?.expectedAt ?? r.realizedOutcome.anchorDate)) / DAY_MS),
      outcomeSummary: r.outcomeSummary,
      headlineDirection: r.realizedOutcome.headlineDirection,
      fiveDayReturnPct: fiveDay?.rawReturnPct ?? null,
      rightCount: r.directionallyRightBrokerIds.length,
      wrongCount: r.directionallyWrongBrokerIds.length,
      inconclusiveCount: r.inconclusiveBrokerIds.length,
      divergenceKind: r.divergenceResolution.kind,
      confidence: r.confidence,
    }
  })
  items.sort((a, b) => a.daysSinceEvent - b.daysSinceEvent)
  return { hasData: true, items, degradations: args.degradations ?? [] }
}

export function buildPostEventReviewViewModel(review: PostEventReview | null): PostEventReviewViewModel {
  if (!review) {
    return {
      hasReview: false,
      review: null,
      headline: null,
      returnWindows: [],
      verdictRows: [],
      verdictCounts: { right: 0, wrong: 0, inconclusive: 0, noView: 0 },
      divergenceKind: null,
      divergenceNote: null,
      expectationErrors: [],
      topPostEventReportIds: [],
      executiveSummary: null,
      executiveSummaryFromLlm: false,
      notes: [],
      degradations: ['No post-event review available — the catalyst may still be upcoming or outside the review grace window.'],
    }
  }
  const verdictRows = review.brokerVerdicts.map((v) => ({
    brokerId: v.brokerId,
    brokerShortName: v.brokerShortName,
    preStance: v.preStance,
    preRating: v.preRating,
    preTargetPrice: v.preTargetPrice,
    verdict: v.verdict,
    calibrationScore: v.calibrationScore,
    reason: v.reason,
  }))
  const verdictCounts = {
    right: verdictRows.filter((v) => v.verdict === 'right').length,
    wrong: verdictRows.filter((v) => v.verdict === 'wrong').length,
    inconclusive: verdictRows.filter((v) => v.verdict === 'inconclusive').length,
    noView: verdictRows.filter((v) => v.verdict === 'no_view').length,
  }
  return {
    hasReview: true,
    review,
    headline: {
      tickerStr: review.realizedOutcome.ticker as unknown as string,
      headline: review.outcomeSummary,
      expectedDate: review.realizedOutcome.anchorDate,
      outcomeSummary: review.outcomeSummary,
      headlineDirection: review.realizedOutcome.headlineDirection,
      hasCoverage: review.realizedOutcome.hasCoverage,
      confidence: review.confidence,
    },
    returnWindows: review.realizedOutcome.windows,
    verdictRows,
    verdictCounts,
    divergenceKind: review.divergenceResolution.kind,
    divergenceNote: review.divergenceResolution.note,
    expectationErrors: review.expectationErrors,
    topPostEventReportIds: review.topPostEventReportIds,
    executiveSummary: review.executiveSummary,
    executiveSummaryFromLlm: review.executiveSummaryFromLlm,
    notes: review.notes,
    degradations: [],
  }
}
