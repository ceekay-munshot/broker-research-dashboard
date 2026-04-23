import type { Sector } from '../domain'
import { asSectorId, asTicker } from '../lib/ids'

// Top-level sector taxonomy. `tickers` is a denormalized back-reference
// maintained alongside the Stock.sectorId field to keep lookups cheap.
export const sectors: readonly Sector[] = [
  {
    id: asSectorId('sec_tech'),
    name: 'Technology',
    parentId: null,
    tickers: [
      asTicker('NVDA'), asTicker('AAPL'), asTicker('MSFT'),
      asTicker('GOOGL'), asTicker('META'), asTicker('AMZN'),
    ],
  },
  {
    id: asSectorId('sec_fin'),
    name: 'Financials',
    parentId: null,
    tickers: [asTicker('JPM'), asTicker('BAC')],
  },
  {
    id: asSectorId('sec_energy'),
    name: 'Energy',
    parentId: null,
    tickers: [asTicker('XOM'), asTicker('CVX')],
  },
  {
    id: asSectorId('sec_health'),
    name: 'Healthcare',
    parentId: null,
    tickers: [asTicker('LLY')],
  },
  {
    id: asSectorId('sec_consumer'),
    name: 'Consumer Discretionary',
    parentId: null,
    tickers: [asTicker('TSLA'), asTicker('WMT')],
  },
  {
    id: asSectorId('sec_industrial'),
    name: 'Industrials',
    parentId: null,
    tickers: [asTicker('CAT')],
  },
]
