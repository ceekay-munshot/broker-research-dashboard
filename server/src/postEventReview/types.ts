// Internal helper types for the post-event review engine. Public types
// live in src/domain/catalysts.ts.

import type {
  AlertEvent, BrokerStockOpinion, ResearchReport, ReportSummary,
  Stock, Broker, Sector, OrgId,
  CatalystEvent, ExpectationSnapshot, PostEventReview,
  CalibrationSnapshot,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'
import type { MarketDataProvider } from '../calibration/marketProvider'

export interface PostEventInputs {
  readonly orgId: OrgId
  readonly catalyst: CatalystEvent
  readonly preEventSnapshot: ExpectationSnapshot
  readonly preEventClosure: ConflictClosure | null
  readonly opinions: readonly BrokerStockOpinion[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly alerts: readonly AlertEvent[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly sectors: readonly Sector[]
  readonly brokers: readonly Broker[]
  readonly calibration: CalibrationSnapshot | null
  readonly market: MarketDataProvider
  readonly now: Date
}

export interface PostEventPersistence {
  readonly upsertReview: (r: PostEventReview) => void
}
