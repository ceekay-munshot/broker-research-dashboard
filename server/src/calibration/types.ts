// Internal types for the calibration engine. Public types live in
// src/domain/calibration.ts.

import type {
  AlertEffectivenessSummary, BrokerCalibrationSummary,
  CalibrationSnapshot, CoverageSignalResult,
  SignalEvent, SignalOutcome,
  Broker, ResearchReport, ReportSummary, BrokerStockOpinion,
  AlertEvent, Stock, PortfolioSnapshot, OrgId,
} from '../../../src/domain'
import type { MarketDataProvider } from './marketProvider'

export interface CalibrationInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly alerts: readonly AlertEvent[]
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly market: MarketDataProvider
  readonly now: Date
}

export interface CalibrationRunResult {
  readonly events: readonly SignalEvent[]
  readonly outcomes: readonly SignalOutcome[]
  readonly brokers: readonly BrokerCalibrationSummary[]
  readonly alerts: readonly AlertEffectivenessSummary[]
  readonly coverage: readonly CoverageSignalResult[]
  readonly snapshot: CalibrationSnapshot
}

export interface CalibrationPersistence {
  readonly upsertSnapshot: (rec: CalibrationSnapshot) => void
}
