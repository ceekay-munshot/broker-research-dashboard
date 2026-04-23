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
  // Acme
  c('org_acme', 'NVDA',  3, 1106.67, 1080, 1320,  920, 43.48, stance(1,1,1), ratings({ Buy: 1, Hold: 1, Underweight: 1 })),
  c('org_acme', 'AAPL',  2,  235.00,  235,  250,  220, 13.64, stance(1,1,0), ratings({ Buy: 1, Hold: 1 })),
  c('org_acme', 'MSFT',  2,  495.00,  495,  505,  485,  4.12, stance(2,0,0), ratings({ Buy: 1, Overweight: 1 })),
  c('org_acme', 'GOOGL', 2,  195.00,  195,  220,  170, 29.41, stance(1,0,1), ratings({ Buy: 1, Underweight: 1 })),
  c('org_acme', 'META',  1,  680.00,  680,  680,  680,  null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_acme', 'TSLA',  3,  231.67,  190,  340,  165,106.06, stance(1,0,2), ratings({ Buy: 1, Underweight: 1, Sell: 1 })),
  c('org_acme', 'AMZN',  3,  225.00,  235,  240,  200, 20.00, stance(2,1,0), ratings({ Buy: 2, Hold: 1 })),
  c('org_acme', 'JPM',   1,  248.00,  248,  248,  248,  null, stance(1,0,0), ratings({ Overweight: 1 })),
  c('org_acme', 'XOM',   2,  116.50,  116.5,135,   98, 37.76, stance(1,0,1), ratings({ Buy: 1, Underweight: 1 })),
  c('org_acme', 'LLY',   2,  810.00,  810,  860,  760, 13.16, stance(1,1,0), ratings({ Overweight: 1, Hold: 1 })),
  c('org_acme', 'CAT',   1,  380.00,  380,  380,  380,  null, stance(1,0,0), ratings({ Overweight: 1 })),

  // Northstar — all single-broker at this point in time
  c('org_northstar', 'NVDA', 1, 1320.00, 1320, 1320, 1320, null, stance(1,0,0), ratings({ Buy: 1 })),
  c('org_northstar', 'MSFT', 1,  485.00,  485,  485,  485, null, stance(1,0,0), ratings({ Overweight: 1 })),
  c('org_northstar', 'AAPL', 1,  220.00,  220,  220,  220, null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_northstar', 'META', 1,  600.00,  600,  600,  600, null, stance(0,1,0), ratings({ Hold: 1 })),
  c('org_northstar', 'TSLA', 1,  340.00,  340,  340,  340, null, stance(1,0,0), ratings({ Buy: 1 })),
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
