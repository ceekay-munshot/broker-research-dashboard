// For every (event × window) pair, compute a `SignalOutcome`.
//
// Returns are forward-looking: the close at `asOfDate` is the anchor;
// the close N trading days later is the terminal. We resolve "trading
// days" by stepping forward through the available daily series — gaps
// (weekends, holidays) are absorbed by the fixture's calendar.

import type {
  DailyPricePoint, BenchmarkSeries,
  SignalEvent, SignalOutcome, BenchmarkId,
} from '../../../src/domain'
import { RETURN_WINDOWS, WINDOW_DAYS } from '../../../src/domain'
import type { MarketDataProvider } from './marketProvider'

const FLAT_BPS_PER_DAY = 25 // Below this magnitude per day we mark `flatNoise`.

export function computeOutcomes(
  events: readonly SignalEvent[],
  market: MarketDataProvider,
): readonly SignalOutcome[] {
  const out: SignalOutcome[] = []
  for (const ev of events) {
    const closes = market.getDailyCloses(ev.ticker)
    if (closes.length === 0) continue

    const anchorIdx = findAnchorIndex(closes, ev.asOfDate)
    if (anchorIdx === -1) continue

    const anchor = closes[anchorIdx]!
    const bench = market.getBenchmarkForTicker(ev.ticker)
    const benchAnchorIdx = bench ? findAnchorIndexBench(bench, ev.asOfDate) : -1

    for (const window of RETURN_WINDOWS) {
      const days = WINDOW_DAYS[window]
      const terminalIdx = anchorIdx + days
      if (terminalIdx >= closes.length) continue
      const terminal = closes[terminalIdx]!
      const rawReturnPct = ((terminal.close - anchor.close) / anchor.close) * 100
      let benchmarkRelReturnPct: number | null = null
      let benchmarkId: BenchmarkId | null = null
      if (bench && benchAnchorIdx !== -1) {
        const benchTerminalIdx = benchAnchorIdx + days
        if (benchTerminalIdx < bench.points.length) {
          const a = bench.points[benchAnchorIdx]!
          const t = bench.points[benchTerminalIdx]!
          const benchReturnPct = ((t.close - a.close) / a.close) * 100
          benchmarkRelReturnPct = rawReturnPct - benchReturnPct
          benchmarkId = bench.id
        }
      }
      const flatNoise = Math.abs(rawReturnPct) <= (FLAT_BPS_PER_DAY / 100) * days
      let directionallyCorrect: boolean | null = null
      if (ev.expectedDirection !== null) {
        if (flatNoise) directionallyCorrect = null
        else if (ev.expectedDirection === 'up')   directionallyCorrect = rawReturnPct > 0
        else if (ev.expectedDirection === 'down') directionallyCorrect = rawReturnPct < 0
        else if (ev.expectedDirection === 'flat') directionallyCorrect = flatNoise
      }
      out.push({
        eventId: ev.id,
        window,
        rawReturnPct: round2(rawReturnPct),
        benchmarkRelReturnPct: benchmarkRelReturnPct === null ? null : round2(benchmarkRelReturnPct),
        benchmarkId,
        directionallyCorrect,
        flatNoise,
      })
    }
  }
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findAnchorIndex(closes: readonly DailyPricePoint[], asOfDate: string): number {
  // Binary search for the first close at or after `asOfDate`. If asOfDate
  // is a weekend / holiday in the fixture calendar, we step forward to
  // the next available trading day.
  let lo = 0, hi = closes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const d = closes[mid]!.date
    if (d < asOfDate) lo = mid + 1
    else hi = mid - 1
  }
  if (lo >= closes.length) return -1
  return lo
}

function findAnchorIndexBench(bench: BenchmarkSeries, asOfDate: string): number {
  return findAnchorIndex(bench.points, asOfDate)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
