// ─────────────────────────────────────────────────────────────────────────
// Deterministic worklog priority scoring.
//
// Rules are explicit, points-based, and every rule that fires contributes
// a short human-readable reason. No LLM, no opaque scoring. The rules
// below are intentionally boring — the *explanation* is the product.
//
// Score → bucket:
//   ≥ 60 → high
//   ≥ 25 → medium
//   else → low
//
// Keep this file pure. No React, no side effects, no adapter imports.
// ─────────────────────────────────────────────────────────────────────────

import type {
  PriorityBucket, PriorityReason, WorklogItem, WorklogOrigin,
} from './types'

export interface PriorityInput {
  readonly reportType: string
  readonly rating: WorklogItem['rating']
  readonly priorRating?: WorklogItem['rating'] // reserved for a future upstream field
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly stance: WorklogItem['stance']
  readonly origin: WorklogOrigin
  readonly evidenceCount: number
  readonly hasDivergence: boolean
  /** Count of *other* brokers that covered this ticker on the same UTC day. */
  readonly sameDayBrokerOverlap: number
  readonly receivedAt: string
  /** Anchor used to evaluate recency. Defaults to now. */
  readonly now?: Date
}

export function scoreWorklogItem(input: PriorityInput): {
  readonly bucket: PriorityBucket
  readonly score: number
  readonly reasons: readonly PriorityReason[]
} {
  const reasons: PriorityReason[] = []
  const fire = (code: string, text: string, points: number) => {
    reasons.push({ code, text, points })
  }

  // Rule 1 — Report type carries strong intrinsic signal. Earnings + flash +
  // initiation are events; morning/sector notes are digests.
  const TYPE_POINTS: Readonly<Record<string, number>> = {
    earnings_review:  25,
    earnings_preview: 20,
    flash:            25,
    initiation:       25,
    update:           15,
    deep_dive:        15,
    sector_note:      5,
    morning_note:     0,
    other:            0,
  }
  const typePts = TYPE_POINTS[input.reportType] ?? 0
  if (typePts > 0) fire('report_type', `${readableType(input.reportType)} report`, typePts)

  // Rule 2 — Target price change. The larger the move, the stronger the
  // signal. Thresholds chosen to match analyst intuition (double-digit
  // moves are meaningful).
  if (input.targetPrice !== null && input.priorTargetPrice !== null && input.priorTargetPrice > 0) {
    const pct = ((input.targetPrice - input.priorTargetPrice) / input.priorTargetPrice) * 100
    const dir = pct > 0 ? 'raised' : 'cut'
    const abs = Math.abs(pct)
    if (abs >= 10)       fire('tp_change_big',   `Target ${dir} ${abs.toFixed(1)}%`, 35)
    else if (abs >= 5)   fire('tp_change_mid',   `Target ${dir} ${abs.toFixed(1)}%`, 20)
    else if (abs > 0)    fire('tp_change_small', `Target ${dir} ${abs.toFixed(1)}%`, 8)
  }

  // Rule 3 — Rating-bearing note on an active position is higher signal
  // than "Not Rated". Penalize no-rating digest items.
  if (input.rating && input.rating !== 'Not Rated') {
    fire('rated', `Rating ${input.rating}`, 6)
  } else {
    fire('no_rating', 'No rating attached', -5)
  }

  // Rule 4 — Multi-broker same-day convergence. Each additional broker
  // covering the same stock today is a sign the Street is moving.
  if (input.sameDayBrokerOverlap >= 1) {
    const pts = Math.min(input.sameDayBrokerOverlap * 10, 25)
    const n = input.sameDayBrokerOverlap + 1
    fire('multi_broker', `${n} brokers covering today`, pts)
  }

  // Rule 5 — Divergence / disagreement on this ticker.
  if (input.hasDivergence) {
    fire('divergence', 'Street divergence on this ticker', 15)
  }

  // Rule 6 — Evidence richness. A note the model grounded in ≥3 snippets
  // is worth reading over one with nothing to point at.
  if (input.evidenceCount >= 3)      fire('evidence_rich',  `${input.evidenceCount} evidence snippets`, 10)
  else if (input.evidenceCount >= 1) fire('evidence_some',  `${input.evidenceCount} evidence snippet${input.evidenceCount === 1 ? '' : 's'}`, 4)
  else                               fire('evidence_none',  'No evidence attached', -3)

  // Rule 7 — Recency boost. Something that landed this morning is worth
  // more attention than yesterday's leftover.
  const now = input.now ?? new Date()
  const hoursOld = (now.getTime() - Date.parse(input.receivedAt)) / (1000 * 60 * 60)
  if (hoursOld <= 4)       fire('recency_fresh',  `Received in last 4h`, 8)
  else if (hoursOld <= 12) fire('recency_today',  `Received today`, 4)

  // Rule 8 — Single-stock directly actionable beats a sector/digest split.
  if (input.origin === 'direct_attachment') fire('direct_attachment', 'Direct note with attachment', 6)
  else if (input.origin === 'direct_body')   fire('direct_body',       'Direct note (body-only)', 3)
  else /* digest_split */                     fire('digest_split',      'Split from digest', -4)

  // Rule 9 — Bearish notes often carry explicit catalysts or downgrades;
  // a small boost nudges them above neutral noise.
  if (input.stance === 'bearish') fire('bearish_signal', 'Bearish stance', 4)

  const score = reasons.reduce((s, r) => s + r.points, 0)
  const bucket: PriorityBucket = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low'
  // Reasons ordered descending by point contribution so the "most
  // important fact first" surfaces in tight UI space.
  const sortedReasons = [...reasons].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  return { bucket, score, reasons: sortedReasons }
}

function readableType(t: string): string {
  // Keep labels short — the reason string is space-constrained in the UI.
  return t.replace(/_/g, ' ')
}
