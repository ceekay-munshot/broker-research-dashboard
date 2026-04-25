// Per-org portfolio snapshots. The mock adapter serves the row that matches
// the active orgId; orgs without a row see `null` and the dashboard
// degrades cleanly to its non-portfolio behavior.
//
// These are deliberately small, hand-tuned books that overlap the existing
// `reports` / `opinions` fixtures so the relevance and coverage engines
// produce visible signal in dev without further setup.

import type { PortfolioPosition, PortfolioSnapshot, WatchlistEntry } from '../domain'
import { asOrgId, asPortfolioId, asTicker, asUserId } from '../lib/ids'

const ARANYA_PORTFOLIO_ID = asPortfolioId('pf_aranya_main')
const SAHYADRI_PORTFOLIO_ID = asPortfolioId('pf_sahyadri_main')
const VIMANA_PORTFOLIO_ID = asPortfolioId('pf_vimana_main')

// Stable owner reference for the Aranya book (matches src/mocks/users.ts).
const ARANYA_PM = asUserId('usr_arjun')

const aranyaPositions: readonly PortfolioPosition[] = [
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('TCS'),
    direction: 'long', weightPct: 6.4, costBasis: 3850, conviction: 'high',
    tags: ['core', 'compounder'], ownerUserId: ARANYA_PM,
    openedAt: '2025-11-04T05:00:00.000Z', note: 'GenAI attach + margin cadence intact.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('INFY'),
    direction: 'long', weightPct: 4.1, costBasis: 1620, conviction: 'medium',
    tags: ['core'], ownerUserId: ARANYA_PM,
    openedAt: '2025-09-22T05:00:00.000Z', note: 'Deal ramp playing out; margin watch.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('ICICIBANK'),
    direction: 'long', weightPct: 7.8, costBasis: 1180, conviction: 'high',
    tags: ['core', 'financials'], ownerUserId: ARANYA_PM,
    openedAt: '2025-08-12T05:00:00.000Z', note: 'Best-in-class deposit franchise.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('TATAMOTORS'),
    direction: 'long', weightPct: 5.2, costBasis: 820, conviction: 'medium',
    tags: ['tactical', 'event_driven'], ownerUserId: ARANYA_PM,
    openedAt: '2026-01-30T05:00:00.000Z', note: 'JLR Range Rover refresh + India PV.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('RELIANCE'),
    direction: 'long', weightPct: 5.8, costBasis: 2750, conviction: 'medium',
    tags: ['core'], ownerUserId: ARANYA_PM,
    openedAt: '2025-10-09T05:00:00.000Z', note: 'Jio ARPU + retail re-rating.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('SBIN'),
    direction: 'long', weightPct: 3.6, costBasis: 760, conviction: 'medium',
    tags: ['financials'], ownerUserId: ARANYA_PM,
    openedAt: '2025-12-01T05:00:00.000Z', note: 'Retail credit + asset-quality benign.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('HINDUNILVR'),
    direction: 'short', weightPct: 1.8, costBasis: 2455, conviction: 'low',
    tags: ['tactical'], ownerUserId: ARANYA_PM,
    openedAt: '2026-04-10T05:00:00.000Z', note: 'Premium skincare disappointment trade.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('ONGC'),
    direction: 'short', weightPct: 1.4, costBasis: 290, conviction: 'low',
    tags: ['tactical'], ownerUserId: ARANYA_PM,
    openedAt: '2026-04-11T05:00:00.000Z', note: 'Brent deck risk hedge.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('LT'),
    direction: 'long', weightPct: 4.5, costBasis: 3500, conviction: 'high',
    tags: ['core', 'capex_cycle'], ownerUserId: ARANYA_PM,
    openedAt: '2025-07-19T05:00:00.000Z', note: 'India capex cycle proxy.' },
]

const aranyaWatchlist: readonly WatchlistEntry[] = [
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('HCLTECH'),
    addedAt: '2026-04-05T05:00:00.000Z', tags: ['it_services'],
    ownerUserId: ARANYA_PM, note: 'AI infra spend beneficiary.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('MARUTI'),
    addedAt: '2026-03-30T05:00:00.000Z', tags: ['autos'],
    ownerUserId: ARANYA_PM, note: 'Rural recovery monitor.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('SUNPHARMA'),
    addedAt: '2026-04-19T05:00:00.000Z', tags: ['pharma'],
    ownerUserId: ARANYA_PM, note: 'Specialty derm catalysts.' },
  { portfolioId: ARANYA_PORTFOLIO_ID, orgId: asOrgId('org_aranya'), ticker: asTicker('HDFCBANK'),
    addedAt: '2025-12-15T05:00:00.000Z', tags: ['financials'],
    ownerUserId: ARANYA_PM, note: 'Re-entry candidate post-merger.' },
]

