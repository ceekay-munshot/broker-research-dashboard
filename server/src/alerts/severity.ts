// Deterministic severity assignment.
//
// Severity is computed from the (kind, bookContext, signal magnitude)
// triple plus modifier deltas contributed by each AlertReason. The
// resulting bucket is `critical | high | medium | low | info`.
//
// The function is *pure*: same inputs → same severity. No clock.

import type { AlertReason, AlertSeverity, AlertTriggerKind } from '../../../src/domain'

const BUCKET_THRESHOLDS: ReadonlyArray<{ severity: AlertSeverity; min: number }> = [
  { severity: 'critical', min: 80 },
  { severity: 'high',     min: 50 },
  { severity: 'medium',   min: 25 },
  { severity: 'low',      min: 1 },
  { severity: 'info',     min: 0 },
]

/** Base severity score per trigger kind before reason modifiers. */
const KIND_BASE: Record<AlertTriggerKind, number> = {
  new_research_held:               40,
  new_research_watchlist:          15,
  significant_change_held:         55,
  against_position:                70,
  unresolved_divergence_held:      45,
  broker_outlier_held:             40,
  pile_in_book:                    30,
  stale_coverage_high_conviction:  50,
  stale_coverage_held:             25,
  stale_coverage_watchlist:         5,
  watchlist_fresh_candidate:       20,
  correction_replay_change:        45,
}

export function computeSeverity(
  kind: AlertTriggerKind,
  reasons: readonly AlertReason[],
  bookWeightPct: number | null = null,
  bookConviction: 'high' | 'medium' | 'low' | null = null,
): AlertSeverity {
  let score = KIND_BASE[kind]
  for (const r of reasons) score += r.severityDelta ?? 0

  // Position-size weight bonus.
  if (bookWeightPct !== null) {
    if (bookWeightPct >= 7) score += 15
    else if (bookWeightPct >= 5) score += 8
    else if (bookWeightPct >= 3) score += 3
  }
  // High conviction always bumps.
  if (bookConviction === 'high') score += 8

  return scoreToSeverity(score)
}

export function scoreToSeverity(score: number): AlertSeverity {
  for (const t of BUCKET_THRESHOLDS) {
    if (score >= t.min) return t.severity
  }
  return 'info'
}

export function severityRank(s: AlertSeverity): number {
  switch (s) {
    case 'critical': return 0
    case 'high':     return 1
    case 'medium':   return 2
    case 'low':      return 3
    case 'info':     return 4
  }
}
