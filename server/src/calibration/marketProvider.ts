// ─────────────────────────────────────────────────────────────────────────
// Market data input seam.
//
// The calibration engine reads price + benchmark data through a
// `MarketDataProvider` so we can swap the source without touching the
// engine, the API, or the UI. Today we ship:
//
//   - FixtureMarketDataProvider — backed by src/mocks/marketData.ts
//   - EmptyMarketDataProvider   — returns nothing; calibration produces
//                                 zero-sample summaries (graceful)
//
// Future implementations slot in as additional classes. Do not import
// vendor SDKs from the engine or API directly.
// ─────────────────────────────────────────────────────────────────────────

import type { BenchmarkSeries, DailyPricePoint, StockTicker, BenchmarkId } from '../../../src/domain'
import { dailyPricePoints, benchmarkSeries } from '../../../src/mocks/marketData'

export interface MarketDataProvider {
  /** Return the daily close series for the given ticker, sorted ascending
   *  by date. Empty array when no coverage. */
  getDailyCloses(ticker: StockTicker): readonly DailyPricePoint[]
  /** Default benchmark for a given ticker — usually one per currency.
   *  Null when no benchmark coverage exists yet. */
  getBenchmarkForTicker(ticker: StockTicker): BenchmarkSeries | null
  /** Look up a benchmark by id. */
  getBenchmark(id: BenchmarkId): BenchmarkSeries | null
  /** Cheap "is anything available" check — used to label degraded mode. */
  hasAnyCoverage(): boolean
}

export class FixtureMarketDataProvider implements MarketDataProvider {
  private readonly closesByTicker: Map<string, DailyPricePoint[]>
  private readonly benchById: Map<string, BenchmarkSeries>

  constructor(
    closes: readonly DailyPricePoint[] = dailyPricePoints,
    benches: readonly BenchmarkSeries[] = benchmarkSeries,
  ) {
    const m = new Map<string, DailyPricePoint[]>()
    for (const p of closes) {
      const k = p.ticker as string
      const arr = m.get(k) ?? []
      arr.push(p)
      m.set(k, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
    this.closesByTicker = m
    this.benchById = new Map(benches.map((b) => [b.id as string, b]))
  }

  getDailyCloses(ticker: StockTicker): readonly DailyPricePoint[] {
    return this.closesByTicker.get(ticker as string) ?? []
  }

  getBenchmark(id: BenchmarkId): BenchmarkSeries | null {
    return this.benchById.get(id as string) ?? null
  }

  /** Currency-driven default. Future per-sector / per-exchange mappings
   *  live here. */
  getBenchmarkForTicker(ticker: StockTicker): BenchmarkSeries | null {
    const closes = this.closesByTicker.get(ticker as string)
    if (!closes || closes.length === 0) return null
    const ccy = closes[0]!.currency
    for (const b of this.benchById.values()) {
      if (b.currency === ccy) return b
    }
    return null
  }

  hasAnyCoverage(): boolean {
    return this.closesByTicker.size > 0
  }
}

export class EmptyMarketDataProvider implements MarketDataProvider {
  getDailyCloses(): readonly DailyPricePoint[] { return [] }
  getBenchmark(): BenchmarkSeries | null { return null }
  getBenchmarkForTicker(): BenchmarkSeries | null { return null }
  hasAnyCoverage(): boolean { return false }
}
