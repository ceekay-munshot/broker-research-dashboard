// ─────────────────────────────────────────────────────────────────────────
// Research-signal type contract.
//
// One neutral place for the union types that the UI vocab module
// (`src/lib/signalVocab.ts`), the decision module (`src/lib/signalPolicy.ts`),
// the extractor (`src/adapters/serverOutput/noteInsight.ts`), the transform,
// the viewmodels and the renderers all share. Keeping these here breaks the
// would-be import cycle between viewModels/arb.ts and signalVocab.ts and
// makes the formal/inferred split a domain-level concern instead of a UI
// one.
//
// IMPORTANT: this file MUST NOT import from anything app-specific (no
// adapters, no viewmodels, no UI). Pure types only.
// ─────────────────────────────────────────────────────────────────────────

import type { Rating } from './common'

// ── Note Signal ──────────────────────────────────────────────────────────
// "Note Signal" is the inferred, display-only sentiment of a single broker
// note. NEVER a formal broker opinion. The opinion-accumulation path stays
// gated on NER rating/TP; this taxonomy is render-side only.

export type NoteSignalKind =
  | 'bullish_signal'
  | 'cautious_signal'
  | 'bearish_signal'
  | 'upgrade'
  | 'downgrade'
  | 'new_coverage'

export type NoteSignalSource =
  | 'formal_rating'   // mirror of an NER rating (rarely surfaced — see non-dup rule)
  | 'title'           // standalone rating word at end of subject
  | 'body'            // upgrade/downgrade language in prose
  | 'report_type'     // reportType === 'initiation' → 'new_coverage'

// ── ARB band ─────────────────────────────────────────────────────────────
// MOVED here from src/viewModels/arb.ts so that the UI vocab module
// (signalVocab.ts) can name the band without importing from the viewmodels
// layer. The engine and the renderers both refer to the same neutral type.

/** `none` = a single broker — nothing to compare, never a disagreement. */
export type ArbBand = 'none' | 'low' | 'moderate' | 'high'

// ── Consensus rating ─────────────────────────────────────────────────────
// MOVED here from src/viewModels/arb.ts for the same reason: the UI vocab
// module needs to format a ConsensusRating. Placing the type here keeps the
// dependency arrow signalVocab → domain (not signalVocab → viewModels).
//
// A tie is reported as a tie — never collapsed into a fake winner. A fake
// consensus on a tie would hide the disagreement the Disagreements page
// exists to surface.

export type ConsensusRating =
  | { readonly kind: 'none' }
  | { readonly kind: 'clear'; readonly rating: Rating; readonly agree: number; readonly total: number }
  | {
      readonly kind: 'tie'
      readonly total: number
      readonly leaders: readonly { readonly rating: Rating; readonly count: number }[]
    }
