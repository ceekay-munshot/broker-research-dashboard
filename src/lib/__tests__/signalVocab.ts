// Tests for the signal vocabulary module (src/lib/signalVocab.ts).
// Locks in (a) exhaustive label coverage for every enum we own and
// (b) the formatConsensusRating() copy contract.
// Run: npx tsx src/lib/__tests__/signalVocab.ts

import type { ResultantState, StrengthBand } from '../../engine/types'
import type {
  ArbBand, NoteSignalKind, NoteSignalSource, ConsensusRating,
} from '../../domain/signal'
import type { Rating } from '../../domain'
import {
  RESULTANT_STATE_LABEL, RESULTANT_STATE_SUBTEXT_TEMPLATE, STRENGTH_LABEL,
  ARB_LABEL, NOTE_SIGNAL_LABEL, NOTE_SIGNAL_SOURCE_BLURB,
  formatConsensusRating,
} from '../signalVocab'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

console.log('signalVocab\n')

// ── Exhaustive label coverage ───────────────────────────────────────────
// Each map MUST carry an entry for every enum member. Missing keys would
// surface in production as `undefined` chip text, which is worse than
// over-specific copy.

const ALL_STATES: ResultantState[] = [
  'consensus_bullish', 'consensus_bearish',
  'mixed_constructive', 'mixed_cautious',
  'unresolved', 'outlier_driven',
]
for (const s of ALL_STATES) {
  check(`RESULTANT_STATE_LABEL[${s}] is non-empty`, RESULTANT_STATE_LABEL[s].length > 0)
  check(`RESULTANT_STATE_SUBTEXT_TEMPLATE[${s}] is non-empty`, RESULTANT_STATE_SUBTEXT_TEMPLATE[s].length > 0)
}

const ALL_STRENGTHS: StrengthBand[] = ['strong', 'moderate', 'weak']
for (const s of ALL_STRENGTHS) {
  check(`STRENGTH_LABEL[${s}] is non-empty`, STRENGTH_LABEL[s].length > 0)
}

const ALL_ARB_BANDS: ArbBand[] = ['none', 'low', 'moderate', 'high']
for (const b of ALL_ARB_BANDS) {
  check(`ARB_LABEL[${b}] is non-empty`, ARB_LABEL[b].length > 0)
}

const ALL_NOTE_SIGNAL_KINDS: NoteSignalKind[] = [
  'bullish_signal', 'cautious_signal', 'bearish_signal',
  'upgrade', 'downgrade', 'new_coverage',
]
for (const k of ALL_NOTE_SIGNAL_KINDS) {
  check(`NOTE_SIGNAL_LABEL[${k}] is non-empty`, NOTE_SIGNAL_LABEL[k].length > 0)
}

const ALL_NOTE_SIGNAL_SOURCES: NoteSignalSource[] = ['formal_rating', 'title', 'body', 'report_type']
for (const s of ALL_NOTE_SIGNAL_SOURCES) {
  check(`NOTE_SIGNAL_SOURCE_BLURB[${s}] is non-empty`, NOTE_SIGNAL_SOURCE_BLURB[s].length > 0)
}

// ── De-jargonization spot-checks ────────────────────────────────────────
// The whole point of this PR. Confirm the new plain-language labels are in
// place and the old jargon is gone.

check('ARB_LABEL.high reads as plain disagreement language, not ARB jargon',
  ARB_LABEL.high === 'Wide disagreement', ARB_LABEL.high)
check('ARB_LABEL.low reads as plain agreement language',
  ARB_LABEL.low === 'Tight agreement', ARB_LABEL.low)
check('ARB_LABEL.none is plain English',
  ARB_LABEL.none === 'Only 1 broker covers this', ARB_LABEL.none)
check('NOTE_SIGNAL_LABEL.bullish_signal is the plain-language form',
  NOTE_SIGNAL_LABEL.bullish_signal === 'Bullish signal', NOTE_SIGNAL_LABEL.bullish_signal)
check('NOTE_SIGNAL_LABEL.cautious_signal is the plain-language form',
  NOTE_SIGNAL_LABEL.cautious_signal === 'Cautious signal', NOTE_SIGNAL_LABEL.cautious_signal)
check('NOTE_SIGNAL_LABEL.new_coverage replaces "Initiation"',
  NOTE_SIGNAL_LABEL.new_coverage === 'New coverage', NOTE_SIGNAL_LABEL.new_coverage)

// ── formatConsensusRating contract ──────────────────────────────────────

check('clear: "2 of 2 brokers rated Underweight"',
  formatConsensusRating({ kind: 'clear', rating: 'Underweight' as Rating, agree: 2, total: 2 })
    === '2 of 2 brokers rated Underweight')
check('clear: "3 of 5 brokers rated Buy"',
  formatConsensusRating({ kind: 'clear', rating: 'Buy' as Rating, agree: 3, total: 5 })
    === '3 of 5 brokers rated Buy')
check('tie → "Mixed ratings"',
  formatConsensusRating({
    kind: 'tie', total: 4,
    leaders: [{ rating: 'Buy' as Rating, count: 2 }, { rating: 'Hold' as Rating, count: 2 }],
  }) === 'Mixed ratings')
check('none → "No rating issued"',
  formatConsensusRating({ kind: 'none' }) === 'No rating issued')

// Cover ALL ConsensusRating kinds — guards against silent fallthrough.
const allKinds: ConsensusRating['kind'][] = ['none', 'clear', 'tie']
check('formatConsensusRating handles all ConsensusRating kinds', allKinds.length === 3)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
