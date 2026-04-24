// ─────────────────────────────────────────────────────────────────────────
// Change-significance scoring. Deterministic, points-based, explainable.
// Every rule that fires contributes a reason string; the detail panel
// displays them verbatim so the analyst can audit why a change was
// flagged as major vs minor.
//
// Score → bucket:
//   first_coverage    → no prior (always reported separately)
//   major             ≥ 50
//   moderate          ≥ 20
//   minor             else
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────

import type { Comparability, Significance, SignificanceBucket, SignificanceReason } from './types'

export interface SignificanceInput {
  readonly comparability: Comparability
  readonly ratingChanged: boolean
  readonly stanceChanged: boolean
  readonly targetChangePct: number | null
  readonly themesAddedCount: number
  readonly themesDroppedCount: number
  readonly risksAddedCount: number
  readonly risksDroppedCount: number
  readonly keyPointsDelta: number
  readonly evidenceDelta: number
}

export function scoreSignificance(input: SignificanceInput): Significance {
  if (input.comparability === 'first_coverage') {
    return {
      bucket: 'first_coverage',
      score: 0,
      reasons: [{
        code: 'first_coverage',
        text: 'No prior note from this broker on this stock',
        points: 0,
      }],
    }
  }

  const reasons: SignificanceReason[] = []
  const fire = (code: string, text: string, points: number) => reasons.push({ code, text, points })

  // Rule 1 — Rating change is the biggest single signal.
  if (input.ratingChanged) fire('rating_changed', 'Rating changed', 40)

  // Rule 2 — Stance flip is nearly as important.
  if (input.stanceChanged) fire('stance_changed', 'Stance changed', 25)

  // Rule 3 — Target price delta bands. Use absolute value; direction is
  // shown separately in the headline.
  if (input.targetChangePct !== null) {
    const abs = Math.abs(input.targetChangePct)
    if (abs >= 15)      fire('tp_major',    `Target moved ≥ 15%`, 35)
    else if (abs >= 5)  fire('tp_moderate', `Target moved ${abs.toFixed(1)}%`, 15)
    else if (abs > 0)   fire('tp_minor',    `Target moved ${abs.toFixed(1)}%`, 5)
  }

  // Rule 4 — Risk emergence / resolution. We weight new risks a little
  // higher than dropped risks (bad news is more actionable than
  // quiet resolution).
  if (input.risksAddedCount >= 2)        fire('risks_added_many', `${input.risksAddedCount} new risks`, 15)
  else if (input.risksAddedCount === 1)  fire('risks_added_one',  '1 new risk',                       8)
  if (input.risksDroppedCount >= 2)      fire('risks_dropped_many', `${input.risksDroppedCount} risks resolved`, 10)
  else if (input.risksDroppedCount === 1) fire('risks_dropped_one', '1 risk resolved',                5)

  // Rule 5 — Thematic churn.
  if (input.themesAddedCount + input.themesDroppedCount >= 3) {
    fire('themes_churn', `${input.themesAddedCount + input.themesDroppedCount} theme changes`, 10)
  } else if (input.themesAddedCount >= 1 || input.themesDroppedCount >= 1) {
    fire('themes_delta', `Theme delta (${input.themesAddedCount}+ / ${input.themesDroppedCount}−)`, 4)
  }

  // Rule 6 — Evidence density growth signals a more considered note.
  if (input.evidenceDelta >= 3) fire('evidence_up', `+${input.evidenceDelta} evidence snippets`, 4)

  // Rule 7 — Comparability penalty. A low-confidence pair gets scored
  // down slightly so a digest-vs-direct flip doesn't masquerade as a
  // view change.
  if (input.comparability === 'low') fire('low_comparability', 'Digest vs direct — reduced confidence', -5)

  const score = reasons.reduce((s, r) => s + r.points, 0)
  const bucket: SignificanceBucket =
    score >= 50 ? 'major'
    : score >= 20 ? 'moderate'
    : 'minor'

  if (reasons.length === 0) {
    reasons.push({ code: 'unchanged', text: 'No material change vs prior note', points: 0 })
  }

  // Sort reasons by absolute points (biggest first) for the UI.
  const sorted = [...reasons].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))

  return { bucket, score, reasons: sorted }
}
