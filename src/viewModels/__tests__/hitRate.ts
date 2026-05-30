// Tests for the Hit Rate view-model transforms:
//   1. buildHitRateLeaderboard — filtering, ordering, colour join, empty state
//   2. buildCallMarkers / tallyMarkers — per-call outcome grading vs a price
//      series (correct / wrong / neutral / pending / no_price)
//
// Pure functions, no React/adapter. Run: npx tsx src/viewModels/__tests__/hitRate.ts

import type {
  Broker, BrokerCalibrationSummary, CalibrationSnapshot, DailyPricePoint,
  BrokerId, OrgId, StockTicker,
} from '../../domain'
import {
  buildHitRateLeaderboard, buildCallMarkers, tallyMarkers, directionFor,
  type CallMarkerInput,
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

function call(over: Partial<CallMarkerInput>): CallMarkerInput {
  return {
    reportId: 'r1', publishedAt: '2026-01-01T00:00:00.000Z',
    rating: null, stance: 'neutral', targetPrice: null, ...over,
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

// ── 3 · Call outcome grading ───────────────────────────────────────────────

{
  // Rising 21-pt series: +20% by the 20-step horizon.
  const up = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i))
  const [buyHit] = buildCallMarkers([call({ rating: 'Buy' })], up)
  check('bullish call that rose → correct', buyHit!.outcome === 'correct', buyHit!.outcome)
  check('correct marker carries forward return', Math.round(buyHit!.returnPct!) === 20, String(buyHit!.returnPct))

  const [sellMiss] = buildCallMarkers([call({ rating: 'Sell' })], up)
  check('bearish call that rose → wrong', sellMiss!.outcome === 'wrong', sellMiss!.outcome)
}

{
  // Falling 21-pt series: -20% by the horizon.
  const down = mkCloses(Array.from({ length: 21 }, (_, i) => 100 - i))
  check('bearish call that fell → correct', buildCallMarkers([call({ rating: 'Sell' })], down)[0]!.outcome === 'correct')
  check('bullish call that fell → wrong', buildCallMarkers([call({ rating: 'Buy' })], down)[0]!.outcome === 'wrong')
}

{
  // Near-flat series: +2% over 20 steps, inside the ±5% dead-band.
  const flatish = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i * 0.1))
  check('directional call inside dead-band → neutral',
    buildCallMarkers([call({ rating: 'Buy' })], flatish)[0]!.outcome === 'neutral')
  check('Hold call → neutral regardless of move',
    buildCallMarkers([call({ rating: 'Hold' })], flatish)[0]!.outcome === 'neutral')
}

{
  // Too-recent: only 10 points, so a 20-step horizon falls off the end.
  const short = mkCloses(Array.from({ length: 10 }, (_, i) => 100 + i))
  check('call with no forward point → pending', buildCallMarkers([call({ rating: 'Buy' })], short)[0]!.outcome === 'pending')

  // Before the price window → no anchor.
  const later = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i), '2026-03-01')
  const early = buildCallMarkers([call({ rating: 'Buy', publishedAt: '2026-01-01T00:00:00.000Z' })], later)[0]
  check('call before the price window → no_price', early!.outcome === 'no_price', early!.outcome)
  check('empty price series → no_price', buildCallMarkers([call({ rating: 'Buy' })], [])[0]!.outcome === 'no_price')
}

// ── 4 · Tally ───────────────────────────────────────────────────────────────

{
  const up = mkCloses(Array.from({ length: 21 }, (_, i) => 100 + i))
  const markers = buildCallMarkers([
    call({ reportId: 'r1', rating: 'Buy' }),   // correct
    call({ reportId: 'r2', rating: 'Sell' }),  // wrong
    call({ reportId: 'r3', rating: 'Hold' }),  // neutral — not counted
  ], up)
  const t = tallyMarkers(markers)
  check('tally counts only graded directional calls', t.evaluated === 2, String(t.evaluated))
  check('tally correct count', t.correct === 1, String(t.correct))
  check('tally hit rate', t.hitRate === 0.5, String(t.hitRate))
  check('empty tally → null hit rate', tallyMarkers([]).hitRate === null)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
