import type { SectorKnowledgeItem } from '../domain'
import {
  asOrgId, asSectorId, asReportId,
} from '../lib/ids'

// Phase 2 placeholder. Real sector knowledge is built up by accumulating
// every normalized report tagged into a sector over a rolling window. Here
// we return a minimal, internally-consistent summary per sector so the
// future sector-feed UI can render without waiting for Phase 2 compute.

const PERIOD_START = '2026-04-01T00:00:00.000Z'
const PERIOD_END   = '2026-04-23T23:59:59.000Z'

export const sectorKnowledgeItems: readonly SectorKnowledgeItem[] = [
  // Aranya — one per sector with reports in the period.
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_it'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 6,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'BFSI deal TCV',        mentions: 3, stanceLean: 'bullish' },
      { theme: 'GenAI attach',         mentions: 3, stanceLean: 'bullish' },
      { theme: 'Discretionary spend',  mentions: 3, stanceLean: 'neutral' },
      { theme: 'Margin cadence',       mentions: 2, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0003','rpt_0004','rpt_0014','rpt_0016','rpt_0017','rpt_0018'].map(asReportId),
  },
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_fin'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 3,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'NIM trough',           mentions: 2, stanceLean: 'bullish' },
      { theme: 'Unsecured credit',     mentions: 2, stanceLean: 'bearish' },
      { theme: 'Deposit franchise',    mentions: 2, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0005','rpt_0012','rpt_0015','rpt_0022'].map(asReportId),
  },
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_energy'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 4,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'Jio ARPU',             mentions: 2, stanceLean: 'bullish' },
      { theme: 'Brent deck',           mentions: 2, stanceLean: 'bearish' },
      { theme: 'Upstream capex',       mentions: 2, stanceLean: 'bullish' },
      { theme: 'Refining margins',     mentions: 1, stanceLean: 'neutral' },
    ],
    reportIds: ['rpt_0001','rpt_0002','rpt_0011','rpt_0020'].map(asReportId),
  },
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_pharma'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 2,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'Specialty',            mentions: 1, stanceLean: 'bullish' },
      { theme: 'US generics pricing',  mentions: 1, stanceLean: 'bearish' },
      { theme: 'India formulations',   mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0006','rpt_0013'].map(asReportId),
  },
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_consumer'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 5,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'Rural demand',         mentions: 3, stanceLean: 'bearish' },
      { theme: 'Premiumisation',       mentions: 3, stanceLean: 'neutral' },
      { theme: 'JLR margins',          mentions: 2, stanceLean: 'bearish' },
      { theme: 'EV roadmap',           mentions: 2, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0008','rpt_0009','rpt_0010','rpt_0019','rpt_0021'].map(asReportId),
  },
  {
    orgId: asOrgId('org_aranya'),
    sectorId: asSectorId('sec_industrial'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 1,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'Order book',           mentions: 1, stanceLean: 'bullish' },
      { theme: 'International orders', mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0007'].map(asReportId),
  },

  // Sahyadri — smaller sample, just enough to exercise the adapter.
  {
    orgId: asOrgId('org_sahyadri'),
    sectorId: asSectorId('sec_it'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 2,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'GenAI attach', mentions: 1, stanceLean: 'bullish' },
      { theme: 'Deal TCV',     mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0024', 'rpt_0026'].map(asReportId),
  },
  {
    orgId: asOrgId('org_sahyadri'),
    sectorId: asSectorId('sec_consumer'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 2,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'JLR recovery',  mentions: 1, stanceLean: 'bullish' },
      { theme: 'Rural demand',  mentions: 1, stanceLean: 'bearish' },
    ],
    reportIds: ['rpt_0025', 'rpt_0027'].map(asReportId),
  },
]
