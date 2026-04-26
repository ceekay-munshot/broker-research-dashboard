import type { CalibrationSnapshot } from '../../domain'
import type { CalibrationViewModel } from './types'

export interface BuildCalibrationInputs {
  readonly snapshot: CalibrationSnapshot | null
  readonly degradations?: readonly string[]
}

export function buildCalibrationViewModel(inputs: BuildCalibrationInputs): CalibrationViewModel {
  const snap = inputs.snapshot
  if (!snap) {
    return {
      hasSnapshot: false,
      snapshot: null,
      methodologyVersion: null,
      generatedAt: null,
      counters: null,
      topBrokers: [],
      weakestBrokers: [],
      alertKinds: [],
      coverage: [],
      degradations: inputs.degradations ?? [],
    }
  }

  const withSample = snap.brokerCalibrations.filter((b) => b.sampleSize > 0)
  const topBrokers = [...withSample].sort((a, b) => b.score - a.score)
  const weakestBrokers = [...withSample].sort((a, b) => a.score - b.score)
  const alertKinds = [...snap.alertEffectiveness].sort((a, b) => b.score - a.score)
  const coverage = [...snap.coverageByTicker].sort((a, b) => b.sampleSize - a.sampleSize)

  return {
    hasSnapshot: true,
    snapshot: snap,
    methodologyVersion: snap.methodologyVersion,
    generatedAt: snap.generatedAt,
    counters: snap.counters,
    topBrokers,
    weakestBrokers,
    alertKinds,
    coverage,
    degradations: inputs.degradations ?? [],
  }
}
