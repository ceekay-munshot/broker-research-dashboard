// Maps a broker's past calls onto a daily-close price series and decides,
// for each call, whether it played out — the data behind the Hit Rate
// drill-down chart's ▲/▼ markers.
//
// This mirrors the server calibration engine's outcome math
// (server/src/calibration/outcomes.ts): anchor at the close on/just-before
// the call date, look a fixed window forward, compare realised direction to
// the call's expected direction. It runs client-side here purely to colour
// the chart markers against the (sample) price series; the authoritative
// per-analyst hit-rate % shown in the leaderboard still comes straight from
// the snapshot.

import type { DailyPricePoint, Rating, Stance } from '../../domain'

export type CallDirection = 'up' | 'down' | 'flat'

export type CallOutcome =
  | 'correct'   // directional call, moved the called way
  | 'wrong'     // directional call, moved against
  | 'neutral'   // a Hold / no-view call — no directional bet to grade
  | 'pending'   // too recent — no forward price yet to judge it
  | 'no_price'  // call falls outside the available price window

export interface CallMarkerInput {
  readonly reportId: string
  readonly publishedAt: string        // ISO 8601 timestamp
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
}

export interface CallMarker {
  readonly reportId: string
  readonly date: string               // YYYY-MM-DD — the call date (x position)
  readonly direction: CallDirection
  readonly anchorClose: number | null // price at the call (y position)
  readonly forwardClose: number | null
  readonly returnPct: number | null
  readonly outcome: CallOutcome
  readonly targetPrice: number | null
}

export interface MarkerTally {
  /** Directional calls old enough to judge (correct + wrong). */
  readonly evaluated: number
  readonly correct: number
  /** correct / evaluated, as a 0..1 fraction; null when nothing evaluated. */
  readonly hitRate: number | null
}

// Forward window for grading a call. 20 ≈ WINDOW_DAYS['20d'] — the longest,
// least-noisy horizon the ~120-point sample series supports. The fixture
// series steps one point per calendar day, so a step ≈ a trading day, matching
// how the server indexes closes by array offset.
const HORIZON_STEPS = 20

// Visual noise floor: a move smaller than this over the horizon isn't credited
// to the call either way (it reads as "didn't really play out"). Kept tight so
// the chart's green/red signal stays legible — lighter than the calibration
// engine's window-scaled band, since this only colours markers, it doesn't feed
// the authoritative leaderboard hit rate.
const FLAT_PCT_BAND = 1.0

/** Expected direction a call implies, from its rating (preferred) or stance. */
export function directionFor(rating: Rating | null, stance: Stance): CallDirection {
  if (rating === 'Buy' || rating === 'Overweight') return 'up'
  if (rating === 'Sell' || rating === 'Underweight') return 'down'
  if (rating === 'Hold' || rating === 'Not Rated') return 'flat'
  if (stance === 'bullish') return 'up'
  if (stance === 'bearish') return 'down'
  return 'flat'
}

/** Largest index whose date is on/before `dateStr`. Expects ascending dates. */
function findAnchorIndex(closes: readonly DailyPricePoint[], dateStr: string): number {
  let idx = -1
  for (let i = 0; i < closes.length; i++) {
    if (closes[i]!.date <= dateStr) idx = i
    else break
  }
  return idx
}

/** Grade each call against the price series. Order of `calls` is preserved. */
export function buildCallMarkers(
  calls: readonly CallMarkerInput[],
  closes: readonly DailyPricePoint[],
): readonly CallMarker[] {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date))

  return calls.map((c) => {
    const direction = directionFor(c.rating, c.stance)
    const date = c.publishedAt.slice(0, 10)
    const base = { reportId: c.reportId, date, direction, targetPrice: c.targetPrice }

    const anchorIdx = sorted.length > 0 ? findAnchorIndex(sorted, date) : -1
    if (anchorIdx < 0) {
      return { ...base, anchorClose: null, forwardClose: null, returnPct: null, outcome: 'no_price' as const }
    }
    const anchorClose = sorted[anchorIdx]!.close

    // A Hold / no-view note isn't a directional bet — plot it, don't grade it.
    if (direction === 'flat') {
      return { ...base, anchorClose, forwardClose: null, returnPct: null, outcome: 'neutral' as const }
    }

    const fwdIdx = anchorIdx + HORIZON_STEPS
    if (fwdIdx >= sorted.length) {
      return { ...base, anchorClose, forwardClose: null, returnPct: null, outcome: 'pending' as const }
    }
    const forwardClose = sorted[fwdIdx]!.close
    const returnPct = ((forwardClose - anchorClose) / anchorClose) * 100

    // Within the dead-band the move is noise — neither a hit nor a miss.
    if (Math.abs(returnPct) <= FLAT_PCT_BAND) {
      return { ...base, anchorClose, forwardClose, returnPct, outcome: 'neutral' as const }
    }
    const correct = direction === 'up' ? returnPct > 0 : returnPct < 0
    return { ...base, anchorClose, forwardClose, returnPct, outcome: correct ? 'correct' as const : 'wrong' as const }
  })
}

/** Roll markers up into the small "X of Y calls worked" tally for a stock. */
export function tallyMarkers(markers: readonly CallMarker[]): MarkerTally {
  let evaluated = 0
  let correct = 0
  for (const m of markers) {
    if (m.outcome === 'correct' || m.outcome === 'wrong') {
      evaluated++
      if (m.outcome === 'correct') correct++
    }
  }
  return { evaluated, correct, hitRate: evaluated > 0 ? correct / evaluated : null }
}
