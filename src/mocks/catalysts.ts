// Hand-tuned catalyst fixtures.
//
// Mirrors what the catalyst input seam will produce in production: a
// flat list of `CatalystEvent`s scoped to (orgId, ticker). The mock
// adapter serves these through getCalendar() / getCatalyst() /
// getPreEventBrief().

import type { CatalystEvent } from '../domain'
import {
  asCatalystId, asOrgId, asSectorId, asTicker,
} from '../lib/ids'

// orgIds resolved per-event via the helper below.

function event(input: {
  id: string; orgId: string; type: CatalystEvent['type']; status: CatalystEvent['status'];
  importance: CatalystEvent['importance']; ticker: string; stockName: string;
  sectorId: string; headline: string; description: string;
  expectedAt: string; hasIntradayTime: boolean;
  source: { id: string; label: string; confidence: number };
  updatedAt: string; tags: readonly string[];
}): CatalystEvent {
  return {
    id: asCatalystId(input.id),
    orgId: asOrgId(input.orgId),
    type: input.type, status: input.status, importance: input.importance,
    ticker: asTicker(input.ticker),
    stockName: input.stockName,
    sectorId: asSectorId(input.sectorId),
    headline: input.headline,
    description: input.description,
    expectedAt: input.expectedAt,
    expectedDate: input.expectedAt.slice(0, 10),
    hasIntradayTime: input.hasIntradayTime,
    source: input.source,
    updatedAt: input.updatedAt,
    tags: input.tags,
  }
}

const FIXTURE_SOURCE = { id: 'aranya_calendar_q2_2026', label: 'Aranya internal calendar', confidence: 0.9 } as const
const ESTIMATED_SOURCE = { id: 'aranya_calendar_q2_2026', label: 'Aranya internal calendar', confidence: 0.6 } as const

