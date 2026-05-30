// Tests for the Hit Rate view-model transforms:
//   1. buildHitRateLeaderboard — filtering, ordering, colour join, empty state
//   2. buildCallRows — per-call gain since the call + whether the target is met
//
// Pure functions, no React/adapter. Run: npx tsx src/viewModels/__tests__/hitRate.ts

import type {
  Broker, BrokerCalibrationSummary, CalibrationSnapshot, DailyPricePoint,
  BrokerId, OrgId, StockTicker,
} from '../../domain'
import {
  buildHitRateLeaderboard, buildCallRows, directionFor,
  type CallRowInput,
} from '../hitRate'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`  ok   ${label}`)
  else { failed++; console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`) }
}

const ORG = 'org_test' as unknown as OrgId

// ── Factories ───────────────────────────────────────────────────────────

function bc(id: string, hitRate: number | null, sampleSize: number): BrokerCalibrationSummary {
  return {
    orgId: ORG,
    brokerId: id as unknown as BrokerId,
    brokerShortName: id.replace('brk_', '').toUpperCase(),
    sampleSize,
    score: 0,
    confidence: sampleSize >= 15 ? 'medium' : sampleSize >= 5 ? 'low' : 'very_low',
    hitRate,
    meanReturnPct: 0,
    byWindow: [],
    heldByWindow: [],
    bySector: [],
    longHitRate: null,
    shortHitRate: null,
    againstPositionHitRate: null,
    againstPositionSampleSize: 0,
    reasons: [],
    generatedAt: '2026-04-25T00:00:00.000Z',
  }
}

function broker(id: string, color: string | null): Broker {
  return {
    id: id as unknown as BrokerId,
    name: `${id} Securities`,
    shortName: id.replace('brk_', '').toUpperCase(),
    senderDomains: [],
    researchAliases: [],
    coverageTags: [],
    brandColor: color,
    website: null,
  }
}

function snapshot(brokerCalibrations: readonly BrokerCalibrationSummary[]): CalibrationSnapshot {
  return {
    id: 'cal_1' as unknown as CalibrationSnapshot['id'],
    orgId: ORG,
    generatedAt: '2026-04-25T00:00:00.000Z',
    methodologyVersion: 'test',
    source: 'fixture',
    brokerCalibrations,
    alertEffectiveness: [],
    coverageByTicker: [],
    counters: {
      events: 0, outcomes: 0, directionalEvents: 0,
      priceCoveredTickers: 0, benchmarkCoveredTickers: 0, skippedNoPrice: 0,
    },
  }
}

function mkCloses(values: readonly number[], start = '2026-01-01'): DailyPricePoint[] {
  const base = Date.parse(`${start}T00:00:00.000Z`)
  return values.map((close, i) => ({
    ticker: 'TCS' as unknown as StockTicker,
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    close,
    currency: 'INR',
  }))
}

function call(over: Partial<CallRowInput>): CallRowInput {
  return {
    reportId: 'r1', publishedAt: '2026-01-01T00:00:00.000Z',
    rating: null, stance: 'neutral', targetPrice: null, targetCurrency: 'INR', ...over,
  }
}

// ── 1 · Leaderboard ───────────────────────────────────────────────────────

{
  const snap = snapshot([
    bc('brk_a', 0.62, 24),
    bc('brk_b', 0.62, 10),  // ties brk_a on rate → ranks below on sample size
    bc('brk_c', 0.40, 14),
    bc('brk_d', null, 8),   // null rate → sorts last
    bc('brk_e', 0.99, 0),   // zero sample → filtered out
  ])
  const vm = buildHitRateLeaderboard({ snapshot: snap, brokers: [broker('brk_a', '#abc123')] })

  check('drops zero-sample analysts', vm.rows.length === 4, String(vm.rows.length))
  check('orders best hit rate first, ties broken by sample size',
    vm.rows.map((r) => r.shortName).join(',') === 'A,B,C,D',
    vm.rows.map((r) => r.shortName).join(','))
  check('null hit rate sorts last', vm.rows[vm.rows.length - 1]!.shortName === 'D')
  check('joins brand colour from the broker catalog', vm.rows[0]!.color === '#abc123', String(vm.rows[0]!.color))
  check('unmatched broker colour is null', vm.rows[1]!.color === null, String(vm.rows[1]!.color))
  check('hasData true with rows', vm.hasData && vm.emptyMessage === null)
  check('carries snapshot generatedAt', vm.generatedAt === '2026-04-25T00:00:00.000Z', String(vm.generatedAt))
}

{
  const vm = buildHitRateLeaderboard({ snapshot: null, brokers: [] })
  check('null snapshot → empty with message', !vm.hasData && vm.rows.length === 0 && vm.emptyMessage !== null)
}

// ── 2 · directionFor ────────────────────────────────────────────────────────

{
  check('Buy → up', directionFor('Buy', 'neutral') === 'up')
  check('Overweight → up', directionFor('Overweight', 'neutral') === 'up')
  check('Sell → down', directionFor('Sell', 'neutral') === 'down')
  check('Underweight → down', directionFor('Underweight', 'neutral') === 'down')
  check('Hold → flat', directionFor('Hold', 'bullish') === 'flat')
  check('no rating falls back to stance', directionFor(null, 'bearish') === 'down')
}

// ── 3 · Call rows: gain since call + target met ─────────────────────────────

{
  // Rising 21-pt series: idx0 = 100 … idx20 = 120. Call anchors at idx0 (=100).
  const up = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i))

  const buy = buildCallRows([call({ rating: 'Buy', targetPrice: 110 })], up, 120)[0]!
  check('call price anchored at the call date', buy.callPrice === 100, String(buy.callPrice))
  check('gain since call = (cmp − callPrice)/callPrice', Math.round(buy.gainPct!) === 20, String(buy.gainPct))
  check('rising stock favours a Buy', buy.favorable === true)
  check('target met when cmp ≥ target (buy)', buy.result === 'hit', buy.result)

  const buyOpen = buildCallRows([call({ rating: 'Buy', targetPrice: 130 })], up, 120)[0]!
  check('target open when cmp < target (buy)', buyOpen.result === 'open', buyOpen.result)

  const sell = buildCallRows([call({ rating: 'Sell', targetPrice: 90 })], mkCloses(Array.from({ length: 21 }, (_, i) => 100 - i)), 80)[0]!
  check('falling stock favours a Sell', sell.favorable === true, String(sell.gainPct))
  check('target met when cmp ≤ target (sell)', sell.result === 'hit', sell.result)

  const hold = buildCallRows([call({ rating: 'Hold', targetPrice: 110 })], up, 120)[0]!
  check('Hold has no target result', hold.result === 'na', hold.result)
  check('Hold gain not favourable-flagged', hold.favorable === null)
}

{
  // Call dated after the price window → no anchor price → no gain, but the
  // target can still be judged from the current price.
  const early = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i), '2026-01-01') // ends ~2026-01-21
  const future = buildCallRows([call({ rating: 'Buy', publishedAt: '2026-03-01T00:00:00.000Z', targetPrice: 110 })], early, 120)[0]!
  check('call after the window has no call price', future.callPrice === null, String(future.callPrice))
  check('no call price → no gain', future.gainPct === null)
  check('target still graded from current price', future.result === 'hit', future.result)

  // No current price at all → no gain, no target verdict.
  const noCmp = buildCallRows([call({ rating: 'Buy', targetPrice: 110 })], mkCloses([100, 105]), null)[0]!
  check('no cmp → null gain', noCmp.gainPct === null)
  check('no cmp → na result', noCmp.result === 'na', noCmp.result)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
