// Briefing / alerts UI view-model types. Pure transforms over the
// canonical AlertEvent + AlertDigest types.

import type {
  AlertEvent, AlertDigest, AlertSeverity, AlertTriggerKind,
  PortfolioMembership, ReportId, StockTicker, BrokerId,
} from '../../domain'

export interface AlertCardViewModel {
  readonly id: AlertEvent['id']
  readonly severity: AlertSeverity
  readonly kind: AlertTriggerKind
  readonly headline: string
  readonly body: string
  readonly reasons: readonly { code: string; text: string }[]
  readonly generatedAt: string
  readonly suppressed: boolean
  readonly bookMembership: PortfolioMembership | null
  readonly bookDirection: 'long' | 'short' | 'hedge' | null
  readonly bookConviction: 'high' | 'medium' | 'low' | null
  readonly bookWeightPct: number | null
  readonly ticker: StockTicker | null
  readonly brokerId: BrokerId | null
  readonly reportId: ReportId | null
}

export interface AlertGroup {
  readonly key: string
  readonly label: string
  readonly items: readonly AlertCardViewModel[]
}

export interface AlertsFeedViewModel {
  readonly counts: {
    readonly critical: number
    readonly high: number
    readonly medium: number
    readonly low: number
    readonly info: number
    readonly total: number
  }
  readonly groups: readonly AlertGroup[]
  /** Stable groupBy key. */
  readonly groupBy: 'severity' | 'membership' | 'kind' | 'broker'
}

export interface BriefingSectionViewModel {
  readonly key: string
  readonly title: string
  readonly subtitle: string
  readonly prose: string | null
  readonly proseFromLlm: boolean
  readonly items: readonly AlertCardViewModel[]
  readonly emptyText: string
}

export interface BriefingViewModel {
  readonly hasDigest: boolean
  readonly digest: AlertDigest | null
  readonly executiveSummary: string | null
  readonly executiveSummaryFromLlm: boolean
  readonly sections: readonly BriefingSectionViewModel[]
  readonly counts: AlertsFeedViewModel['counts']
  readonly degradations: readonly string[]
}
