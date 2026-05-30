import type { Sector } from '../domain'
import { asSectorId, asTicker } from '../lib/ids'

// Top-level sector taxonomy for Indian markets. `tickers` is a denormalized
// back-reference maintained alongside the Stock.sectorId field to keep
// lookups cheap.
export const sectors: readonly Sector[] = [
  {
    id: asSectorId('sec_it'),
    name: 'Information Technology',
    parentId: null,
    tickers: [
      asTicker('TCS'), asTicker('INFY'), asTicker('HCLTECH'), asTicker('WIPRO'),
    ],
  },
  {
    id: asSectorId('sec_fin'),
    name: 'Banks & Financials',
    parentId: null,
    tickers: [asTicker('HDFCBANK'), asTicker('ICICIBANK'), asTicker('SBIN')],
  },
  {
    id: asSectorId('sec_energy'),
    name: 'Oil & Gas',
    parentId: null,
    tickers: [asTicker('RELIANCE'), asTicker('ONGC')],
  },
  {
    id: asSectorId('sec_pharma'),
    name: 'Pharmaceuticals',
    parentId: null,
    tickers: [asTicker('SUNPHARMA'), asTicker('DRREDDY')],
  },
  {
    id: asSectorId('sec_consumer'),
    name: 'Consumer & Auto',
    parentId: null,
    tickers: [asTicker('HINDUNILVR'), asTicker('MARUTI'), asTicker('TATAMOTORS')],
  },
  {
    id: asSectorId('sec_industrial'),
    name: 'Capital Goods',
    parentId: null,
    tickers: [asTicker('LT')],
  },
]
