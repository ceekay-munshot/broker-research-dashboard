// ─────────────────────────────────────────────────────────────────────────
// Demo consensus estimates + revisions, keyed by ticker.
//
// This is the *shape* the backend will eventually emit per stock — a
// flat list of metric rows with point + range per period, plus per-broker
// revision deltas. The frontend reads the shape blindly; whatever metrics
// the backend chooses to extract (sector-specific) flow through.
//
// Today this is hand-tuned demo data so the UI demonstrates with realistic
// numbers. When the backend starts producing the same shape, this fixture
// can be retired.
// ─────────────────────────────────────────────────────────────────────────

import type { EstimateRow, RevisionEntry } from '../viewModels/stockStreetView'
import { asBrokerId } from '../lib/ids'

export const CONSENSUS_ESTIMATES_BY_TICKER: Readonly<Record<string, readonly EstimateRow[]>> = {
  KIMS: [
    {
      metric: 'Revenue (₹ cr)',
      values: [
        { period: 'FY25A', point: 2650, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 3250, rangeLow: 3100, rangeHigh: 3400 },
        { period: 'FY27E', point: 3950, rangeLow: 3750, rangeHigh: 4150 },
      ],
      cagr2yr: 22.0,
    },
    {
      metric: 'EBITDA (₹ cr)',
      values: [
        { period: 'FY25A', point: 720, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 880, rangeLow: 840, rangeHigh: 920 },
        { period: 'FY27E', point: 1100, rangeLow: 1040, rangeHigh: 1160 },
      ],
      cagr2yr: 23.6,
    },
    {
      metric: 'EBITDA margin (%)',
      values: [
        { period: 'FY25A', point: 27.2, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 27.1, rangeLow: 26.5, rangeHigh: 27.5 },
        { period: 'FY27E', point: 27.8, rangeLow: 27.0, rangeHigh: 28.4 },
      ],
      cagr2yr: null,
    },
    {
      metric: 'ARPOB (₹/day)',
      values: [
        { period: 'FY25A', point: 38500, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 41200, rangeLow: 40500, rangeHigh: 42000 },
        { period: 'FY27E', point: 44500, rangeLow: 43200, rangeHigh: 45800 },
      ],
      cagr2yr: 7.6,
    },
    {
      metric: 'PAT (₹ cr)',
      values: [
        { period: 'FY25A', point: 215, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 290, rangeLow: 275, rangeHigh: 310 },
        { period: 'FY27E', point: 380, rangeLow: 355, rangeHigh: 405 },
      ],
      cagr2yr: 32.9,
    },
    {
      metric: 'EPS (₹)',
      values: [
        { period: 'FY25A', point: 26.8, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 36.0, rangeLow: 34.5, rangeHigh: 37.5 },
        { period: 'FY27E', point: 47.4, rangeLow: 45.0, rangeHigh: 49.8 },
      ],
      cagr2yr: 33.0,
    },
  ],

  APOLLOHOSP: [
    {
      metric: 'Revenue (₹ cr)',
      values: [
        { period: 'FY25A', point: 21950, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 26400, rangeLow: 25500, rangeHigh: 27300 },
        { period: 'FY27E', point: 30750, rangeLow: 29500, rangeHigh: 32000 },
      ],
      cagr2yr: 18.3,
    },
    {
      metric: 'HealthCo GMV (₹ cr)',
      values: [
        { period: 'FY25A', point: 16500, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 21800, rangeLow: 20500, rangeHigh: 23100 },
        { period: 'FY27E', point: 27400, rangeLow: 25500, rangeHigh: 29300 },
      ],
      cagr2yr: 28.8,
    },
    {
      metric: 'Hospital EBITDA (₹ cr)',
      values: [
        { period: 'FY25A', point: 2920, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 3640, rangeLow: 3510, rangeHigh: 3770 },
        { period: 'FY27E', point: 4380, rangeLow: 4160, rangeHigh: 4600 },
      ],
      cagr2yr: 22.5,
    },
    {
      metric: 'EBITDA margin (%)',
      values: [
        { period: 'FY25A', point: 23.9, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 24.5, rangeLow: 24.0, rangeHigh: 25.0 },
        { period: 'FY27E', point: 25.1, rangeLow: 24.5, rangeHigh: 25.7 },
      ],
      cagr2yr: null,
    },
    {
      metric: 'PAT (₹ cr)',
      values: [
        { period: 'FY25A', point: 1180, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 1560, rangeLow: 1495, rangeHigh: 1625 },
        { period: 'FY27E', point: 1930, rangeLow: 1825, rangeHigh: 2035 },
      ],
      cagr2yr: 27.9,
    },
    {
      metric: 'EPS (₹)',
      values: [
        { period: 'FY25A', point: 82.0, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 108.5, rangeLow: 104.0, rangeHigh: 113.0 },
        { period: 'FY27E', point: 134.3, rangeLow: 127.0, rangeHigh: 141.0 },
      ],
      cagr2yr: 28.0,
    },
  ],

  KOTAKBANK: [
    {
      metric: 'NII (₹ cr)',
      values: [
        { period: 'FY25A', point: 28500, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 32600, rangeLow: 31800, rangeHigh: 33400 },
        { period: 'FY27E', point: 37400, rangeLow: 36200, rangeHigh: 38600 },
      ],
      cagr2yr: 14.6,
    },
    {
      metric: 'Pre-prov profit (₹ cr)',
      values: [
        { period: 'FY25A', point: 24900, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 28600, rangeLow: 27800, rangeHigh: 29400 },
        { period: 'FY27E', point: 33200, rangeLow: 32000, rangeHigh: 34400 },
      ],
      cagr2yr: 15.5,
    },
    {
      metric: 'NIM (%)',
      values: [
        { period: 'FY25A', point: 4.85, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 4.92, rangeLow: 4.85, rangeHigh: 4.99 },
        { period: 'FY27E', point: 5.05, rangeLow: 4.95, rangeHigh: 5.15 },
      ],
      cagr2yr: null,
    },
    {
      metric: 'Credit costs (bps)',
      values: [
        { period: 'FY25A', point: 38, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 42, rangeLow: 38, rangeHigh: 46 },
        { period: 'FY27E', point: 45, rangeLow: 40, rangeHigh: 50 },
      ],
      cagr2yr: null,
    },
    {
      metric: 'PAT (₹ cr)',
      values: [
        { period: 'FY25A', point: 14800, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 17100, rangeLow: 16650, rangeHigh: 17550 },
        { period: 'FY27E', point: 19950, rangeLow: 19250, rangeHigh: 20650 },
      ],
      cagr2yr: 16.2,
    },
    {
      metric: 'EPS (₹)',
      values: [
        { period: 'FY25A', point: 74.5, rangeLow: null, rangeHigh: null },
        { period: 'FY26E', point: 86.0, rangeLow: 83.7, rangeHigh: 88.3 },
        { period: 'FY27E', point: 100.4, rangeLow: 96.8, rangeHigh: 103.9 },
      ],
      cagr2yr: 16.1,
    },
  ],
}

