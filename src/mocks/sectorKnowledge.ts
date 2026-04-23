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
  // Acme — one per sector that has any reports in the period.
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_tech'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 13,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'AI capex',         mentions: 8, stanceLean: 'bullish' },
      { theme: 'Datacenter',       mentions: 6, stanceLean: 'bullish' },
      { theme: 'Copilot',          mentions: 4, stanceLean: 'bullish' },
      { theme: 'DOJ / Regulation', mentions: 3, stanceLean: 'bearish' },
    ],
    reportIds: [
      'rpt_0001','rpt_0003','rpt_0004','rpt_0005','rpt_0008','rpt_0010',
      'rpt_0011','rpt_0012','rpt_0014','rpt_0015','rpt_0016','rpt_0018','rpt_0019',
    ].map(asReportId),
  },
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_energy'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 2,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'Brent deck', mentions: 2, stanceLean: 'bearish' },
      { theme: 'Guyana FCF', mentions: 2, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0002', 'rpt_0020'].map(asReportId),
  },
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_health'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 2,
    aggregateStance: 'neutral',
    topThemes: [
      { theme: 'GLP-1 TAM',   mentions: 2, stanceLean: 'bullish' },
      { theme: 'Competition', mentions: 2, stanceLean: 'bearish' },
    ],
    reportIds: ['rpt_0006', 'rpt_0013'].map(asReportId),
  },
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_consumer'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 3,
    aggregateStance: 'bearish',
    topThemes: [
      { theme: 'Auto margins',  mentions: 3, stanceLean: 'bearish' },
      { theme: 'Robotaxi',      mentions: 2, stanceLean: 'bullish' },
      { theme: 'China pricing', mentions: 2, stanceLean: 'bearish' },
    ],
    reportIds: ['rpt_0009', 'rpt_0017', 'rpt_0021'].map(asReportId),
  },
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_fin'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 1,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'NII trough', mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0022'].map(asReportId),
  },
  {
    orgId: asOrgId('org_acme'),
    sectorId: asSectorId('sec_industrial'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 1,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'Late cycle', mentions: 1, stanceLean: 'bullish' },
      { theme: 'Backlog',    mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0007'].map(asReportId),
  },

  // Northstar — smaller sample, just enough to exercise the adapter.
  {
    orgId: asOrgId('org_northstar'),
    sectorId: asSectorId('sec_tech'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 4,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'AI capex',   mentions: 2, stanceLean: 'bullish' },
      { theme: 'Datacenter', mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0023', 'rpt_0024', 'rpt_0025', 'rpt_0026'].map(asReportId),
  },
  {
    orgId: asOrgId('org_northstar'),
    sectorId: asSectorId('sec_consumer'),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    reportCount: 1,
    aggregateStance: 'bullish',
    topThemes: [
      { theme: 'Robotaxi', mentions: 1, stanceLean: 'bullish' },
    ],
    reportIds: ['rpt_0027'].map(asReportId),
  },
]
