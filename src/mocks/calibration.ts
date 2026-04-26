// Pre-baked calibration fixtures for the mock adapter.
//
// Mirrors what the server-side calibration engine produces from the
// canonical mock pipeline + market fixtures. Hand-tuned so the UI has
// rich, varied content offline (mock adapter) without importing the
// engine. In http/local mode the live engine supersedes these — same
// shapes, freshly computed.

import type {
  AlertEffectivenessSummary, BrokerCalibrationSummary,
  CalibrationSnapshot, CoverageSignalResult, OutcomeWindowResult,
} from '../domain'
import {
  asBrokerId, asCalibrationSnapshotId, asOrgId, asTicker,
} from '../lib/ids'

const ARANYA = asOrgId('org_aranya')
const NOW = '2026-04-26T07:30:00.000Z'

function w(window: '1d' | '3d' | '5d' | '10d' | '20d', sample: number, hit: number | null, mean: number, rel: number | null): OutcomeWindowResult {
  return {
    window, sampleSize: sample, hitRate: hit, meanReturnPct: mean,
    medianReturnPct: mean * 0.9,
    p25ReturnPct: mean - 1.5,
    p75ReturnPct: mean + 1.5,
    upsideAvgPct: Math.max(mean + 1.2, 0.6),
    downsideAvgPct: Math.min(mean - 1.0, -0.5),
    stddevPct: 1.6,
    meanRelReturnPct: rel,
    directionalSampleSize: hit === null ? 0 : Math.max(1, Math.floor(sample * 0.8)),
  }
}