const sahyadriPositions: readonly PortfolioPosition[] = [
  { portfolioId: SAHYADRI_PORTFOLIO_ID, orgId: asOrgId('org_sahyadri'), ticker: asTicker('RELIANCE'),
    direction: 'long', weightPct: 8.0, costBasis: 2670, conviction: 'high',
    tags: ['core'], ownerUserId: null, openedAt: '2026-01-09T05:00:00.000Z',
    note: 'Conglomerate sum-of-parts.' },
  { portfolioId: SAHYADRI_PORTFOLIO_ID, orgId: asOrgId('org_sahyadri'), ticker: asTicker('TCS'),
    direction: 'long', weightPct: 5.0, costBasis: 3920, conviction: 'high',
    tags: ['core', 'compounder'], ownerUserId: null, openedAt: '2026-01-09T05:00:00.000Z',
    note: 'Quality compounder.' },
  { portfolioId: SAHYADRI_PORTFOLIO_ID, orgId: asOrgId('org_sahyadri'), ticker: asTicker('MARUTI'),
    direction: 'short', weightPct: 2.5, costBasis: 12950, conviction: 'medium',
    tags: ['tactical'], ownerUserId: null, openedAt: '2026-04-10T05:00:00.000Z',
    note: 'Volume-growth derate hedge.' },
  { portfolioId: SAHYADRI_PORTFOLIO_ID, orgId: asOrgId('org_sahyadri'), ticker: asTicker('INFY'),
    direction: 'long', weightPct: 3.2, costBasis: 1660, conviction: 'medium',
    tags: ['core'], ownerUserId: null, openedAt: '2026-02-12T05:00:00.000Z',
    note: 'Underowned vs peers.' },
]

const sahyadriWatchlist: readonly WatchlistEntry[] = [
  { portfolioId: SAHYADRI_PORTFOLIO_ID, orgId: asOrgId('org_sahyadri'), ticker: asTicker('TATAMOTORS'),
    addedAt: '2026-04-22T05:00:00.000Z', tags: ['autos'],
    ownerUserId: null, note: 'Watching JLR commentary.' },
]

const vimanaPositions: readonly PortfolioPosition[] = [
  { portfolioId: VIMANA_PORTFOLIO_ID, orgId: asOrgId('org_vimana'), ticker: asTicker('TCS'),
    direction: 'long', weightPct: 7.5, costBasis: 3990, conviction: 'high',
    tags: ['core'], ownerUserId: null, openedAt: '2026-02-01T05:00:00.000Z',
    note: 'Core IT compounder.' },
  { portfolioId: VIMANA_PORTFOLIO_ID, orgId: asOrgId('org_vimana'), ticker: asTicker('HDFCBANK'),
    direction: 'long', weightPct: 6.0, costBasis: 1700, conviction: 'high',
    tags: ['core', 'financials'], ownerUserId: null, openedAt: '2026-02-01T05:00:00.000Z',
    note: 'Post-merger compounder.' },
  { portfolioId: VIMANA_PORTFOLIO_ID, orgId: asOrgId('org_vimana'), ticker: asTicker('LT'),
    direction: 'long', weightPct: 4.0, costBasis: 3650, conviction: 'medium',
    tags: ['capex_cycle'], ownerUserId: null, openedAt: '2026-02-01T05:00:00.000Z',
    note: 'Capex cycle proxy.' },
]

const vimanaWatchlist: readonly WatchlistEntry[] = [
  { portfolioId: VIMANA_PORTFOLIO_ID, orgId: asOrgId('org_vimana'), ticker: asTicker('RELIANCE'),
    addedAt: '2026-03-15T05:00:00.000Z', tags: ['conglomerate'],
    ownerUserId: null, note: 'Awaiting refining clarity.' },
]

const ASOF = '2026-04-26T00:00:00.000Z'

function totalGross(positions: readonly PortfolioPosition[]): number {
  return Math.round(positions.reduce((s, p) => s + Math.abs(p.weightPct ?? 0), 0) * 10) / 10
}

export const portfolioSnapshots: readonly PortfolioSnapshot[] = [
  {
    id: ARANYA_PORTFOLIO_ID,
    orgId: asOrgId('org_aranya'),
    asOf: ASOF,
    source: 'aranya_fund_a_2026q2',
    positions: aranyaPositions,
    watchlist: aranyaWatchlist,
    totalGrossExposurePct: totalGross(aranyaPositions),
    isConfigured: true,
  },
  {
    id: SAHYADRI_PORTFOLIO_ID,
    orgId: asOrgId('org_sahyadri'),
    asOf: ASOF,
    source: 'sahyadri_paper_2026q2',
    positions: sahyadriPositions,
    watchlist: sahyadriWatchlist,
    totalGrossExposurePct: totalGross(sahyadriPositions),
    isConfigured: true,
  },
  {
    id: VIMANA_PORTFOLIO_ID,
    orgId: asOrgId('org_vimana'),
    asOf: ASOF,
    source: 'vimana_main_2026q2',
    positions: vimanaPositions,
    watchlist: vimanaWatchlist,
    totalGrossExposurePct: totalGross(vimanaPositions),
    isConfigured: true,
  },
]
