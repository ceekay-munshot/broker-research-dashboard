import type { BrokerStockOpinion } from '../domain'
import {
  asOrgId, asBrokerId, asReportId, asTicker,
} from '../lib/ids'

// Derived from the latest ready report per (broker, ticker) within an org.
// In the real adapter this is a server-computed projection; the mock adapter
// returns these pre-baked rows. `impliedUpsidePct` is computed against the
// stock's spot price at summary generation time.
export const brokerStockOpinions: readonly BrokerStockOpinion[] = [
  // ── Acme ─────────────────────────────────────────────────────────────
  o('org_acme', 'brk_gs',   'NVDA',  'Buy',         'bullish', 1320, 1240, 'rpt_0001', '2026-04-22T09:00:00.000Z', 15.56),
  o('org_acme', 'brk_gs',   'XOM',   'Buy',         'bullish',  135,  130, 'rpt_0002', '2026-04-22T10:05:00.000Z', 15.66),
  o('org_acme', 'brk_gs',   'META',  'Buy',         'bullish',  680,  650, 'rpt_0003', '2026-04-22T11:00:00.000Z', 11.10),
  o('org_acme', 'brk_gs',   'AMZN',  'Buy',         'bullish',  235,  225, 'rpt_0004', '2026-04-22T12:10:00.000Z', 15.45),
  o('org_acme', 'brk_ms',   'MSFT',  'Overweight',  'bullish',  485,  475, 'rpt_0005', '2026-04-22T07:40:00.000Z', 11.03),
  o('org_acme', 'brk_ms',   'LLY',   'Overweight',  'bullish',  860,  820, 'rpt_0006', '2026-04-22T08:25:00.000Z', 10.09),
  o('org_acme', 'brk_ms',   'CAT',   'Overweight',  'bullish',  380,  365, 'rpt_0007', '2026-04-22T13:05:00.000Z', 10.92),
  o('org_acme', 'brk_jpm',  'AAPL',  'Hold',        'neutral',  220,  225, 'rpt_0008', '2026-04-21T11:48:00.000Z',  0.58),
  o('org_acme', 'brk_jpm',  'TSLA',  'Underweight', 'bearish',  190,  200, 'rpt_0009', '2026-04-18T12:00:00.000Z', -23.44),
  o('org_acme', 'brk_baml', 'AAPL',  'Buy',         'bullish',  250,  240, 'rpt_0010', '2026-04-22T06:00:00.000Z', 14.29),
  o('org_acme', 'brk_baml', 'NVDA',  'Hold',        'neutral', 1080, 1080, 'rpt_0011', '2026-04-17T10:30:00.000Z', -5.45),
  o('org_acme', 'brk_citi', 'GOOGL', 'Buy',         'bullish',  220,  210, 'rpt_0012', '2026-04-22T09:30:00.000Z', 16.15),
  o('org_acme', 'brk_citi', 'LLY',   'Hold',        'neutral',  760,  780, 'rpt_0013', '2026-04-16T08:00:00.000Z', -2.71),
  o('org_acme', 'brk_ubs',  'NVDA',  'Underweight', 'bearish',  920, 1050, 'rpt_0014', '2026-04-22T12:25:00.000Z', -19.46),
  o('org_acme', 'brk_ubs',  'GOOGL', 'Underweight', 'bearish',  170,  175, 'rpt_0015', '2026-04-14T14:15:00.000Z', -10.25),
  o('org_acme', 'brk_ubs',  'AMZN',  'Hold',        'neutral',  200,  205, 'rpt_0016', '2026-04-15T11:00:00.000Z', -1.74),
  o('org_acme', 'brk_jef',  'TSLA',  'Buy',         'bullish',  340,  310, 'rpt_0017', '2026-04-23T06:00:00.000Z', 36.99),
  o('org_acme', 'brk_jef',  'MSFT',  'Buy',         'bullish',  505,  490, 'rpt_0018', '2026-04-23T07:00:00.000Z', 15.61),
  o('org_acme', 'brk_jef',  'AMZN',  'Buy',         'bullish',  240,  230, 'rpt_0019', '2026-04-23T08:15:00.000Z', 17.91),
  o('org_acme', 'brk_barc', 'XOM',   'Underweight', 'bearish',   98,  105, 'rpt_0020', '2026-04-18T09:30:00.000Z', -16.04),
  o('org_acme', 'brk_nmr',  'TSLA',  'Sell',        'bearish',  165,  180, 'rpt_0021', '2026-04-15T13:40:00.000Z', -33.52),
  o('org_acme', 'brk_wf',   'JPM',   'Overweight',  'bullish',  248,  240, 'rpt_0022', '2026-04-19T10:00:00.000Z',  8.28),

  // ── Northstar ────────────────────────────────────────────────────────
  o('org_northstar', 'brk_gs',  'NVDA', 'Buy',        'bullish', 1320, 1240, 'rpt_0023', '2026-04-22T09:00:00.000Z', 15.56),
  o('org_northstar', 'brk_ms',  'MSFT', 'Overweight', 'bullish',  485,  475, 'rpt_0024', '2026-04-22T07:40:00.000Z', 11.03),
  o('org_northstar', 'brk_jpm', 'AAPL', 'Hold',       'neutral',  220,  225, 'rpt_0025', '2026-04-21T11:48:00.000Z',  0.58),
  o('org_northstar', 'brk_ubs', 'META', 'Hold',       'neutral',  600,  615, 'rpt_0026', '2026-04-21T09:15:00.000Z', -1.97),
  o('org_northstar', 'brk_jef', 'TSLA', 'Buy',        'bullish',  340,  310, 'rpt_0027', '2026-04-23T06:00:00.000Z', 36.99),
]

function o(
  orgId: string,
  brokerId: string,
  ticker: string,
  rating: BrokerStockOpinion['rating'],
  stance: BrokerStockOpinion['stance'],
  targetPrice: number,
  priorTargetPrice: number,
  reportId: string,
  lastUpdatedAt: string,
  impliedUpsidePct: number,
): BrokerStockOpinion {
  return {
    orgId: asOrgId(orgId),
    brokerId: asBrokerId(brokerId),
    ticker: asTicker(ticker),
    rating,
    stance,
    targetPrice,
    priorTargetPrice,
    targetCurrency: 'USD',
    lastReportId: asReportId(reportId),
    lastUpdatedAt,
    impliedUpsidePct,
  }
}
