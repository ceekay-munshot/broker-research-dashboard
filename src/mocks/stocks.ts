import type { Stock } from '../domain'
import { asSectorId, asTicker } from '../lib/ids'

// Global stock catalog. Prices are snapshot at mock generation time; real
// adapter will resolve live prices separately.
export const stocks: readonly Stock[] = [
  { ticker: asTicker('NVDA'),  name: 'NVIDIA Corporation',      sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice: 1142.30, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('AAPL'),  name: 'Apple Inc.',              sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice:  218.74, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('MSFT'),  name: 'Microsoft Corporation',   sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice:  436.82, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('GOOGL'), name: 'Alphabet Inc. Class A',   sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice:  189.41, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('META'),  name: 'Meta Platforms Inc.',     sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice:  612.08, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('AMZN'),  name: 'Amazon.com Inc.',         sectorId: asSectorId('sec_tech'),       currency: 'USD', exchange: 'NASDAQ', lastPrice:  203.55, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('JPM'),   name: 'JPMorgan Chase & Co.',    sectorId: asSectorId('sec_fin'),        currency: 'USD', exchange: 'NYSE',   lastPrice:  229.04, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('BAC'),   name: 'Bank of America Corp.',   sectorId: asSectorId('sec_fin'),        currency: 'USD', exchange: 'NYSE',   lastPrice:   42.18, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('XOM'),   name: 'Exxon Mobil Corporation', sectorId: asSectorId('sec_energy'),     currency: 'USD', exchange: 'NYSE',   lastPrice:  116.72, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('CVX'),   name: 'Chevron Corporation',     sectorId: asSectorId('sec_energy'),     currency: 'USD', exchange: 'NYSE',   lastPrice:  162.40, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('LLY'),   name: 'Eli Lilly and Co.',       sectorId: asSectorId('sec_health'),     currency: 'USD', exchange: 'NYSE',   lastPrice:  781.20, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('TSLA'),  name: 'Tesla, Inc.',             sectorId: asSectorId('sec_consumer'),   currency: 'USD', exchange: 'NASDAQ', lastPrice:  248.19, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('WMT'),   name: 'Walmart Inc.',            sectorId: asSectorId('sec_consumer'),   currency: 'USD', exchange: 'NYSE',   lastPrice:   82.14, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
  { ticker: asTicker('CAT'),   name: 'Caterpillar Inc.',        sectorId: asSectorId('sec_industrial'), currency: 'USD', exchange: 'NYSE',   lastPrice:  342.60, lastPriceAsOf: '2026-04-22T20:00:00.000Z' },
]
