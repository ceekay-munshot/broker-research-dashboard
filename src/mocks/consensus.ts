import type { ConsensusView, Stance, Rating } from '../domain'
import { asOrgId, asTicker } from '../lib/ids'

// Derived: aggregate of active BrokerStockOpinion rows per (org, ticker).
// Single-broker tickers have spreadPct = null since there is no dispersion.
// The mock adapter serves these pre-baked; the real adapter will compute
// them server-side on every write to avoid recomputation on the read path.

const AS_OF = '2026-04-23T08:00:00.000Z'

const stance = (bull: number, neut: number, bear: number): Readonly<Record<Stance, number>> => ({
  bullish: bull, neutral: neut, bearish: bear,
})
const ratings = (m: Partial<Record<Rating, number>>): Readonly<Partial<Record<Rating, number>>> => m

export const consensusViews: readonly ConsensusView[] = [
  // Aranya — multi-broker consensus
  c('org_aranya', 'RELIANCE',   2, 3075.00, 3075, 3200, 2950,  8.47, stance(1,1,0), ratings({ Buy: 1, Hold: 1 })),
  c('org_aranya', 'ONGC',       2,  292.50,  292.5, 340,  245, 38.78, stance(1,0,1), ratings({ Buy: 1, Sell: 1 })),
  c('org_aranya', 'TCS',        2, 4100.00, 4100, 4800, 3400, 41.18, stance(1,0,1), ratings({ Buy: 1, Sell: 1 })),
  c('org_aranya', 'INFY',       2, 1935.00, 1935, 1950, 1920,  1.56, stance(2,0,0), ratings({ Buy: 2 })),
  c('org_aranya', 'ICICIBANK',  2, 1310.00, 1310, 1520, 1100, 38.18, stance(1,0,1), ratings({ Buy: 1, Sell: 1 })),
  c('org_aranya', 'MARUTI',     2,13150.00,13150,14500,11800, 22.88, stance(1,1,0), ratings({ Buy: 1, Hold: 1 })),
  c('org_aranya', 'TATAMOTORS', 2,  900.00,  900, 1080,  720, 50.00, stance(1,0,1), ratings({ Buy: 1, Sell: 1 })),
  // Aranya — single-broker coverage
  c('org_aranya', 'HDFCBANK',   1, 2050.00, 2050, 2050, 2050,  null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_aranya', 'SUNPHARMA',  1, 2000.00, 2000, 2000, 2000,  null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_aranya', 'LT',         1, 4200.00, 4200, 4200, 4200,  null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_aranya', 'DRREDDY',    1, 6200.00, 6200, 6200, 6200,  null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_aranya', 'WIPRO',      1,  470.00,  470,  470,  470,  null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_aranya', 'HCLTECH',    1, 2050.00, 2050, 2050, 2050,  null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_aranya', 'HINDUNILVR', 1, 2100.00, 2100, 2100, 2100,  null, stance(0,0,1), ratings({ Sell: 1 })),
  c('org_aranya', 'SBIN',       1,  980.00,  980,  980,  980,  null, stance(1,0,0), ratings({ Buy: 1 })),

  // Sahyadri — all single-broker in current period
  c('org_sahyadri', 'RELIANCE',   1, 3200.00, 3200, 3200, 3200, null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_sahyadri', 'TCS',        1, 4650.00, 4650, 4650, 4650, null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_sahyadri', 'MARUTI',     1,11800.00,11800,11800,11800, null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_sahyadri', 'INFY',       1, 1750.00, 1750, 1750, 1750, null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_sahyadri', 'TATAMOTORS', 1, 1080.00, 1080, 1080, 1080, null, stance(1,0,0), ratings({ Buy: 1 })),
]

function c(
  orgId: string,
  ticker: string,
  brokerCount: number,
  avg: number | null,
  median: number | null,
  high: number | null,
  low: number | null,
  spreadPct: number | null,
  stanceDistribution: Readonly<Record<Stance, number>>,
  ratingDistribution: Readonly<Partial<Record<Rating, number>>>,
): ConsensusView {
  return {
    orgId: asOrgId(orgId),
    ticker: asTicker(ticker),
    brokerCount,
    avgTargetPrice: avg,
    medianTargetPrice: median,
    highTargetPrice: high,
    lowTargetPrice: low,
    spreadPct,
    stanceDistribution,
    ratingDistribution,
    asOf: AS_OF,
  }
}
