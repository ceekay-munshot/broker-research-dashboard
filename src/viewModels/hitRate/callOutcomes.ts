// Turns a broker's calls on a stock into table rows: for each call, how the
// stock has moved since (gain %) and whether the price target has been met.
//
// Pure transform. "Target met" is judged on the current price vs the target —
// the one comparison that works on the live feed (current price + the call's
// own target). The gain % needs the price at the call date, so it's populated
// from the sample price series in demo mode and falls back to "—" on a live
// feed that has no price history yet.

import type { DailyPricePoint, Rating, Stance } from '../../domain'

export type CallDirection = 'up' | 'down' | 'flat'

/** Has the call's price target been met by the current price? */
export type CallResult =
  | 'hit'     // current price has reached / passed the target
  | 'open'    // directional call, target not reached yet
  | 'na'      // no target, or a Hold / no-view note

export interface CallRowInput {
  readonly reportId: string
  readonly publishedAt: string          // ISO 8601 timestamp
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
}

export interface CallRow {
  readonly reportId: string
  readonly date: string                 // YYYY-MM-DD
  readonly rating: Rating | null
  readonly direction: CallDirection
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
  readonly callPrice: number | null     // close on/just-before the call date
  readonly cmp: number | null           // current market price (same for the stock)
  readonly gainPct: number | null       // (cmp − callPrice) / callPrice, signed
  readonly favorable: boolean | null     // did that move help the call's direction?
  readonly result: CallResult
}

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

/**
 * Build one row per call. `cmp` is the stock's current price (live when
 * available, else the latest sample close) — the same value for every row.
 */
export function buildCallRows(
  calls: readonly CallRowInput[],
  closes: readonly DailyPricePoint[],
  cmp: number | null,
): readonly CallRow[] {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date))
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1]!.date : null

  return calls.map((c) => {
    const direction = directionFor(c.rating, c.stance)
    const date = c.publishedAt.slice(0, 10)

    // Price at the call: only when the call falls within the price window.
    // Calls more recent than the series (no anchor) get a null call price.
    const anchorIdx = findAnchorIndex(sorted, date)
    const inWindow = anchorIdx >= 0 && lastDate !== null && date <= lastDate
    const callPrice = inWindow ? sorted[anchorIdx]!.close : null

    const gainPct = callPrice !== null && callPrice !== 0 && cmp !== null
      ? ((cmp - callPrice) / callPrice) * 100
      : null
    const favorable = gainPct === null || direction === 'flat'
      ? null
      : direction === 'up' ? gainPct > 0 : gainPct < 0

    let result: CallResult = 'na'
    if (c.targetPrice !== null && cmp !== null && direction !== 'flat') {
      const hit = direction === 'up' ? cmp >= c.targetPrice : cmp <= c.targetPrice
      result = hit ? 'hit' : 'open'
    }

    return {
      reportId: c.reportId,
      date,
      rating: c.rating,
      direction,
      targetPrice: c.targetPrice,
      targetCurrency: c.targetCurrency,
      callPrice,
      cmp,
      gainPct,
      favorable,
      result,
    }
  })
}
