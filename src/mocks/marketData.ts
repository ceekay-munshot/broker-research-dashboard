// Deterministic mock market data.
//
// Generates ~120 trading days of closes for every ticker in `stocks` plus
// one INR benchmark series ("NIFTY50 mock"). Returns are produced with
// a seeded LCG so re-running yields identical output — the calibration
// engine therefore yields stable per-broker / per-alert scores in dev.

import type { BenchmarkSeries, DailyPricePoint } from '../domain'
import { asBenchmarkId, asTicker } from '../lib/ids'
import { stocks } from './stocks'

const TRADING_DAYS = 120
const END_DATE = new Date('2026-04-25T00:00:00Z')

// ── Seeded RNG for deterministic price series ────────────────────────────

function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** A normal-ish (Box–Muller) draw scaled to a target stddev. */
function gauss(rng: () => number, mean: number, sd: number): number {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * sd
}

/** ISO date string for a given trading day offset back from END_DATE. */
function isoBack(daysBack: number): string {
  const d = new Date(END_DATE.getTime() - daysBack * 86400e3)
  return d.toISOString().slice(0, 10)
}

function buildSeriesFor(ticker: string, anchor: number, sdPctDaily: number, currency: string, seed: number): DailyPricePoint[] {
  const rng = lcg(seed)
  const closes: number[] = []
  let last = anchor
  for (let i = 0; i < TRADING_DAYS; i++) {
    // Slight upward drift, modest noise. Vary by ticker via seed.
    const r = gauss(rng, 0.0004, sdPctDaily)
    last = last * (1 + r)
    closes.push(last)
  }
  const out: DailyPricePoint[] = []
  for (let i = 0; i < TRADING_DAYS; i++) {
    out.push({
      ticker: asTicker(ticker),
      date: isoBack(TRADING_DAYS - 1 - i),
      close: Number(closes[i]!.toFixed(2)),
      currency,
    })
  }
  return out
}

const TICKER_SEEDS: Readonly<Record<string, { sd: number; seed: number }>> = {
  TCS:        { sd: 0.012, seed: 11 },
  INFY:       { sd: 0.013, seed: 22 },
  HCLTECH:    { sd: 0.014, seed: 33 },
  WIPRO:      { sd: 0.016, seed: 44 },
  HDFCBANK:   { sd: 0.011, seed: 55 },
  ICICIBANK:  { sd: 0.012, seed: 66 },
  SBIN:       { sd: 0.014, seed: 77 },
  RELIANCE:   { sd: 0.013, seed: 88 },
  ONGC:       { sd: 0.018, seed: 99 },
  SUNPHARMA:  { sd: 0.015, seed: 110 },
  DRREDDY:    { sd: 0.014, seed: 121 },
  HINDUNILVR: { sd: 0.011, seed: 132 },
  MARUTI:     { sd: 0.015, seed: 143 },
  TATAMOTORS: { sd: 0.018, seed: 154 },
  LT:         { sd: 0.013, seed: 165 },
}

export const dailyPricePoints: readonly DailyPricePoint[] = (() => {
  const out: DailyPricePoint[] = []
  for (const s of stocks) {
    const tk = s.ticker as unknown as string
    const cfg = TICKER_SEEDS[tk] ?? { sd: 0.013, seed: 200 }
    const anchorPrice = s.lastPrice ?? 1000
    out.push(...buildSeriesFor(tk, anchorPrice, cfg.sd, s.currency, cfg.seed))
  }
  return out
})()

// ── Benchmark series ─────────────────────────────────────────────────────

const BENCHMARK_ID = asBenchmarkId('bench_nifty50_mock')

const niftyPoints: DailyPricePoint[] = (() => {
  const rng = lcg(7)
  const closes: number[] = []
  let last = 22500
  for (let i = 0; i < TRADING_DAYS; i++) {
    const r = gauss(rng, 0.0003, 0.0085)
    last = last * (1 + r)
    closes.push(last)
  }
  return closes.map((c, i) => ({
    ticker: asTicker('__NIFTY50__'), // placeholder — benchmark series isn't a real stock
    date: isoBack(TRADING_DAYS - 1 - i),
    close: Number(c.toFixed(2)),
    currency: 'INR',
  }))
})()

export const benchmarkSeries: readonly BenchmarkSeries[] = [
  {
    id: BENCHMARK_ID,
    name: 'NIFTY50 (mock)',
    currency: 'INR',
    points: niftyPoints,
  },
]
