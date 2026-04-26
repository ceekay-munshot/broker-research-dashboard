// ─────────────────────────────────────────────────────────────────────────
// HTTP-shape market-data provider.
//
// Calls a configured upstream that returns daily price points + benchmark
// series. Tickers are sourced from the canonical store (the set we
// actually need coverage for). Watermark is the latest `date` we've
// already pulled for any ticker.
//
// To activate:
//   SOURCE_MARKET_DATA_MODE=http
//   SOURCE_MARKET_DATA_BASE_URL=https://prices.example.com
//   SOURCE_MARKET_DATA_TOKEN_ENV=PRICES_TOKEN
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, DailyPricePoint, BenchmarkSeries, SourceProviderMode, StockTicker,
} from '../../../../src/domain'
import type { Repo } from '../../persistence'
import type { SyncableProvider, ProviderSyncResult, ProviderBackfillResult } from '../types'

export interface HttpMarketDataProviderOptions {
  readonly orgId: OrgId
  readonly baseUrl: string
  readonly token: string | null
  readonly repo: Repo
  readonly fetchImpl?: typeof fetch
  /** Tickers we should pull each cycle. Caller decides how to source
   *  the universe (typically from canonical reports + portfolio). */
  readonly tickerProvider: () => readonly StockTicker[]
  readonly onPrices?: (points: readonly DailyPricePoint[]) => void
  readonly onBenchmarks?: (benches: readonly BenchmarkSeries[]) => void
}

export class HttpMarketDataProvider implements SyncableProvider {
  readonly kind = 'market_data' as const
  readonly providerMode: SourceProviderMode = 'http'

  constructor(private readonly opts: HttpMarketDataProviderOptions) {}

  get orgId(): OrgId { return this.opts.orgId }

  async sync(args: { watermark: string | null }): Promise<ProviderSyncResult> {
    const tickers = this.opts.tickerProvider()
    if (tickers.length === 0) {
      return { fetchedCount: 0, newCount: 0, watermarkAfter: args.watermark, outcome: 'skipped', note: 'no tickers in scope' }
    }
    const since = args.watermark ?? this.defaultSince()
    const result = await this.pull({ since, until: null, tickers })
    return {
      fetchedCount: result.points.length,
      newCount: result.points.length,
      watermarkAfter: result.maxDate ?? args.watermark,
      outcome: 'success',
      note: result.points.length === 0 ? 'no new price points' : undefined,
    }
  }

  async backfill(args: { fromIso: string; toIso: string }): Promise<ProviderBackfillResult> {
    const tickers = this.opts.tickerProvider()
    if (tickers.length === 0) {
      return { fetchedCount: 0, newCount: 0, watermarkAfter: null, outcome: 'skipped', note: 'no tickers in scope' }
    }
    const result = await this.pull({ since: args.fromIso, until: args.toIso, tickers })
    return {
      fetchedCount: result.points.length,
      newCount: result.points.length,
      watermarkAfter: null,
      outcome: 'success',
    }
  }

  private async pull(args: {
    since: string; until: string | null; tickers: readonly StockTicker[]
  }): Promise<{ points: readonly DailyPricePoint[]; maxDate: string | null }> {
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') throw new Error('HttpMarketDataProvider: no fetch impl available')
    const search = new URLSearchParams()
    search.set('tickers', args.tickers.map((t) => t as unknown as string).join(','))
    search.set('since', args.since)
    if (args.until) search.set('until', args.until)
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/prices?${search.toString()}`
    const headers: Record<string, string> = { 'accept': 'application/json' }
    if (this.opts.token) headers['authorization'] = `Bearer ${this.opts.token}`
    const res = await fetchFn(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const body = await res.json() as {
      readonly prices?: readonly DailyPricePoint[]
      readonly benchmarks?: readonly BenchmarkSeries[]
    }
    const points = body.prices ?? []
    if (this.opts.onPrices && points.length > 0) this.opts.onPrices(points)
    if (this.opts.onBenchmarks && body.benchmarks) this.opts.onBenchmarks(body.benchmarks)
    const maxDate = points.reduce<string | null>(
      (acc, p) => acc === null || p.date > acc ? p.date : acc,
      null,
    )
    return { points, maxDate }
  }

  private defaultSince(): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  }
}
