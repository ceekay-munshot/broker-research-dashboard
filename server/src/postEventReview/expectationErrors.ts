// Decompose where the pre-event expectation snapshot missed.
//
// Deterministic. Produces zero or more `ExpectationError` rows with a
// magnitude in [0, 100]. Ordering: most-severe first.

import type {
  AlertEvent, BrokerVerdict, CalibrationSnapshot,
  DivergenceResolution, ExpectationError, ExpectationSnapshot,
  RealizedOutcome,
} from '../../../src/domain'

export interface BuildExpectationErrorsInputs {
  readonly preSnapshot: ExpectationSnapshot
  readonly realized: RealizedOutcome
  readonly verdicts: readonly BrokerVerdict[]
  readonly divergence: DivergenceResolution
  readonly calibration: CalibrationSnapshot | null
  readonly preEventAlerts: readonly AlertEvent[]
}

export function buildExpectationErrors(inputs: BuildExpectationErrorsInputs): readonly ExpectationError[] {
  const out: ExpectationError[] = []
  const realized = inputs.realized.headlineDirection
  const mix = inputs.preSnapshot.stanceMix
  const total = mix.bullish + mix.neutral + mix.bearish

  // 1) Overly bullish / cautious.
  if (total > 0 && (realized === 'up' || realized === 'down')) {
    const bullPct = mix.bullish / total
    const bearPct = mix.bearish / total
    if (realized === 'down' && bullPct >= 0.6) {
      out.push({
        kind: 'overly_bullish',
        text: `Pre-event Street was ${(bullPct * 100).toFixed(0)}% bullish but realized ${realized}.`,
        magnitude: Math.round(60 + bullPct * 30),
      })
    } else if (realized === 'up' && bearPct >= 0.4) {
      out.push({
        kind: 'overly_cautious',
        text: `Pre-event Street was ${(bearPct * 100).toFixed(0)}% bearish/cautious but realized ${realized}.`,
        magnitude: Math.round(40 + bearPct * 40),
      })
    }
  }

  // 2) Target dispersion.
  if (inputs.preSnapshot.targetSpreadPct !== null) {
    if (inputs.preSnapshot.targetSpreadPct >= 25) {
      out.push({
        kind: 'target_dispersion_too_wide',
        text: `Pre-event target spread was ${inputs.preSnapshot.targetSpreadPct.toFixed(0)}% — Street was uncertain.`,
        magnitude: Math.min(80, Math.round(inputs.preSnapshot.targetSpreadPct * 2)),
      })
    } else if (inputs.preSnapshot.targetSpreadPct < 5 && (realized === 'up' || realized === 'down')) {
      out.push({
        kind: 'target_dispersion_too_narrow',
        text: `Targets were tightly clustered (${inputs.preSnapshot.targetSpreadPct.toFixed(0)}%) yet realized ${realized}.`,
        magnitude: 50,
      })
    }
  }

  // 3) High-calibration brokers wrong.
  const highCalWrong = inputs.verdicts.filter((v) =>
    v.verdict === 'wrong' && v.calibrationScore !== null && v.calibrationScore >= 25,
  )
  if (highCalWrong.length > 0) {
    out.push({
      kind: 'high_calibration_brokers_wrong',
      text: `${highCalWrong.length} high-calibration broker${highCalWrong.length === 1 ? ' was' : 's were'} on the wrong side.`,
      magnitude: 70,
    })
  }

  // 4) Outlier was right.
  if (inputs.divergence.vindicatedOutlierBrokerIds.length > 0) {
    out.push({
      kind: 'outlier_was_right',
      text: `${inputs.divergence.vindicatedOutlierBrokerIds.length} pre-event outlier${inputs.divergence.vindicatedOutlierBrokerIds.length === 1 ? '' : 's'} called it correctly — re-weight them in future briefs.`,
      magnitude: 65,
    })
  }

  // 5) Thin coverage pre-event.
  if (inputs.preSnapshot.distinctBrokers <= 2) {
    out.push({
      kind: 'thin_coverage_pre_event',
      text: `Only ${inputs.preSnapshot.distinctBrokers} broker${inputs.preSnapshot.distinctBrokers === 1 ? '' : 's'} covered the name pre-event — confidence was structurally low.`,
      magnitude: 45,
    })
  }

  // 6) Against-position alert usefulness.
  const againstAlerts = inputs.preEventAlerts.filter((a) =>
    a.kind === 'against_position' && a.lineage.ticker === inputs.preSnapshot.ticker,
  )
  if (againstAlerts.length > 0) {
    const dir = realized
    const wasUseful = (
      // The alert opposes the position thesis. If realized direction
      // contradicts the *position* thesis (i.e. the alert was right to
      // worry), the alert was useful.
      // For a held_long, against_position fires when broker is bearish ⇒ useful if realized=down.
      // For a held_short, against_position fires when broker is bullish ⇒ useful if realized=up.
      // We don't have direction info on the alert here, so we use the
      // book context recorded on the alert itself.
      againstAlerts.some((a) => {
        const dirCtx = a.bookContext?.direction
        if (dirCtx === 'long' && dir === 'down') return true
        if (dirCtx === 'short' && dir === 'up') return true
        return false
      })
    )
    if (wasUseful) {
      out.push({
        kind: 'against_position_useful',
        text: `Against-position alert${againstAlerts.length > 1 ? 's' : ''} pre-event lined up with realized ${dir}.`,
        magnitude: 55,
      })
    } else if (dir === 'up' || dir === 'down') {
      out.push({
        kind: 'against_position_not_useful',
        text: `Against-position alert${againstAlerts.length > 1 ? 's' : ''} pre-event did not match realized ${dir}.`,
        magnitude: 30,
      })
    }
  }

  if (out.length === 0) {
    out.push({
      kind: 'no_significant_error',
      text: 'No significant pre-event expectation error detected.',
      magnitude: 0,
    })
  }

  out.sort((a, b) => b.magnitude - a.magnitude)
  return out
}
