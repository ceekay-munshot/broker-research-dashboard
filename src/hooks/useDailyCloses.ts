import type { DailyPricePoint, StockTicker } from '../domain'
import { useAdapterQuery, type QueryResult } from './useAdapterQuery'

// Daily closes for the Hit Rate price chart. Returns [] (not an error) when no
// ticker is selected or the active adapter has no price-history source — e.g.
// the live `/email/forwarded` feed, which exposes only a current price. The
// chart reads an empty result as its "awaiting live price feed" state.
export function useDailyCloses(ticker: StockTicker | null): QueryResult<readonly DailyPricePoint[]> {
  return useAdapterQuery<readonly DailyPricePoint[]>(
    async (a, s) => {
      if (!ticker || !a.getDailyCloses) return []
      return a.getDailyCloses(s, ticker)
    },
    [ticker as unknown as string ?? ''],
  )
}
