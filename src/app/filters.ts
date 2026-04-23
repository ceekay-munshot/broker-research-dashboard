import type {
  BrokerId, SectorId, StockTicker, Iso8601, Rating,
} from '../domain'

// UI-level filter state. Transformed into adapter-level queries inside the
// viewModels layer; components never interpret these directly.

export type DateRangeKey = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'Custom'

export interface FiltersState {
  readonly dateRange: DateRangeKey
  readonly brokerIds: readonly BrokerId[]
  readonly tickers: readonly StockTicker[]
  readonly sectorIds: readonly SectorId[]
  readonly ratings: readonly Rating[]
}

export const DEFAULT_FILTERS: FiltersState = {
  dateRange: '1M',
  brokerIds: [],
  tickers: [],
  sectorIds: [],
  ratings: [],
}

export const DATE_RANGE_KEYS: readonly DateRangeKey[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'Custom']

/** Convert a date range key into an ISO `since` timestamp (or undefined when
 *  no lower bound applies, like 'Custom' in Phase 1). */
export function resolveSince(range: DateRangeKey, now: Date = new Date()): Iso8601 | undefined {
  const ref = new Date(now.getTime())
  switch (range) {
    case '1D': ref.setUTCDate(ref.getUTCDate() - 1); return ref.toISOString()
    case '1W': ref.setUTCDate(ref.getUTCDate() - 7); return ref.toISOString()
    case '1M': ref.setUTCMonth(ref.getUTCMonth() - 1); return ref.toISOString()
    case '3M': ref.setUTCMonth(ref.getUTCMonth() - 3); return ref.toISOString()
    case 'YTD': return new Date(Date.UTC(ref.getUTCFullYear(), 0, 1)).toISOString()
    case '1Y': ref.setUTCFullYear(ref.getUTCFullYear() - 1); return ref.toISOString()
    case 'Custom': return undefined
  }
}

/** Produce a stable primitive dependency fingerprint so useEffect deps can
 *  depend on the current filter selection without re-running on identity
 *  changes of the array wrappers. */
export function filtersFingerprint(f: FiltersState): string {
  return [
    f.dateRange,
    [...f.brokerIds].sort().join(','),
    [...f.tickers].sort().join(','),
    [...f.sectorIds].sort().join(','),
    [...f.ratings].sort().join(','),
  ].join('|')
}
