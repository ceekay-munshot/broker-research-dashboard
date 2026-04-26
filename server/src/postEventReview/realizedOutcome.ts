// Compute the deterministic realized outcome for a completed catalyst.
//
// Anchor = the close on (or first close after) the catalyst's
// `expectedDate`. We emit a window stat for {1d, 3d, 5d, 10d}. Direction
// is set per window with a flat-noise threshold (25 bps × N). The
// "headline" direction is the sign that most windows agreed on, or
// 'mixed' / 'flat' as appropriate.

import type {
  CatalystEvent, RealizedOutcome, RealizedOutcomeWindow,
  DailyPricePoint,
} from '../../../src/domain'
import type { MarketDataProvider } from '../calibration/marketProvider'

const FLAT_BPS_PER_DAY = 25
const WINDOWS: RealizedOutcomeWindow['window'][] = ['1d', '3d', '5d', '10d']
const DAYS: Readonly<Record<RealizedOutcomeWindow['window'], number>> = {
  '1d': 1, '3d': 3, '5d': 5, '10d': 10,
}

export function computeRealizedOutcome(
  catalyst: CatalystEvent,
  market: MarketDataProvider,
): RealizedOutcome {
  const closes = market.getDailyCloses(catalyst.ticker)
  if (closes.length === 0) {
    return {
      ticker: catalyst.ticker,
      anchorDate: catalyst.expectedDate,
      anchorPrice: null,
      anchorCurrency: null,
      windows: WINDOWS.map((w) => ({
        window: w, rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' as const,
      })),
      headlineDirection: 'unknown',
      hasCoverage: false,
      coverageNote: 'No price coverage for this ticker.',
    }
  }

  const anchorIdx = findAnchorIndex(closes, catalyst.expectedDate)
  if (anchorIdx === -1) {
    return {
      ticker: catalyst.ticker,
      anchorDate: catalyst.expectedDate,
      anchorPrice: null,
      anchorCurrency: closes[0]?.currency ?? null,
      windows: WINDOWS.map((w) => ({
        window: w, rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' as const,
      })),
      headlineDirection: 'unknown',
      hasCoverage: true,
      coverageNote: 'Anchor close at or after the event date is missing.',
    }
  }
  const anchor = closes[anchorIdx]!

  const bench = market.getBenchmarkForTicker(catalyst.ticker)
  const benchAnchorIdx = bench ? findAnchorIndex(bench.points, catalyst.expectedDate) : -1

  const windows: RealizedOutcomeWindow[] = []
  for (const w of WINDOWS) {
    const days = DAYS[w]
    const terminalIdx = anchorIdx + days
    if (terminalIdx >= closes.length) {
      windows.push({ window: w, rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' })
      continue
    }
    const terminal = closes[terminalIdx]!
    const rawReturnPct = ((terminal.close - anchor.close) / anchor.close) * 100
    let benchmarkRelReturnPct: number | null = null
    if (bench && benchAnchorIdx !== -1) {
      const bTerm = benchAnchorIdx + days
      if (bTerm < bench.points.length) {
        const a = bench.points[benchAnchorIdx]!
        const t = bench.points[bTerm]!
        const benchReturnPct = ((t.close - a.close) / a.close) * 100
        benchmarkRelReturnPct = rawReturnPct - benchReturnPct
      }
    }
    const flatThresh = (FLAT_BPS_PER_DAY / 100) * days
    const direction: RealizedOutcomeWindow['direction'] =
      Math.abs(rawReturnPct) <= flatThresh ? 'flat' :
      rawReturnPct > 0 ? 'up' :
      rawReturnPct < 0 ? 'down' : 'unknown'
    windows.push({
      window: w,
      rawReturnPct: round2(rawReturnPct),
      benchmarkRelReturnPct: benchmarkRelReturnPct === null ? null : round2(benchmarkRelReturnPct),
      direction,
    })
  }

  const headline = headlineDirectionOf(windows)
  return {
    ticker: catalyst.ticker,
    anchorDate: anchor.date,
    anchorPrice: anchor.close,
    anchorCurrency: anchor.currency,
    windows,
    headlineDirection: headline,
    hasCoverage: true,
    coverageNote: terminalCoverageNote(windows),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findAnchorIndex(closes: readonly DailyPricePoint[], asOfDate: string): number {
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

function headlineDirectionOf(
  windows: readonly RealizedOutcomeWindow[],
): RealizedOutcome['headlineDirection'] {
  const known = windows.filter((w) => w.direction !== 'unknown')
  if (known.length === 0) return 'unknown'
  const ups = known.filter((w) => w.direction === 'up').length
  const downs = known.filter((w) => w.direction === 'down').length
  const flats = known.filter((w) => w.direction === 'flat').length
  if (ups >= 2 && downs === 0) return 'up'
  if (downs >= 2 && ups === 0) return 'down'
  if (flats >= Math.ceil(known.length / 2)) return 'flat'
  if (ups > 0 && downs > 0) return 'mixed'
  if (ups > downs) return 'up'
  if (downs > ups) return 'down'
  return 'flat'
}

function terminalCoverageNote(windows: readonly RealizedOutcomeWindow[]): string | null {
  const missing = windows.filter((w) => w.rawReturnPct === null).map((w) => w.window)
  if (missing.length === 0) return null
  return `Terminal close missing for windows: ${missing.join(', ')}.`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
