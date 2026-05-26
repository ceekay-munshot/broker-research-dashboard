// Tests for the Disagreements-tab insight composer.
// Locks in `composeStreetInsight`'s priority tree:
//   1. Disagreement-heavy cases delegate to `composeDisagreementInsight`
//   2. Consensus-only `consensus_bullish` / `consensus_bearish` emits the
//      "All N brokers are constructive / cautious — targets cluster…" form
//   3. Consensus-only `unresolved` with at least one ConsensusPoint emits
//      the "broadly align on …" form
//   4. Fallback (no consensus, no disagreement) returns the existing
//      sentence-6 wording from `composeDisagreementInsight`
//
// Calls the composer with synthesized viewmodel inputs — no React,
// no adapter, no engine. Run: npx tsx src/viewModels/__tests__/disagreementInsight.ts

import type { StockTicker } from '../../domain'
import type { DivergenceCardViewModel } from '../divergence'
import { composeStreetInsight } from '../disagreementInsight'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

// ── Fixture builders ────────────────────────────────────────────────────

function makeCard(over: Partial<DivergenceCardViewModel> = {}): DivergenceCardViewModel {
  const base: DivergenceCardViewModel = {
    ticker: 'TEST' as unknown as StockTicker,
    stockName: 'Test Co',
    sectorName: 'Industrials',
    currency: 'INR',
    brokerCount: 3,
    brokers: [],
    stanceDistribution: { bullish: 0, neutral: 0, bearish: 0 },
    targetStats: {
      count: 0, mean: null, median: null, high: null, low: null,
      stdev: null, spreadPct: null,
    },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'unresolved',
      strength: 'weak',
      narrative: '',
      keyDrivers: [],
      openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
    confidence: { score: 0.5, band: 'moderate', rationale: [] },
    strength: 'weak',
    consensus: [],
    disagreements: [],
    outliers: [],
  }
  return { ...base, ...over }
}

// ── 1. Disagreement-heavy: delegates to composeDisagreementInsight ──────

console.log('composeStreetInsight — disagreement-heavy delegation\n')

{
  const card = makeCard({
    brokerCount: 4,
    stanceDistribution: { bullish: 2, neutral: 0, bearish: 2 },
    targetStats: {
      count: 4, mean: 1000, median: 1000, high: 1500, low: 500,
      stdev: 400, spreadPct: 100,
    },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'mixed_constructive', strength: 'weak',
      narrative: '', keyDrivers: [], openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
    disagreements: [{
      dimension: 'margin',
      topic: 'Margin assumptions',
      bullClaims: [], bearClaims: [],
      bullBrokers: [], bearBrokers: [],
      bullCitationCount: 0, bearCitationCount: 0,
    }],
  })
  const out = composeStreetInsight(card)
  check('wide spread + disagreement point → mentions the spread / target range',
    out.includes('100%') || out.includes('spread') || out.includes('Targets span') || out.includes('₹500') || out.includes('₹1,500'),
    out)
}

// ── 2. Consensus-only consensus_bullish: clustered-targets form ─────────

console.log('\ncomposeStreetInsight — consensus_bullish branch\n')

{
  const card = makeCard({
    brokerCount: 5,
    stanceDistribution: { bullish: 5, neutral: 0, bearish: 0 },
    targetStats: {
      count: 5, mean: 1000, median: 1000, high: 1050, low: 950,
      stdev: 40, spreadPct: 10,
    },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'consensus_bullish', strength: 'strong',
      narrative: '', keyDrivers: [], openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
    consensus: [{
      dimension: 'growth',
      topic: 'Capacity ramp',
      claim: 'New Bhopal plant adds ~30% to capacity by FY27.',
      polarity: 'bullish',
      brokers: [
        { id: 'b1', name: 'Kotak' },
        { id: 'b2', name: 'IIFL' },
      ],
      supportingClaims: [],
      evidenceCount: 4,
    }],
  })
  const out = composeStreetInsight(card)
  check('consensus_bullish names all-N constructive', out.startsWith('All 5 brokers are constructive'), out)
  check('consensus_bullish surfaces the clustered target range',
    out.includes('₹950–₹1,050') || (out.includes('₹950') && out.includes('₹1,050')), out)
  check('consensus_bullish names the dominant consensus topic (lowercased)',
    out.toLowerCase().includes('capacity ramp'), out)
}

// ── 3. Consensus_bearish analogue ──────────────────────────────────────

{
  const card = makeCard({
    brokerCount: 3,
    stanceDistribution: { bullish: 0, neutral: 0, bearish: 3 },
    targetStats: {
      count: 3, mean: 200, median: 200, high: 210, low: 190,
      stdev: 8, spreadPct: 10,
    },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'consensus_bearish', strength: 'strong',
      narrative: '', keyDrivers: [], openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
    consensus: [{
      dimension: 'demand_or_pricing',
      topic: 'Regulatory overhang',
      claim: 'Pending tariff order caps pricing power.',
      polarity: 'bearish',
      brokers: [{ id: 'b1', name: 'Nuvama' }],
      supportingClaims: [],
      evidenceCount: 2,
    }],
  })
  const out = composeStreetInsight(card)
  check('consensus_bearish names all-N cautious', out.startsWith('All 3 brokers are cautious'), out)
  check('consensus_bearish surfaces the consensus topic',
    out.toLowerCase().includes('regulatory overhang'), out)
}

// ── 4. Unresolved + at least one ConsensusPoint → broadly-align form ───

console.log('\ncomposeStreetInsight — unresolved-but-aligned branch\n')

{
  const card = makeCard({
    brokerCount: 3,
    stanceDistribution: { bullish: 1, neutral: 1, bearish: 1 },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'unresolved', strength: 'weak',
      narrative: '', keyDrivers: [], openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
    consensus: [{
      dimension: 'management_execution',
      topic: 'Capital allocation discipline',
      claim: 'Buyback cadence has steadied capital returns.',
      polarity: 'neutral',
      brokers: [
        { id: 'b1', name: 'IIFL' },
        { id: 'b2', name: 'Kotak' },
      ],
      supportingClaims: ['Net cash positive.'],
      evidenceCount: 3,
    }],
  })
  const out = composeStreetInsight(card)
  check('unresolved + consensus → "broadly align on" form',
    out.includes('broadly align on') && out.toLowerCase().includes('capital allocation discipline'),
    out)
}

// ── 5. Fallback: no consensus, no disagreement → delegates to composeDisagreementInsight

console.log('\ncomposeStreetInsight — empty-everything fallback\n')

{
  const card = makeCard({
    brokerCount: 3,
    stanceDistribution: { bullish: 2, neutral: 1, bearish: 0 },
    resultant: {
      ticker: 'TEST' as unknown as StockTicker,
      state: 'consensus_bullish', strength: 'moderate',
      narrative: '', keyDrivers: [], openQuestions: [],
      asOf: '2026-05-23T00:00:00.000Z',
    },
  })
  // consensus_bullish + no consensus points + no target stats → the
  // composer falls into the "the call is uniform across the desk" branch.
  const out = composeStreetInsight(card)
  check('consensus_bullish + no consensus points → uniform-call fallback string',
    out.startsWith('All 3 brokers are constructive') && out.includes('uniform across the desk'),
    out)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
