// Internal helper types for the server-side catalyst engine. Public
// types live in src/domain/catalysts.ts.

import type {
  CatalystEvent, CatalystCalendarEntry, ExpectationSnapshot,
  EventExpectationDelta, PreEventBrief, PostEventReview,
  AlertEvent, BrokerStockOpinion, ReportSummary, ResearchReport,
  Stock, Broker, Sector, PortfolioSnapshot, OrgId,
  CalibrationSnapshot,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

export interface CatalystEngineInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly catalysts: readonly CatalystEvent[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly alerts: readonly AlertEvent[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly sectors: readonly Sector[]
  readonly brokers: readonly Broker[]
  readonly calibration: CalibrationSnapshot | null
  readonly now: Date
}

export interface CatalystRunResult {
  readonly orgId: OrgId
  readonly calendar: readonly CatalystCalendarEntry[]
  readonly snapshots: readonly ExpectationSnapshot[]
  readonly briefs: readonly PreEventBrief[]
  readonly reviews: readonly PostEventReview[]
  readonly deltasByCatalyst: ReadonlyMap<string, readonly EventExpectationDelta[]>
}

export interface CatalystPersistence {
  readonly upsertCatalyst: (c: CatalystEvent) => void
  readonly upsertSnapshot: (s: ExpectationSnapshot) => void
  readonly upsertBrief: (b: PreEventBrief) => void
  readonly upsertReview: (r: PostEventReview) => void
  /** Used by the engine to retrieve the prior snapshot for a catalyst
   *  + window so deltas are stable across runs. */
  readonly priorSnapshot?: (orgId: OrgId, catalystId: string, atOrBefore: Date) => ExpectationSnapshot | null
}
