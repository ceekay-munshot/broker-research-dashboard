import type { BrokerStockOpinion } from '../domain'
import {
  asOrgId, asBrokerId, asReportId, asTicker,
} from '../lib/ids'

// Derived from the latest ready report per (broker, ticker) within an org.
// In the real adapter this is a server-computed projection; the mock adapter
// returns these pre-baked rows. `impliedUpsidePct` is computed against the
// stock's spot price at summary generation time.
export const brokerStockOpinions: readonly BrokerStockOpinion[] = [
  // ── Aranya Capital Partners ─────────────────────────────────────────
  o('org_aranya', 'brk_kotak',      'RELIANCE',   'Buy',         'bullish', 3200, 3050, 'rpt_0001', '2026-04-22T09:00:00.000Z',  7.20),
  o('org_aranya', 'brk_kotak',      'ONGC',       'Buy',         'bullish',  340,  320, 'rpt_0002', '2026-04-22T10:05:00.000Z', 21.43),
  o('org_aranya', 'brk_kotak',      'INFY',       'Buy',         'bullish', 1950, 1840, 'rpt_0003', '2026-04-22T11:00:00.000Z', 16.05),
  o('org_aranya', 'brk_kotak',      'TCS',        'Buy',         'bullish', 4800, 4500, 'rpt_0004', '2026-04-22T12:10:00.000Z', 17.00),
  o('org_aranya', 'brk_mosl',       'HDFCBANK',   'Buy',         'bullish', 2050, 1950, 'rpt_0005', '2026-04-22T07:40:00.000Z', 14.81),
  o('org_aranya', 'brk_mosl',       'SUNPHARMA',  'Buy',         'bullish', 2000, 1920, 'rpt_0006', '2026-04-22T08:25:00.000Z', 16.29),
  o('org_aranya', 'brk_mosl',       'LT',         'Buy',         'bullish', 4200, 4050, 'rpt_0007', '2026-04-22T13:05:00.000Z', 12.80),
  o('org_aranya', 'brk_icici',      'MARUTI',     'Hold',        'neutral',11800,12200, 'rpt_0008', '2026-04-21T11:48:00.000Z', -8.15),
  o('org_aranya', 'brk_icici',      'TATAMOTORS', 'Sell',        'bearish',  720,  820, 'rpt_0009', '2026-04-18T12:00:00.000Z',-19.52),
  o('org_aranya', 'brk_hdfc',       'MARUTI',     'Buy',         'bullish',14500,14000, 'rpt_0010', '2026-04-22T06:00:00.000Z', 12.87),
  o('org_aranya', 'brk_hdfc',       'RELIANCE',   'Hold',        'neutral', 2950, 2950, 'rpt_0011', '2026-04-17T10:30:00.000Z', -1.16),
  o('org_aranya', 'brk_axis',       'ICICIBANK',  'Buy',         'bullish', 1520, 1450, 'rpt_0012', '2026-04-22T09:30:00.000Z', 18.82),
  o('org_aranya', 'brk_axis',       'DRREDDY',    'Hold',        'neutral', 6200, 6350, 'rpt_0013', '2026-04-16T08:00:00.000Z', -2.22),
  o('org_aranya', 'brk_nuvama',     'TCS',        'Sell',        'bearish', 3400, 3800, 'rpt_0014', '2026-04-22T12:25:00.000Z',-17.12),
  o('org_aranya', 'brk_nuvama',     'ICICIBANK',  'Sell',        'bearish', 1100, 1180, 'rpt_0015', '2026-04-14T14:15:00.000Z',-14.01),
  o('org_aranya', 'brk_nuvama',     'WIPRO',      'Hold',        'neutral',  470,  490, 'rpt_0016', '2026-04-15T11:00:00.000Z', -2.05),
  o('org_aranya', 'brk_ambit',      'HCLTECH',    'Buy',         'bullish', 2050, 1940, 'rpt_0017', '2026-04-23T06:00:00.000Z', 12.43),
  o('org_aranya', 'brk_ambit',      'INFY',       'Buy',         'bullish', 1920, 1820, 'rpt_0018', '2026-04-23T07:00:00.000Z', 14.20),
  o('org_aranya', 'brk_ambit',      'TATAMOTORS', 'Buy',         'bullish', 1080,  960, 'rpt_0019', '2026-04-23T08:15:00.000Z', 20.73),
  o('org_aranya', 'brk_jmfin',      'ONGC',       'Sell',        'bearish',  245,  270, 'rpt_0020', '2026-04-18T09:30:00.000Z',-12.55),
  o('org_aranya', 'brk_iifl',       'HINDUNILVR', 'Sell',        'bearish', 2100, 2250, 'rpt_0021', '2026-04-15T13:40:00.000Z',-11.88),
  o('org_aranya', 'brk_plilladher', 'SBIN',       'Buy',         'bullish',  980,  920, 'rpt_0022', '2026-04-19T10:00:00.000Z', 18.73),

  // Extra coverage rows pushing 4 tickers to 3+ broker depth so the engine's
  // outlier statistics (z-score, rating-contrary, stance-contrary) are
  // meaningful. See docs/closure-logic.md for thresholds.
  o('org_aranya', 'brk_mosl',       'TCS',        'Buy',         'bullish', 4650, 4400, 'rpt_0028', '2026-04-23T07:30:00.000Z', 13.35),
  o('org_aranya', 'brk_kotak',      'ICICIBANK',  'Buy',         'bullish', 1480, 1420, 'rpt_0029', '2026-04-23T08:30:00.000Z', 15.69),
  o('org_aranya', 'brk_hdfc',       'TATAMOTORS', 'Hold',        'neutral',  880,  900, 'rpt_0030', '2026-04-23T09:00:00.000Z', -1.63),
  o('org_aranya', 'brk_mosl',       'RELIANCE',   'Buy',         'bullish', 3150, 3000, 'rpt_0031', '2026-04-23T06:30:00.000Z',  5.54),

  // ── Sahyadri Investment Management ──────────────────────────────────
  o('org_sahyadri', 'brk_kotak',  'RELIANCE',   'Buy',         'bullish', 3200, 3050, 'rpt_0023', '2026-04-22T09:00:00.000Z',  7.20),
  o('org_sahyadri', 'brk_mosl',   'TCS',        'Buy',         'bullish', 4650, 4400, 'rpt_0024', '2026-04-22T07:40:00.000Z', 13.35),
  o('org_sahyadri', 'brk_icici',  'MARUTI',     'Hold',        'neutral',11800,12200, 'rpt_0025', '2026-04-21T11:48:00.000Z', -8.15),
  o('org_sahyadri', 'brk_nuvama', 'INFY',       'Hold',        'neutral', 1750, 1800, 'rpt_0026', '2026-04-21T09:15:00.000Z',  4.09),
  o('org_sahyadri', 'brk_ambit',  'TATAMOTORS', 'Buy',         'bullish', 1080,  960, 'rpt_0027', '2026-04-23T06:00:00.000Z', 20.73),
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
    targetCurrency: 'INR',
    lastReportId: asReportId(reportId),
    lastUpdatedAt,
    impliedUpsidePct,
  }
}