const brokerCalibrations: readonly BrokerCalibrationSummary[] = [
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_kotak'), brokerShortName: 'KOTAK',
    sampleSize: 24, score: 38, confidence: 'medium',
    hitRate: 0.62, meanReturnPct: 1.4,
    byWindow: [w('1d', 24, 0.58, 0.4, 0.2), w('3d', 24, 0.61, 0.9, 0.5), w('5d', 24, 0.62, 1.4, 0.8), w('10d', 22, 0.6, 2.1, 1.2), w('20d', 20, 0.55, 3.0, 1.6)],
    heldByWindow: [w('1d', 14, 0.6, 0.5, 0.25), w('3d', 14, 0.65, 1.1, 0.7), w('5d', 14, 0.66, 1.7, 1.0), w('10d', 13, 0.62, 2.4, 1.4), w('20d', 12, 0.58, 3.4, 1.9)],
    bySector: [],
    longHitRate: 0.66, shortHitRate: null,
    againstPositionHitRate: 0.5, againstPositionSampleSize: 4,
    reasons: [
      { code: 'strong_hit_rate', text: 'Hit rate 62% at 5d.' },
      { code: 'mean_rel', text: 'Mean benchmark-relative +0.80% over 5d.' },
      { code: 'against_position_track_record', text: 'Against-position calls: 50% over n=4.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_mosl'), brokerShortName: 'MOSL',
    sampleSize: 22, score: 32, confidence: 'medium',
    hitRate: 0.59, meanReturnPct: 1.1,
    byWindow: [w('1d', 22, 0.55, 0.3, 0.1), w('3d', 22, 0.58, 0.7, 0.3), w('5d', 22, 0.59, 1.1, 0.6), w('10d', 20, 0.58, 1.7, 0.9), w('20d', 18, 0.52, 2.2, 1.1)],
    heldByWindow: [w('1d', 12, 0.58, 0.4, 0.2), w('3d', 12, 0.62, 0.8, 0.4), w('5d', 12, 0.62, 1.2, 0.7), w('10d', 11, 0.59, 1.8, 1.0), w('20d', 10, 0.55, 2.5, 1.3)],
    bySector: [],
    longHitRate: 0.62, shortHitRate: null,
    againstPositionHitRate: null, againstPositionSampleSize: 1,
    reasons: [
      { code: 'strong_hit_rate', text: 'Hit rate 59% at 5d.' },
      { code: 'mean_rel', text: 'Mean benchmark-relative +0.60% over 5d.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_ambit'), brokerShortName: 'AMBIT',
    sampleSize: 18, score: 24, confidence: 'medium',
    hitRate: 0.56, meanReturnPct: 0.9,
    byWindow: [w('1d', 18, 0.5, 0.2, 0.0), w('3d', 18, 0.55, 0.5, 0.2), w('5d', 18, 0.56, 0.9, 0.4), w('10d', 16, 0.55, 1.4, 0.7), w('20d', 14, 0.5, 1.8, 0.8)],
    heldByWindow: [w('1d', 10, 0.55, 0.3, 0.1), w('3d', 10, 0.6, 0.6, 0.3), w('5d', 10, 0.6, 1.0, 0.5), w('10d', 9, 0.58, 1.5, 0.8), w('20d', 8, 0.52, 1.9, 0.9)],
    bySector: [],
    longHitRate: 0.6, shortHitRate: null,
    againstPositionHitRate: null, againstPositionSampleSize: 1,
    reasons: [{ code: 'mean_rel', text: 'Mean benchmark-relative +0.40% over 5d.' }],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_nuvama'), brokerShortName: 'NUVAMA',
    sampleSize: 16, score: 6, confidence: 'low',
    hitRate: 0.5, meanReturnPct: 0.2,
    byWindow: [w('1d', 16, 0.45, 0.0, -0.1), w('3d', 16, 0.48, 0.1, -0.05), w('5d', 16, 0.5, 0.2, 0.0), w('10d', 14, 0.48, 0.4, 0.0), w('20d', 12, 0.45, 0.5, 0.0)],
    heldByWindow: [w('1d', 8, 0.5, 0.1, 0.0), w('3d', 8, 0.5, 0.2, 0.05), w('5d', 8, 0.5, 0.3, 0.1), w('10d', 7, 0.5, 0.5, 0.1), w('20d', 6, 0.5, 0.6, 0.1)],
    bySector: [],
    longHitRate: 0.5, shortHitRate: null,
    againstPositionHitRate: null, againstPositionSampleSize: 0,
    reasons: [
      { code: 'small_sample', text: 'Only 16 events at 5d — low confidence.' },
      { code: 'noisy', text: 'Hit rate near 50% — noisy signal.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_hdfc'), brokerShortName: 'HDFC',
    sampleSize: 14, score: -8, confidence: 'low',
    hitRate: 0.42, meanReturnPct: -0.3,
    byWindow: [w('1d', 14, 0.4, -0.1, -0.2), w('3d', 14, 0.41, -0.2, -0.3), w('5d', 14, 0.42, -0.3, -0.4), w('10d', 12, 0.4, -0.5, -0.5), w('20d', 10, 0.38, -0.7, -0.6)],
    heldByWindow: [w('1d', 8, 0.42, -0.1, -0.2), w('3d', 8, 0.42, -0.2, -0.3), w('5d', 8, 0.42, -0.3, -0.4), w('10d', 7, 0.4, -0.5, -0.5), w('20d', 6, 0.38, -0.6, -0.6)],
    bySector: [],
    longHitRate: 0.4, shortHitRate: null,
    againstPositionHitRate: 0.6, againstPositionSampleSize: 5,
    reasons: [
      { code: 'small_sample', text: 'Only 14 events at 5d — low confidence.' },
      { code: 'weak_hit_rate', text: 'Hit rate only 42% at 5d — fade signal.' },
      { code: 'against_position_track_record', text: 'Against-position calls: 60% over n=5 — pay attention to bearish HDFC notes.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, brokerId: asBrokerId('brk_jmfin'), brokerShortName: 'JM FIN',
    sampleSize: 12, score: 14, confidence: 'low',
    hitRate: 0.55, meanReturnPct: 0.6,
    byWindow: [w('1d', 12, 0.5, 0.2, 0.1), w('3d', 12, 0.53, 0.4, 0.2), w('5d', 12, 0.55, 0.6, 0.3), w('10d', 10, 0.55, 1.0, 0.5), w('20d', 8, 0.5, 1.2, 0.5)],
    heldByWindow: [w('1d', 6, 0.5, 0.2, 0.1), w('3d', 6, 0.55, 0.4, 0.2), w('5d', 6, 0.55, 0.7, 0.3), w('10d', 5, 0.55, 1.1, 0.5), w('20d', 4, 0.5, 1.3, 0.5)],
    bySector: [],
    longHitRate: 0.55, shortHitRate: null,
    againstPositionHitRate: null, againstPositionSampleSize: 0,
    reasons: [
      { code: 'small_sample', text: 'Only 12 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
]

const alertEffectiveness: readonly AlertEffectivenessSummary[] = [
  {
    orgId: ARANYA, kind: 'against_position', sampleSize: 6, score: 45,
    confidence: 'low', hitRate: 0.67, meanReturnPct: -1.2,
    byWindow: [w('1d', 6, 0.6, -0.4, -0.3), w('3d', 6, 0.65, -0.8, -0.6), w('5d', 6, 0.67, -1.2, -0.9), w('10d', 5, 0.6, -1.6, -1.1), w('20d', 4, 0.55, -1.9, -1.2)],
    byMembership: [
      { membership: 'all',       sampleSize: 6, hitRate: 0.67, meanReturnPct: -1.2 },
      { membership: 'held',      sampleSize: 6, hitRate: 0.67, meanReturnPct: -1.2 },
      { membership: 'watchlist', sampleSize: 0, hitRate: null, meanReturnPct: 0 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 6 events at 5d — low confidence.' },
      { code: 'strong', text: 'Hit rate 67% — predictive on held names.' },
      { code: 'rel_return', text: 'Mean benchmark-relative -0.90% at 5d.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'significant_change_held', sampleSize: 8, score: 28,
    confidence: 'low', hitRate: 0.62, meanReturnPct: 1.0,
    byWindow: [w('1d', 8, 0.55, 0.3, 0.2), w('3d', 8, 0.6, 0.7, 0.4), w('5d', 8, 0.62, 1.0, 0.6), w('10d', 7, 0.6, 1.5, 0.8), w('20d', 6, 0.55, 1.9, 1.0)],
    byMembership: [
      { membership: 'all',       sampleSize: 8, hitRate: 0.62, meanReturnPct: 1.0 },
      { membership: 'held',      sampleSize: 8, hitRate: 0.62, meanReturnPct: 1.0 },
      { membership: 'watchlist', sampleSize: 0, hitRate: null, meanReturnPct: 0 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 8 events at 5d — low confidence.' },
      { code: 'strong', text: 'Hit rate 62% — predictive.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'unresolved_divergence_held', sampleSize: 12, score: -4,
    confidence: 'low', hitRate: 0.48, meanReturnPct: -0.1,
    byWindow: [w('1d', 12, 0.45, -0.05, 0.0), w('3d', 12, 0.46, -0.07, 0.0), w('5d', 12, 0.48, -0.1, 0.0), w('10d', 10, 0.48, -0.15, 0.0), w('20d', 8, 0.45, -0.2, 0.0)],
    byMembership: [
      { membership: 'all',       sampleSize: 12, hitRate: 0.48, meanReturnPct: -0.1 },
      { membership: 'held',      sampleSize: 12, hitRate: 0.48, meanReturnPct: -0.1 },
      { membership: 'watchlist', sampleSize: 0, hitRate: null, meanReturnPct: 0 },
    ],
    reasons: [
      { code: 'noisy', text: 'Hit rate near 50% — noisy / fade.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'broker_outlier_held', sampleSize: 5, score: 15,
    confidence: 'low', hitRate: 0.6, meanReturnPct: 0.5,
    byWindow: [w('1d', 5, 0.55, 0.2, 0.1), w('3d', 5, 0.58, 0.4, 0.2), w('5d', 5, 0.6, 0.5, 0.3), w('10d', 4, 0.6, 0.8, 0.4), w('20d', 4, 0.55, 1.0, 0.5)],
    byMembership: [
      { membership: 'all',       sampleSize: 5, hitRate: 0.6, meanReturnPct: 0.5 },
      { membership: 'held',      sampleSize: 5, hitRate: 0.6, meanReturnPct: 0.5 },
      { membership: 'watchlist', sampleSize: 0, hitRate: null, meanReturnPct: 0 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 5 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'pile_in_book', sampleSize: 7, score: 20,
    confidence: 'low', hitRate: 0.57, meanReturnPct: 0.7,
    byWindow: [w('1d', 7, 0.5, 0.2, 0.1), w('3d', 7, 0.55, 0.5, 0.3), w('5d', 7, 0.57, 0.7, 0.4), w('10d', 6, 0.55, 1.1, 0.6), w('20d', 5, 0.5, 1.3, 0.6)],
    byMembership: [
      { membership: 'all',       sampleSize: 7, hitRate: 0.57, meanReturnPct: 0.7 },
      { membership: 'held',      sampleSize: 5, hitRate: 0.6, meanReturnPct: 0.8 },
      { membership: 'watchlist', sampleSize: 2, hitRate: null, meanReturnPct: 0.4 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 7 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'watchlist_fresh_candidate', sampleSize: 3, score: 0,
    confidence: 'very_low', hitRate: null, meanReturnPct: 0.3,
    byWindow: [w('1d', 3, null, 0.1, 0.05), w('3d', 3, null, 0.2, 0.1), w('5d', 3, null, 0.3, 0.15), w('10d', 2, null, 0.4, 0.2), w('20d', 2, null, 0.5, 0.2)],
    byMembership: [
      { membership: 'all',       sampleSize: 3, hitRate: null, meanReturnPct: 0.3 },
      { membership: 'held',      sampleSize: 0, hitRate: null, meanReturnPct: 0 },
      { membership: 'watchlist', sampleSize: 3, hitRate: null, meanReturnPct: 0.3 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 3 events at 5d — very low confidence.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, kind: 'stale_coverage_held', sampleSize: 4, score: -10,
    confidence: 'very_low', hitRate: null, meanReturnPct: -0.4,
    byWindow: [w('1d', 4, null, -0.1, 0.0), w('3d', 4, null, -0.2, 0.0), w('5d', 4, null, -0.4, 0.0), w('10d', 3, null, -0.6, 0.0), w('20d', 2, null, -0.7, 0.0)],
    byMembership: [
      { membership: 'all',       sampleSize: 4, hitRate: null, meanReturnPct: -0.4 },
      { membership: 'held',      sampleSize: 4, hitRate: null, meanReturnPct: -0.4 },
      { membership: 'watchlist', sampleSize: 0, hitRate: null, meanReturnPct: 0 },
    ],
    reasons: [
      { code: 'small_sample', text: 'Only 4 events at 5d — very low confidence.' },
      { code: 'stale_signal', text: 'No expected direction; informational only.' },
    ],
    generatedAt: NOW,
  },
]

const coverageByTicker: readonly CoverageSignalResult[] = [
  {
    orgId: ARANYA, ticker: asTicker('TCS'), sampleSize: 18, score: 35,
    confidence: 'medium', hitRate: 0.61, meanReturnPct: 1.3,
    topBrokers: [
      { brokerId: asBrokerId('brk_mosl'), brokerShortName: 'MOSL',  sampleSize: 6, score: 38, hitRate: 0.66 },
      { brokerId: asBrokerId('brk_kotak'), brokerShortName: 'KOTAK', sampleSize: 5, score: 35, hitRate: 0.6 },
      { brokerId: asBrokerId('brk_ambit'), brokerShortName: 'AMBIT', sampleSize: 4, score: 22, hitRate: 0.5 },
    ],
    recentAlertEffectivenessNote: 'Recent against-position alerts on TCS averaged -1.5% relative.',
    reasons: [
      { code: 'strong', text: '5d hit rate 61% on n=18.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, ticker: asTicker('ICICIBANK'), sampleSize: 14, score: 28,
    confidence: 'low', hitRate: 0.57, meanReturnPct: 1.0,
    topBrokers: [
      { brokerId: asBrokerId('brk_kotak'), brokerShortName: 'KOTAK', sampleSize: 5, score: 30, hitRate: 0.6 },
      { brokerId: asBrokerId('brk_nuvama'), brokerShortName: 'NUVAMA', sampleSize: 4, score: 8, hitRate: 0.5 },
    ],
    recentAlertEffectivenessNote: null,
    reasons: [
      { code: 'small_sample', text: '14 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, ticker: asTicker('TATAMOTORS'), sampleSize: 12, score: 18,
    confidence: 'low', hitRate: 0.55, meanReturnPct: 0.7,
    topBrokers: [
      { brokerId: asBrokerId('brk_ambit'), brokerShortName: 'AMBIT', sampleSize: 4, score: 28, hitRate: 0.6 },
      { brokerId: asBrokerId('brk_hdfc'), brokerShortName: 'HDFC', sampleSize: 3, score: -10, hitRate: 0.4 },
    ],
    recentAlertEffectivenessNote: 'HDFC notes have lagged on TATAMOTORS — fade.',
    reasons: [
      { code: 'small_sample', text: '12 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
  {
    orgId: ARANYA, ticker: asTicker('INFY'), sampleSize: 11, score: 22,
    confidence: 'low', hitRate: 0.55, meanReturnPct: 0.9,
    topBrokers: [
      { brokerId: asBrokerId('brk_ambit'), brokerShortName: 'AMBIT', sampleSize: 4, score: 24, hitRate: 0.6 },
      { brokerId: asBrokerId('brk_mosl'), brokerShortName: 'MOSL', sampleSize: 3, score: 18, hitRate: 0.55 },
    ],
    recentAlertEffectivenessNote: null,
    reasons: [
      { code: 'small_sample', text: '11 events at 5d — low confidence.' },
    ],
    generatedAt: NOW,
  },
]

export const calibrationSnapshot: CalibrationSnapshot = {
  id: asCalibrationSnapshotId('calsnap_aranya_demo'),
  orgId: ARANYA,
  generatedAt: NOW,
  methodologyVersion: 'v1.0',
  source: 'fixture',
  brokerCalibrations,
  alertEffectiveness,
  coverageByTicker,
  counters: {
    events: 96,
    outcomes: 472,
    directionalEvents: 58,
    priceCoveredTickers: 14,
    benchmarkCoveredTickers: 14,
    skippedNoPrice: 2,
  },
}
