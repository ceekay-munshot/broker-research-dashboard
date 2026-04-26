// Calibration UI view-model types. Pure transforms over the canonical
// CalibrationSnapshot.

import type {
  AlertEffectivenessSummary, BrokerCalibrationSummary,
  CalibrationSnapshot, ConfidenceBand, CoverageSignalResult,
} from '../../domain'

export interface CalibrationViewModel {
  readonly hasSnapshot: boolean
  readonly snapshot: CalibrationSnapshot | null
  readonly methodologyVersion: string | null
  readonly generatedAt: string | null
  readonly counters: CalibrationSnapshot['counters'] | null
  /** Brokers with non-zero sample, sorted by score desc. */
  readonly topBrokers: readonly BrokerCalibrationSummary[]
  /** Brokers with non-zero sample, sorted by score asc (worst). */
  readonly weakestBrokers: readonly BrokerCalibrationSummary[]
  readonly alertKinds: readonly AlertEffectivenessSummary[]
  readonly coverage: readonly CoverageSignalResult[]
  readonly degradations: readonly string[]
}

export interface ConfidenceBadgeViewModel {
  readonly band: ConfidenceBand
  readonly sampleSize: number
}
