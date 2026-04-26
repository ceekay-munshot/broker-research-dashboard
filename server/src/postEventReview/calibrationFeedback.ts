// Build the deterministic `CalibrationFeedback` metadata that this
// review contributes to the calibration layer.
//
// We do NOT mutate calibration scores here — that's the calibration
// layer's job, and it remains gated behind feature flags. This file
// produces the per-broker / per-catalyst-type / per-alert-kind
// records that the calibration absorber will consume in a future
// commit. Exposing the metadata first is the explicit policy.

import type {
  AlertEvent, BrokerVerdict, CalibrationFeedback,
  CatalystEvent, ExpectationSnapshot, RealizedOutcome,
} from '../../../src/domain'

export const POST_EVENT_REVIEW_METHODOLOGY_VERSION = 'v1.0'

export interface BuildFeedbackInputs {
  readonly catalyst: CatalystEvent
  readonly preSnapshot: ExpectationSnapshot
  readonly realized: RealizedOutcome
  readonly verdicts: readonly BrokerVerdict[]
  readonly preEventAlerts: readonly AlertEvent[]
}

export function buildCalibrationFeedback(inputs: BuildFeedbackInputs): CalibrationFeedback {
  const brokerCorrectness = inputs.verdicts.map((v) => ({
    brokerId: v.brokerId,
    correct: v.verdict === 'right' ? 1 : 0,
    wrong: v.verdict === 'wrong' ? 1 : 0,
    inconclusive: v.verdict === 'inconclusive' ? 1 : 0,
  }))

  const catalystTypePerformance = {
    type: inputs.catalyst.type,
    directionallyRight: inputs.verdicts.filter((v) => v.verdict === 'right').length,
    directionallyWrong: inputs.verdicts.filter((v) => v.verdict === 'wrong').length,
    inconclusive: inputs.verdicts.filter((v) => v.verdict === 'inconclusive').length,
  }

  // Pre-event alert usefulness — same logic as expectationErrors but
  // produces structured records consumable by the calibration layer.
  const preEventAlertUsefulness = inputs.preEventAlerts
    .filter((a) => a.lineage.ticker === inputs.catalyst.ticker)
    .map((a) => {
      const dirCtx = a.bookContext?.direction
      const realized = inputs.realized.headlineDirection
      let useful = false
      let note = 'Alert direction undecidable.'
      if (a.kind === 'against_position') {
        if (dirCtx === 'long' && realized === 'down') { useful = true; note = 'Against-position warning matched realized down move.' }
        else if (dirCtx === 'short' && realized === 'up') { useful = true; note = 'Against-position warning matched realized up move.' }
        else if (realized === 'up' || realized === 'down') { note = `Against-position alert did not match realized ${realized}.` }
      } else if (a.kind === 'unresolved_divergence_held') {
        if (realized === 'up' || realized === 'down') {
          useful = true
          note = `Divergence alert flagged Street uncertainty into a real ${realized} move.`
        }
      } else {
        // Other alert kinds — flagged neutrally.
        note = `Alert kind ${a.kind} — usefulness undecidable for this event.`
      }
      return { alertId: a.id, useful, note }
    })

  return {
    brokerCorrectness,
    catalystTypePerformance,
    preEventAlertUsefulness,
    eventDriven: true,
    methodologyVersion: POST_EVENT_REVIEW_METHODOLOGY_VERSION,
  }
}
