// Pure aggregation helpers for calibration. No I/O.

import type {
  ConfidenceBand, OutcomeWindowResult, ReturnWindow, SignalOutcome,
} from '../../../src/domain'
import { RETURN_WINDOWS } from '../../../src/domain'

/** Aggregate a flat list of outcomes into per-window stats. */
export function aggregateByWindow(outcomes: readonly SignalOutcome[]): readonly OutcomeWindowResult[] {
  return RETURN_WINDOWS.map((window) => {
    const inWindow = outcomes.filter((o) => o.window === window && o.rawReturnPct !== null)
    const dirInWindow = inWindow.filter((o) => o.directionallyCorrect !== null)
    const sample = inWindow.length
    if (sample === 0) {
      return zeroWindow(window)
    }
    const raws = inWindow.map((o) => o.rawReturnPct as number)
    const rels = inWindow.map((o) => o.benchmarkRelReturnPct).filter((r): r is number => r !== null)
    const dir = dirInWindow.length === 0 ? null : dirInWindow.filter((o) => o.directionallyCorrect === true).length / dirInWindow.length
    const sortedRaws = [...raws].sort((a, b) => a - b)
    const median = quantile(sortedRaws, 0.5)
    const p25 = quantile(sortedRaws, 0.25)
    const p75 = quantile(sortedRaws, 0.75)
    const upside = raws.filter((r) => r > 0)
    const downside = raws.filter((r) => r < 0)
    const upsideAvg = upside.length ? mean(upside) : 0
    const downsideAvg = downside.length ? mean(downside) : 0
    const m = mean(raws)
    return {
      window,
      sampleSize: sample,
      hitRate: dir,
      meanReturnPct: round2(m),
      medianReturnPct: round2(median),
      p25ReturnPct: round2(p25),
      p75ReturnPct: round2(p75),
      upsideAvgPct: round2(upsideAvg),
      downsideAvgPct: round2(downsideAvg),
      stddevPct: round2(stddev(raws, m)),
      meanRelReturnPct: rels.length === 0 ? null : round2(mean(rels)),
      directionalSampleSize: dirInWindow.length,
    }
  })
}

export function bandFor(sampleSize: number): ConfidenceBand {
  if (sampleSize >= 30) return 'high'
  if (sampleSize >= 15) return 'medium'
  if (sampleSize >= 5)  return 'low'
  return 'very_low'
}

/** Compute a calibration "score" in [-100, 100] from window stats.
 *  Positive = predictive; near zero = noisy; negative = fade signal.
 *  - hit rate (vs 50%) drives the directional score
 *  - mean benchmark-relative return (or raw, if no benchmark) drives the magnitude
 *  - sample-size discount reduces over-weighting of tiny samples */
export function calibrationScore(opts: {
  readonly hitRate: number | null
  readonly meanRelOrRaw: number
  readonly sampleSize: number
}): number {
  const dirComponent = opts.hitRate !== null ? (opts.hitRate - 0.5) * 100 : 0
  const magComponent = clamp(opts.meanRelOrRaw, -8, 8) * 4 // ±32 from ±8% mean
  const blended = (dirComponent * 0.6) + (magComponent * 0.4)
  // Sample-size discount: at n=30 we apply 100%, at n=5 we apply ~50%.
  const k = Math.min(1, opts.sampleSize / 30)
  const discount = 0.5 + 0.5 * k
  return clamp(round2(blended * discount), -100, 100)
}

// ── Stat helpers ──────────────────────────────────────────────────────────

function mean(arr: readonly number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, x) => s + x, 0) / arr.length
}
function stddev(arr: readonly number[], m: number): number {
  if (arr.length < 2) return 0
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(v)
}
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) return sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!)
  return sorted[base]!
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function zeroWindow(window: ReturnWindow): OutcomeWindowResult {
  return {
    window,
    sampleSize: 0,
    hitRate: null,
    meanReturnPct: 0,
    medianReturnPct: 0,
    p25ReturnPct: 0,
    p75ReturnPct: 0,
    upsideAvgPct: 0,
    downsideAvgPct: 0,
    stddevPct: 0,
    meanRelReturnPct: null,
    directionalSampleSize: 0,
  }
}
