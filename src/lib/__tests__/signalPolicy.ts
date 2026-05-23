// Tests for the signal policy module (src/lib/signalPolicy.ts).
// Locks in (a) the non-duplication rule (formal Call suppresses redundant
// Note Signal chips) and (b) the legacy actionLabel back-compat mapper.
// Run: npx tsx src/lib/__tests__/signalPolicy.ts

import type { Rating } from '../../domain'
import {
  resolveDisplayNoteSignal, legacyActionLabelToNoteSignal,
  type NoteSignalInput,
} from '../signalPolicy'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

const bullish: NoteSignalInput = { noteSignalKind: 'bullish_signal', noteSignalSource: 'title' }
const cautious: NoteSignalInput = { noteSignalKind: 'cautious_signal', noteSignalSource: 'title' }
const bearish: NoteSignalInput = { noteSignalKind: 'bearish_signal', noteSignalSource: 'title' }
const upgrade: NoteSignalInput = { noteSignalKind: 'upgrade', noteSignalSource: 'body' }
const downgrade: NoteSignalInput = { noteSignalKind: 'downgrade', noteSignalSource: 'body' }
const newCov: NoteSignalInput = { noteSignalKind: 'new_coverage', noteSignalSource: 'report_type' }

console.log('signalPolicy — non-duplication rule\n')

// ── Suppression: bullish signal vs formal bullish rating ────────────────
check('Bullish signal + formal Buy → suppressed',
  resolveDisplayNoteSignal(bullish, 'Buy' as Rating) === null)
check('Bullish signal + formal Overweight → suppressed',
  resolveDisplayNoteSignal(bullish, 'Overweight' as Rating) === null)
check('Bullish signal + formal Hold → kept (sentiment mismatch)',
  resolveDisplayNoteSignal(bullish, 'Hold' as Rating)?.noteSignalKind === 'bullish_signal')
check('Bullish signal + no formal rating → kept',
  resolveDisplayNoteSignal(bullish, null)?.noteSignalKind === 'bullish_signal')

// ── Suppression: cautious signal vs formal Hold ─────────────────────────
check('Cautious signal + formal Hold → suppressed',
  resolveDisplayNoteSignal(cautious, 'Hold' as Rating) === null)
check('Cautious signal + formal Buy → kept (sentiment mismatch)',
  resolveDisplayNoteSignal(cautious, 'Buy' as Rating)?.noteSignalKind === 'cautious_signal')
check('Cautious signal + no formal rating → kept',
  resolveDisplayNoteSignal(cautious, null)?.noteSignalKind === 'cautious_signal')

// ── Suppression: bearish signal vs formal Sell/Underweight ──────────────
check('Bearish signal + formal Sell → suppressed',
  resolveDisplayNoteSignal(bearish, 'Sell' as Rating) === null)
check('Bearish signal + formal Underweight → suppressed',
  resolveDisplayNoteSignal(bearish, 'Underweight' as Rating) === null)
check('Bearish signal + formal Buy → kept (sentiment mismatch)',
  resolveDisplayNoteSignal(bearish, 'Buy' as Rating)?.noteSignalKind === 'bearish_signal')

// ── Information-adding signals NEVER suppressed ─────────────────────────
// Upgrade / Downgrade / New coverage carry new information beyond the
// rating itself — surface them regardless of the formal call.
check('Upgrade + formal Buy → kept (Upgrade adds info)',
  resolveDisplayNoteSignal(upgrade, 'Buy' as Rating)?.noteSignalKind === 'upgrade')
check('Downgrade + formal Sell → kept (Downgrade adds info)',
  resolveDisplayNoteSignal(downgrade, 'Sell' as Rating)?.noteSignalKind === 'downgrade')
check('New coverage + formal Buy → kept (initiation adds info)',
  resolveDisplayNoteSignal(newCov, 'Buy' as Rating)?.noteSignalKind === 'new_coverage')

// ── Null kind in, null out ──────────────────────────────────────────────
check('null kind → null out',
  resolveDisplayNoteSignal({ noteSignalKind: null, noteSignalSource: null }, 'Buy' as Rating) === null)

// ── Source field is preserved when input is kept ────────────────────────
check('preserved source: title for bullish_signal',
  resolveDisplayNoteSignal(bullish, null)?.noteSignalSource === 'title')
check('preserved source: body for upgrade',
  resolveDisplayNoteSignal(upgrade, 'Buy' as Rating)?.noteSignalSource === 'body')
check('preserved source: report_type for new_coverage',
  resolveDisplayNoteSignal(newCov, null)?.noteSignalSource === 'report_type')

console.log('\nsignalPolicy — legacy actionLabel mapper\n')

// ── Legacy mapping: known strings round-trip into the new vocab ─────────
const buyIdea = legacyActionLabelToNoteSignal('BUY idea')
check('BUY idea → bullish_signal',
  buyIdea?.noteSignalKind === 'bullish_signal' && buyIdea.noteSignalSource === 'title')
const holdMon = legacyActionLabelToNoteSignal('Hold / monitor')
check('Hold / monitor → cautious_signal',
  holdMon?.noteSignalKind === 'cautious_signal' && holdMon.noteSignalSource === 'title')
const upg = legacyActionLabelToNoteSignal('Upgrade')
check('Upgrade → upgrade',
  upg?.noteSignalKind === 'upgrade' && upg.noteSignalSource === 'body')
const dng = legacyActionLabelToNoteSignal('Downgrade')
check('Downgrade → downgrade',
  dng?.noteSignalKind === 'downgrade' && dng.noteSignalSource === 'body')
const init = legacyActionLabelToNoteSignal('Initiation')
check('Initiation → new_coverage',
  init?.noteSignalKind === 'new_coverage' && init.noteSignalSource === 'report_type')

// ── Legacy mapping: dropped vocabulary returns null ─────────────────────
// "Big upside" is handled by the upsideChipPct numeric chip, not as a Note
// Signal. "High-signal note" is dropped entirely — the metric chips are
// the signal of richness. Unknown strings get null too.
check('Big upside → null (handled by upsideChipPct)',
  legacyActionLabelToNoteSignal('Big upside') === null)
check('High-signal note → null (dropped)',
  legacyActionLabelToNoteSignal('High-signal note') === null)
check('unknown string → null',
  legacyActionLabelToNoteSignal('Something weird') === null)
check('null in → null out',
  legacyActionLabelToNoteSignal(null) === null)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
