// Catalyst UI view-model types.
//
// We compute calendar entries client-side from the canonical catalyst
// list + the portfolio overlay (hot in My Book / Briefing / Calibration
// already). The brief panel is fetched per catalyst on demand.

import type {
  CatalystEvent, CatalystImportance, CatalystStatus, CatalystType,
  EventRiskFlag, PortfolioMembership, PortfolioDirection, PortfolioConviction,
  PreEventBrief, ReportId, AlertId,
} from '../../domain'

export interface CatalystCardViewModel {
  readonly catalystId: CatalystEvent['id']
  readonly ticker: string
  readonly stockName: string | null
  readonly type: CatalystType
  readonly status: CatalystStatus
  readonly importance: CatalystImportance
  readonly headline: string
  readonly description: string
  readonly expectedAt: string
  readonly expectedDate: string
  readonly hasIntradayTime: boolean
  readonly daysUntil: number
  readonly urgencyScore: number
  readonly priorityScore: number
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  readonly riskFlags: readonly EventRiskFlag[]
  readonly reasonChips: readonly { code: string; text: string }[]
}

export interface CatalystsViewModel {
  readonly hasData: boolean
  readonly upcoming7d: readonly CatalystCardViewModel[]
  readonly upcoming30d: readonly CatalystCardViewModel[]
  readonly overdue: readonly CatalystCardViewModel[]
  readonly later: readonly CatalystCardViewModel[]
  readonly counts: {
    readonly total: number
    readonly held: number
    readonly watchlist: number
    readonly weakCoverage: number
    readonly divergent: number
  }
  readonly degradations: readonly string[]
}

export type CatalystGroupKey = 'upcoming7d' | 'upcoming30d' | 'overdue' | 'later'

export interface PreEventBriefViewModel {
  readonly hasBrief: boolean
  readonly brief: PreEventBrief | null
  /** Quick summary of the snapshot for the header. */
  readonly snapshotHeader: {
    readonly tilt: string
    readonly distinctBrokers: number
    readonly avgTargetPrice: number | null
    readonly avgImpliedUpsidePct: number | null
    readonly hasDivergence: boolean
  } | null
  readonly degradations: readonly string[]
  /** Convenience: top reads ids surfaced from the brief's `top_reads` section. */
  readonly topReadReportIds: readonly ReportId[]
  /** Alerts referenced anywhere in the brief — used for jumping into the briefing. */
  readonly referencedAlertIds: readonly AlertId[]
}