// Per-broker KPI revisions vs prior. Keys are tickers; values are the
// broker-keyed delta rows used by section D.
export const REVISIONS_BY_TICKER: Readonly<Record<string, readonly RevisionEntry[]>> = {
  KIMS: [
    {
      brokerId: asBrokerId('brk_ambit'),
      brokerShortName: 'Ambit',
      deltas: [
        { metric: 'Revenue', direction: 'up', pctText: '↑ +3%' },
        { metric: 'EBITDA', direction: 'up', pctText: '↑ +5%' },
        { metric: 'PAT', direction: 'up', pctText: '↑ +4%' },
      ],
    },
    {
      brokerId: asBrokerId('brk_kotak'),
      brokerShortName: 'Kotak',
      deltas: [
        { metric: 'Revenue', direction: 'down', pctText: '↓ −2%' },
        { metric: 'EBITDA', direction: 'down', pctText: '↓ −4%' },
        { metric: 'PAT', direction: 'down', pctText: '↓ −5%' },
      ],
    },
  ],
  APOLLOHOSP: [
    {
      brokerId: asBrokerId('brk_iifl'),
      brokerShortName: 'IIFL',
      deltas: [
        { metric: 'Revenue', direction: 'up', pctText: '↑ +2%' },
        { metric: 'EBITDA', direction: 'up', pctText: '↑ +1%' },
        { metric: 'PAT', direction: 'up', pctText: '↑ +3%' },
        { metric: 'EPS', direction: 'up', pctText: '↑ +3%' },
      ],
    },
  ],
  KOTAKBANK: [
    {
      brokerId: asBrokerId('brk_jm'),
      brokerShortName: 'JM Fin.',
      deltas: [
        { metric: 'NII', direction: 'unchanged', pctText: null },
        { metric: 'PAT', direction: 'up', pctText: '↑ +1%' },
        { metric: 'EPS', direction: 'up', pctText: '↑ +1%' },
      ],
    },
  ],
}
