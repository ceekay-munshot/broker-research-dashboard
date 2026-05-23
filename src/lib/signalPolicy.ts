// ─────────────────────────────────────────────────────────────────────────
// Research-signal policy — decision logic, never display strings.
//
// Two responsibilities, both pure functions:
//   1. The non-duplication rule (`resolveDisplayNoteSignal`): if the broker
//      already issued a formal rating that covers the same sentiment, the
//      Note-signal chip is suppressed — the Rating column says it. The
//      transform applies this at persist time so the stored summary
//      already reflects what the UI will render; the UI re-applies it as
//      defence-in-depth.
//   2. The legacy back-compat mapper (`legacyActionLabelToNoteSignal`):
//      old `ReportSummary` rows on disk carry only the legacy `actionLabel`
//      string ("BUY idea", "Hold / monitor", "Big upside", …). This mapper
//      converts those strings into the new {kind, source} shape so
//      renderers can display the new vocabulary even for unmigrated rows.
//      Renderers MUST route every legacy string through this mapper —
//      never display the raw legacy text.
//
// This file imports only domain types (`Rating`, `NoteSignalKind`,
// `NoteSignalSource`). It must NOT import from `signalVocab.ts` (UI
// strings), `noteInsight.ts` (extractor), or any UI module.
// ─────────────────────────────────────────────────────────────────────────

import type { Rating } from '../domain'
import type { NoteSignalKind, NoteSignalSource } from '../domain/signal'

/** The structural shape both the policy functions and the rendered
 *  `ReportSummary` field set use. Field names mirror `ReportSummary`
 *  exactly so no remapping is needed at any boundary. */
export interface NoteSignalInput {
  readonly noteSignalKind: NoteSignalKind | null
  readonly noteSignalSource: NoteSignalSource | null
}

// ── Non-duplication rule ────────────────────────────────────────────────
// When the broker's formal rating already covers the sentiment of the
// inferred signal, suppress the chip. The Rating column already says it,
// and a chip that echoes the rating is noise. Upgrade/Downgrade/New
// coverage always survive — those add information beyond the rating.

const FORMAL_BULLISH: ReadonlySet<Rating> = new Set<Rating>(['Buy', 'Overweight'])
const FORMAL_CAUTIOUS: ReadonlySet<Rating> = new Set<Rating>(['Hold'])
const FORMAL_BEARISH: ReadonlySet<Rating> = new Set<Rating>(['Sell', 'Underweight'])

/** Returns the input unchanged when the chip should render, or null when
 *  the formal Call already covers it. */
export function resolveDisplayNoteSignal(
  input: NoteSignalInput,
  formalRating: Rating | null,
): NoteSignalInput | null {
  const kind = input.noteSignalKind
  if (kind === null) return null
  if (formalRating === null) return input
  if (kind === 'bullish_signal' && FORMAL_BULLISH.has(formalRating)) return null
  if (kind === 'cautious_signal' && FORMAL_CAUTIOUS.has(formalRating)) return null
  if (kind === 'bearish_signal' && FORMAL_BEARISH.has(formalRating)) return null
  // Upgrade / Downgrade / New coverage carry new information; never suppress.
  return input
}

// ── Legacy action-label mapper ──────────────────────────────────────────
// The ONLY place a renderer should touch a legacy `actionLabel` string.
// 'Big upside' is dropped here because upside is its own dedicated chip
// (`upsideChipPct`). 'High-signal note' is dropped because the metric
// chips themselves communicate that the note is rich.

const LEGACY_MAP: Readonly<Record<string, NoteSignalInput>> = {
  'BUY idea':       { noteSignalKind: 'bullish_signal',  noteSignalSource: 'title' },
  'Hold / monitor': { noteSignalKind: 'cautious_signal', noteSignalSource: 'title' },
  'Upgrade':        { noteSignalKind: 'upgrade',         noteSignalSource: 'body' },
  'Downgrade':      { noteSignalKind: 'downgrade',       noteSignalSource: 'body' },
  'Initiation':     { noteSignalKind: 'new_coverage',    noteSignalSource: 'report_type' },
}

export function legacyActionLabelToNoteSignal(actionLabel: string | null): NoteSignalInput | null {
  if (actionLabel === null) return null
  return LEGACY_MAP[actionLabel] ?? null
}

// ── Composed renderer helper ────────────────────────────────────────────
// The single resolver every consumer should use. Encodes the precedence:
//   1. Prefer the new typed `noteSignalKind` field when present.
//   2. Fall back to the legacy `actionLabel` string via the back-compat
//      mapper (which itself returns enums, never strings).
//   3. RE-APPLY the non-duplication rule against the formal rating.
//
// Step 3 is the defense-in-depth that prevents a suppressed signal from
// being revived through the legacy fallback. The transform also nulls
// `actionLabel` when it suppresses `noteSignalKind`, so for new summaries
// this rule is double-enforced; old summaries on disk that still carry a
// legacy string get the same suppression at render time.

export interface ResolveSummaryNoteSignalInput {
  readonly noteSignalKind: NoteSignalKind | null
  readonly noteSignalSource: NoteSignalSource | null
  readonly actionLabel: string | null
}

export function resolveSummaryNoteSignal(
  input: ResolveSummaryNoteSignalInput,
  formalRating: Rating | null,
): NoteSignalInput | null {
  const candidate: NoteSignalInput | null = input.noteSignalKind !== null
    ? { noteSignalKind: input.noteSignalKind, noteSignalSource: input.noteSignalSource }
    : legacyActionLabelToNoteSignal(input.actionLabel)
  return candidate ? resolveDisplayNoteSignal(candidate, formalRating) : null
}
