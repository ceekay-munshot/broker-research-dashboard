// Post-event review UI view-model types. Pure transforms over the
// canonical PostEventReview shape.

import type {
  BrokerVerdict, BrokerVerdictKind, CatalystEvent,
  DivergenceResolutionKind, ExpectationError,
  PostEventReview, PostEventReviewConfidenceBand,
  RealizedOutcomeWindow, ReportId,
} from '../../domain'

export interface CompletedEventCardViewModel {
  readonly catalystId: CatalystEvent['id']
  readonly ticker: string
  readonly stockName: string | null
  readonly headline: string
  readonly type: CatalystEvent['type']
  readonly importance: CatalystEvent['importance']
  readonly expectedAt: string
  readonly expectedDate: string
  readonly daysSinceEvent: number
  readonly outcomeSummary: string
  readonly headlineDirection: 'up' | 'down' | 'flat' | 'mixed' | 'unknown'
  readonly fiveDayReturnPct: number | null
  readonly rightCount: number
  readonly wrongCount: number
  readonly inconclusiveCount: number
  readonly divergenceKind: DivergenceResolutionKind
  readonly confidence: PostEventReviewConfidenceBand
}

export interface CompletedEventsViewModel {
  readonly hasData: boolean
  readonly items: readonly CompletedEventCardViewModel[]
  readonly degradations: readonly string[]
}

export interface BrokerVerdictRowViewModel {
  readonly brokerId: BrokerVerdict['brokerId']
  readonly brokerShortName: string
  readonly preStance: BrokerVerdict['preStance']
  readonly preRating: string | null
  readonly preTargetPrice: number | null
  readonly verdict: BrokerVerdictKind
  readonly calibrationScore: number | null
  readonly reason: string
}

export interface PostEventReviewViewModel {
  readonly hasReview: boolean
  readonly review: PostEventReview | null
  readonly headline: {
    readonly tickerStr: string
    readonly headline: string
    readonly expectedDate: string
    readonly outcomeSummary: string
    readonly headlineDirection: 'up' | 'down' | 'flat' | 'mixed' | 'unknown'
    readonly hasCoverage: boolean
    readonly confidence: PostEventReviewConfidenceBand
  } | null
  readonly returnWindows: readonly RealizedOutcomeWindow[]
  readonly verdictRows: readonly BrokerVerdictRowViewModel[]
  readonly verdictCounts: { readonly right: number; readonly wrong: number; readonly inconclusive: number; readonly noView: number }
  readonly divergenceKind: DivergenceResolutionKind | null
  readonly divergenceNote: string | null
  readonly expectationErrors: readonly ExpectationError[]
  readonly topPostEventReportIds: readonly ReportId[]
  readonly executiveSummary: string | null
  readonly executiveSummaryFromLlm: boolean
  readonly notes: readonly string[]
  readonly degradations: readonly string[]
}
