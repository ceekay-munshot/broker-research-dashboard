// CMP (current market price) for the By Stock matrix, the report drawer and
// the analyst detail — the data-source-aware front door to useStockPrices.
//
//   Live data source → the real /api/stock-price feed (useStockPrices), as before.
//   Mock data source → the *same* seeded mock closes the calls-over-time chart
//     uses (last close per ticker), resolved through the active mock adapter.
//
// Why: the mock broker targets were authored at mock price levels, so measuring
// them against a live quote makes the Mock view incoherent — e.g. RELIANCE read
// +131% to target because mock ₹3,000-ish targets sat against a live ₹1,320, and
// HDFCBANK's live quote is simply wrong (~₹742 vs a real ~₹1,800). Keeping CMP on
// the mock price series in Mock mode makes every number internally consistent.
// No network calls are made in Mock mode; Live mode is unchanged.

import { useMemo } from 'react'
import { useDataSource } from '../app/ScopeContext'
import { asTicker } from '../lib/ids'
import { useAdapterQuery } from './useAdapterQuery'
import { useStockPrices, type PriceCell, type UseStockPricesResult } from './useStockPrices'

const EMPTY_PRICES: ReadonlyMap<string, PriceCell> = new Map()
const NOOP = (): void => {}

export function useCmpPrices(rawTickers: readonly string[]): UseStockPricesResult {
  const { dataSource } = useDataSource()
  const isMock = dataSource === 'mock'

  // Live path — gated to an empty list in Mock mode so it never hits the edge.
  const live = useStockPrices(isMock ? [] : rawTickers)

  // Mock path — last seeded close per ticker, via the active (mock) adapter.
  const tickers = useMemo(
    () => [...new Set(rawTickers.filter((t) => t !== ''))].sort(),
    [rawTickers],
  )
  const fingerprint = tickers.join('|')
  const mock = useAdapterQuery<ReadonlyMap<string, PriceCell>>(
    async (a, s) => {
      const out = new Map<string, PriceCell>()
      const getCloses = a.getDailyCloses
      if (!isMock || !getCloses) return out
      await Promise.all(
        tickers.map(async (t) => {
          const closes = await getCloses.call(a, s, asTicker(t))
          const last = closes.length > 0 ? closes[closes.length - 1]! : null
          out.set(
            t,
            last
              ? { status: 'success', price: last.close, fetchedAt: 0 }
              : { status: 'unavailable', reason: 'not_found' },
          )
        }),
      )
      return out
    },
    [isMock ? `mock:${fingerprint}` : 'live'],
  )

  return useMemo<UseStockPricesResult>(
    () =>
      isMock
        ? { prices: mock.data ?? EMPTY_PRICES, refetch: NOOP, lastFetchedAt: null }
        : live,
    [isMock, live, mock.data],
  )
}
