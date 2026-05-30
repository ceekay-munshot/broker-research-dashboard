import type { Stock } from '../domain'
import { asSectorId, asTicker } from '../lib/ids'

// Global stock catalog — NSE-listed Indian large caps across 6 sectors.
// Prices are snapshot at mock generation time in INR; the real adapter will
// resolve live prices separately.
export const stocks: readonly Stock[] = [
  // Information Technology
  { ticker: asTicker('TCS'),        name: 'Tata Consultancy Services',   sectorId: asSectorId('sec_it'),         currency: 'INR', exchange: 'NSE', lastPrice:  4102.50, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('INFY'),       name: 'Infosys',                     sectorId: asSectorId('sec_it'),         currency: 'INR', exchange: 'NSE', lastPrice:  1681.20, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('HCLTECH'),    name: 'HCL Technologies',            sectorId: asSectorId('sec_it'),         currency: 'INR', exchange: 'NSE', lastPrice:  1823.40, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('WIPRO'),      name: 'Wipro',                       sectorId: asSectorId('sec_it'),         currency: 'INR', exchange: 'NSE', lastPrice:   479.85, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },

  // Banks & Financials
  { ticker: asTicker('HDFCBANK'),   name: 'HDFC Bank',                   sectorId: asSectorId('sec_fin'),        currency: 'INR', exchange: 'NSE', lastPrice:  1785.60, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('ICICIBANK'),  name: 'ICICI Bank',                  sectorId: asSectorId('sec_fin'),        currency: 'INR', exchange: 'NSE', lastPrice:  1279.25, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('SBIN'),       name: 'State Bank of India',         sectorId: asSectorId('sec_fin'),        currency: 'INR', exchange: 'NSE', lastPrice:   825.40, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },

  // Oil & Gas
  { ticker: asTicker('RELIANCE'),   name: 'Reliance Industries',         sectorId: asSectorId('sec_energy'),     currency: 'INR', exchange: 'NSE', lastPrice:  2984.70, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('ONGC'),       name: 'Oil & Natural Gas Corporation', sectorId: asSectorId('sec_energy'),   currency: 'INR', exchange: 'NSE', lastPrice:   280.15, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },

  // Pharmaceuticals
  { ticker: asTicker('SUNPHARMA'),  name: 'Sun Pharmaceutical Industries', sectorId: asSectorId('sec_pharma'),   currency: 'INR', exchange: 'NSE', lastPrice:  1719.80, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('DRREDDY'),    name: 'Dr. Reddy\u2019s Laboratories', sectorId: asSectorId('sec_pharma'),   currency: 'INR', exchange: 'NSE', lastPrice:  6341.00, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },

  // Consumer & Auto
  { ticker: asTicker('HINDUNILVR'), name: 'Hindustan Unilever',          sectorId: asSectorId('sec_consumer'),   currency: 'INR', exchange: 'NSE', lastPrice:  2382.90, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('MARUTI'),     name: 'Maruti Suzuki India',         sectorId: asSectorId('sec_consumer'),   currency: 'INR', exchange: 'NSE', lastPrice: 12846.30, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
  { ticker: asTicker('TATAMOTORS'), name: 'Tata Motors',                 sectorId: asSectorId('sec_consumer'),   currency: 'INR', exchange: 'NSE', lastPrice:   894.60, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },

  // Capital Goods
  { ticker: asTicker('LT'),         name: 'Larsen & Toubro',             sectorId: asSectorId('sec_industrial'), currency: 'INR', exchange: 'NSE', lastPrice:  3723.50, lastPriceAsOf: '2026-04-22T10:00:00.000Z' },
]