export const catalystEvents: readonly CatalystEvent[] = [
  // ── Aranya — held names ────────────────────────────────────────────
  event({
    id: 'cat_aranya_tcs_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'critical',
    ticker: 'TCS', stockName: 'Tata Consultancy Services', sectorId: 'sec_it',
    headline: 'TCS — Q4 FY26 results',
    description: 'TCS reports Q4 FY26 with focus on GenAI deal pipeline conversion, BFSI ramp, and FY27 margin guidance.',
    expectedAt: '2026-04-29T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-20T05:00:00.000Z',
    tags: ['earnings', 'flagship', 'core'],
  }),
  event({
    id: 'cat_aranya_infy_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'critical',
    ticker: 'INFY', stockName: 'Infosys', sectorId: 'sec_it',
    headline: 'INFY — Q4 FY26 results',
    description: 'Infosys reports Q4 FY26 + FY27 guidance. Watch deal ramp, large-deal velocity, and FY27 margin floor.',
    expectedAt: '2026-04-30T13:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-22T05:00:00.000Z',
    tags: ['earnings', 'guidance'],
  }),
  event({
    id: 'cat_aranya_tatamotors_jlr_day', orgId: 'org_aranya', type: 'investor_day', status: 'scheduled', importance: 'high',
    ticker: 'TATAMOTORS', stockName: 'Tata Motors', sectorId: 'sec_consumer',
    headline: 'TATAMOTORS — JLR strategy day',
    description: 'JLR product roadmap + EV transition update. Range Rover EV ramp + China demand cadence in focus.',
    expectedAt: '2026-05-04T14:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-15T05:00:00.000Z',
    tags: ['investor_day', 'product'],
  }),
  event({
    id: 'cat_aranya_icicibank_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'critical',
    ticker: 'ICICIBANK', stockName: 'ICICI Bank', sectorId: 'sec_fin',
    headline: 'ICICIBANK — Q4 FY26 results',
    description: 'ICICI Bank Q4 FY26. Watch unsecured book trends, retail credit quality, NIM trajectory.',
    expectedAt: '2026-05-02T10:30:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-23T05:00:00.000Z',
    tags: ['earnings'],
  }),
  event({
    id: 'cat_aranya_reliance_agm', orgId: 'org_aranya', type: 'agm', status: 'estimated', importance: 'high',
    ticker: 'RELIANCE', stockName: 'Reliance Industries', sectorId: 'sec_energy',
    headline: 'RELIANCE — Annual general meeting',
    description: 'RIL AGM. Historically the venue for Jio / Retail strategy reveals. Date is upstream estimate.',
    expectedAt: '2026-08-22T05:30:00.000Z', hasIntradayTime: false,
    source: ESTIMATED_SOURCE, updatedAt: '2026-04-12T05:00:00.000Z',
    tags: ['agm', 'strategy'],
  }),
  event({
    id: 'cat_aranya_lt_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'high',
    ticker: 'LT', stockName: 'Larsen & Toubro', sectorId: 'sec_industrial',
    headline: 'LT — Q4 FY26 results',
    description: 'L&T Q4 FY26 with focus on order inflows, FY27 capex cycle outlook, hydrocarbons book.',
    expectedAt: '2026-05-08T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-18T05:00:00.000Z',
    tags: ['earnings', 'capex'],
  }),
  event({
    id: 'cat_aranya_sbin_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'high',
    ticker: 'SBIN', stockName: 'State Bank of India', sectorId: 'sec_fin',
    headline: 'SBIN — Q4 FY26 results',
    description: 'SBI Q4 FY26. NIM trajectory + asset-quality + retail credit growth.',
    expectedAt: '2026-05-09T13:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-19T05:00:00.000Z',
    tags: ['earnings'],
  }),
  event({
    id: 'cat_aranya_ongc_brentdeck', orgId: 'org_aranya', type: 'guidance_update', status: 'estimated', importance: 'medium',
    ticker: 'ONGC', stockName: 'Oil & Natural Gas Corporation', sectorId: 'sec_energy',
    headline: 'ONGC — guidance update at AGM',
    description: 'ONGC commentary on Brent deck assumption + capex plan; estimated mid-May.',
    expectedAt: '2026-05-15T05:30:00.000Z', hasIntradayTime: false,
    source: ESTIMATED_SOURCE, updatedAt: '2026-04-11T05:00:00.000Z',
    tags: ['guidance', 'short_position'],
  }),
  event({
    id: 'cat_aranya_hindunilvr_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'medium',
    ticker: 'HINDUNILVR', stockName: 'Hindustan Unilever', sectorId: 'sec_consumer',
    headline: 'HINDUNILVR — Q4 FY26 results',
    description: 'HUL Q4 with focus on premium volume trajectory + skincare reset.',
    expectedAt: '2026-05-06T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-15T05:00:00.000Z',
    tags: ['earnings', 'short_position'],
  }),

  // ── Aranya — completed events (Module 22) ─────────────────────────
  event({
    id: 'cat_aranya_tatamotors_completed_demo', orgId: 'org_aranya', type: 'investor_day', status: 'completed', importance: 'high',
    ticker: 'TATAMOTORS', stockName: 'Tata Motors', sectorId: 'sec_consumer',
    headline: 'TATAMOTORS — JLR strategy day (prior)',
    description: 'JLR investor day held earlier this month. Outlier HDFC was bearish; turned out to be right.',
    expectedAt: '2026-04-21T05:00:00.000Z', hasIntradayTime: false,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-21T05:00:00.000Z',
    tags: ['investor_day', 'completed'],
  }),
  event({
    id: 'cat_aranya_icicibank_completed_demo', orgId: 'org_aranya', type: 'earnings', status: 'completed', importance: 'critical',
    ticker: 'ICICIBANK', stockName: 'ICICI Bank', sectorId: 'sec_fin',
    headline: 'ICICIBANK — Q4 FY26 (prior cycle)',
    description: 'ICICI Bank reported earlier this month. Street was directionally aligned and right.',
    expectedAt: '2026-04-17T05:00:00.000Z', hasIntradayTime: false,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-17T05:00:00.000Z',
    tags: ['earnings', 'completed'],
  }),

  // ── Aranya — watchlist ────────────────────────────────────────────
  event({
    id: 'cat_aranya_hcltech_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'medium',
    ticker: 'HCLTECH', stockName: 'HCL Technologies', sectorId: 'sec_it',
    headline: 'HCLTECH — Q4 FY26 results',
    description: 'HCLTech Q4 FY26 + FY27 guidance. Services + AI infra commentary in focus.',
    expectedAt: '2026-04-28T13:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-20T05:00:00.000Z',
    tags: ['earnings', 'watchlist_promotion_candidate'],
  }),
  event({
    id: 'cat_aranya_maruti_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'medium',
    ticker: 'MARUTI', stockName: 'Maruti Suzuki India', sectorId: 'sec_consumer',
    headline: 'MARUTI — Q4 FY26 results',
    description: 'Maruti Q4 FY26. Volume cadence + rural recovery commentary + FY27 model launches.',
    expectedAt: '2026-05-05T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-21T05:00:00.000Z',
    tags: ['earnings', 'watchlist'],
  }),
  event({
    id: 'cat_aranya_sunpharma_q4', orgId: 'org_aranya', type: 'earnings', status: 'scheduled', importance: 'low',
    ticker: 'SUNPHARMA', stockName: 'Sun Pharmaceutical Industries', sectorId: 'sec_pharma',
    headline: 'SUNPHARMA — Q4 FY26 results',
    description: 'Sun Pharma Q4 FY26. Specialty derm trajectory + US generics pricing.',
    expectedAt: '2026-05-13T13:30:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-19T05:00:00.000Z',
    tags: ['earnings', 'watchlist'],
  }),

  // ── Sahyadri ──────────────────────────────────────────────────────
  event({
    id: 'cat_sahyadri_reliance_agm', orgId: 'org_sahyadri', type: 'agm', status: 'estimated', importance: 'high',
    ticker: 'RELIANCE', stockName: 'Reliance Industries', sectorId: 'sec_energy',
    headline: 'RELIANCE — Annual general meeting',
    description: 'RIL AGM. Date is upstream estimate.',
    expectedAt: '2026-08-22T05:30:00.000Z', hasIntradayTime: false,
    source: ESTIMATED_SOURCE, updatedAt: '2026-04-12T05:00:00.000Z',
    tags: ['agm', 'strategy'],
  }),
  event({
    id: 'cat_sahyadri_tcs_q4', orgId: 'org_sahyadri', type: 'earnings', status: 'scheduled', importance: 'critical',
    ticker: 'TCS', stockName: 'Tata Consultancy Services', sectorId: 'sec_it',
    headline: 'TCS — Q4 FY26 results',
    description: 'TCS Q4 FY26.',
    expectedAt: '2026-04-29T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-20T05:00:00.000Z',
    tags: ['earnings'],
  }),
  event({
    id: 'cat_sahyadri_infy_q4', orgId: 'org_sahyadri', type: 'earnings', status: 'scheduled', importance: 'high',
    ticker: 'INFY', stockName: 'Infosys', sectorId: 'sec_it',
    headline: 'INFY — Q4 FY26 results',
    description: 'Infosys Q4 FY26.',
    expectedAt: '2026-04-30T13:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-22T05:00:00.000Z',
    tags: ['earnings'],
  }),

  // ── Vimana ────────────────────────────────────────────────────────
  event({
    id: 'cat_vimana_tcs_q4', orgId: 'org_vimana', type: 'earnings', status: 'scheduled', importance: 'critical',
    ticker: 'TCS', stockName: 'Tata Consultancy Services', sectorId: 'sec_it',
    headline: 'TCS — Q4 FY26 results',
    description: 'TCS Q4 FY26.',
    expectedAt: '2026-04-29T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-20T05:00:00.000Z',
    tags: ['earnings'],
  }),
  event({
    id: 'cat_vimana_hdfcbank_q4', orgId: 'org_vimana', type: 'earnings', status: 'scheduled', importance: 'high',
    ticker: 'HDFCBANK', stockName: 'HDFC Bank', sectorId: 'sec_fin',
    headline: 'HDFCBANK — Q4 FY26 results',
    description: 'HDFC Bank Q4 FY26 with focus on post-merger book.',
    expectedAt: '2026-05-03T10:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-21T05:00:00.000Z',
    tags: ['earnings'],
  }),
  event({
    id: 'cat_vimana_lt_q4', orgId: 'org_vimana', type: 'earnings', status: 'scheduled', importance: 'high',
    ticker: 'LT', stockName: 'Larsen & Toubro', sectorId: 'sec_industrial',
    headline: 'LT — Q4 FY26 results',
    description: 'L&T Q4 FY26.',
    expectedAt: '2026-05-08T11:00:00.000Z', hasIntradayTime: true,
    source: FIXTURE_SOURCE, updatedAt: '2026-04-18T05:00:00.000Z',
    tags: ['earnings'],
  }),
]

