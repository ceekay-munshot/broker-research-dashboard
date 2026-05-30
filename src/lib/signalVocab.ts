// ─────────────────────────────────────────────────────────────────────────
// Research-signal vocabulary — UI labels and copy only.
//
// Single source of truth for the user-facing strings the dashboard renders
// for engine-derived states, disagreement bands, note signals, and consensus
// summaries. Lives BELOW the viewmodels and renderers in the import graph;
// imports only from `domain/signal` and `engine/types`. Never imports from
// `viewModels/*`, `semanticColor.ts`, or the extractor.
//
// Two sibling modules complete the layering:
//   • `signalPolicy.ts` owns the decision logic (non-duplication rule,
//     legacy mapper). Returns enums; never strings.
//   • `semanticColor.ts` owns the Tailwind class strings keyed by tone.
//
// If a label needs to change, change it here once and every surface picks
// it up. If a class needs to change, change it in `semanticColor.ts`.
// ─────────────────────────────────────────────────────────────────────────

import type { ResultantState, StrengthBand } from '../engine/types'
import type {
  ArbBand, NoteSignalKind, NoteSignalSource, ConsensusRating,
} from '../domain/signal'
import type { ReportType } from '../domain/report'

// ── Report type ───────────────────────────────────────────────────────────
// Plain-language label per report type — the single source the drawer chip and
// the sidebar "Report Type" filter both read. REPORT_TYPE_FILTER_ORDER is the
// subset shown as filter chips (the headline kinds an analyst sorts by),
// newest-/most-actionable first.

export const REPORT_TYPE_LABEL: Readonly<Record<ReportType, string>> = {
  flash:              'Flash note',
  earnings_review:    'Earnings update',
  earnings_preview:   'Pre-results review',
  management_meeting: 'Management meeting',
  field_visit:        'Field visit',
  initiation:         'Initiation',
  update:             'Update',
  morning_note:       'Morning note',
  sector_note:        'Sector note',
  deep_dive:          'Deep dive',
  other:              'Research note',
}

/** The report types offered as sidebar filter chips, in display order. */
export const REPORT_TYPE_FILTER_ORDER: readonly ReportType[] = [
  'flash', 'earnings_review', 'earnings_preview',
  'management_meeting', 'field_visit', 'initiation', 'update',
]

// ── Street view (resultant state) ────────────────────────────────────────
// One canonical wording per state. Replaces the three drifted maps that
// used to live in viewModels/arb.ts, components/views/ByStock.tsx,
// components/disagreements/shared.tsx, and components/StockDrawer.tsx.

export const RESULTANT_STATE_LABEL: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:  'Bullish consensus',
  consensus_bearish:  'Bearish consensus',
  mixed_constructive: 'Mixed · bullish tilt',
  mixed_cautious:     'Mixed · bearish tilt',
  unresolved:         'No clear consensus',
  outlier_driven:     'Outlier-driven',
}

/** Plain-language template for the small subtext under a state badge.
 *  `{n}` and `{total}` are placeholders the renderer fills in. */
export const RESULTANT_STATE_SUBTEXT_TEMPLATE: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:  '{n}/{total} bullish',
  consensus_bearish:  '{n}/{total} bearish',
  mixed_constructive: '{n}/{total} bullish',
  mixed_cautious:     '{n}/{total} bearish',
  unresolved:         'Brokers split',
  outlier_driven:     '1 outlier moves the average',
}

export const STRENGTH_LABEL: Readonly<Record<StrengthBand, string>> = {
  strong:   'STRONG',
  moderate: 'MODERATE',
  weak:     'WEAK',
}

// ── Disagreement (ARB) ──────────────────────────────────────────────────
// De-jargonized. The internal "ARB" name stays on the engine side; what the
// user reads is plain language. Tone mapping (green/amber/red/grey) is in
// semanticColor.ts via getArbTone() — unchanged.

export const ARB_LABEL: Readonly<Record<ArbBand, string>> = {
  none:     'Only 1 broker covers this',
  low:      'Tight agreement',
  moderate: 'Some disagreement',
  high:     'Wide disagreement',
}

// ── Note signal ──────────────────────────────────────────────────────────
// Display-only chip wording. The extractor returns the enum kind; this map
// renders the user-facing text. The non-duplication rule (don't render
// "Bullish signal" alongside a formal "Buy") lives in signalPolicy.ts.

export const NOTE_SIGNAL_LABEL: Readonly<Record<NoteSignalKind, string>> = {
  bullish_signal:  'Bullish signal',
  cautious_signal: 'Cautious signal',
  bearish_signal:  'Bearish signal',
  upgrade:         'Upgrade',
  downgrade:       'Downgrade',
  new_coverage:    'New coverage',
}

/** One-line plain-language explanation rendered below a Note signal chip in
 *  the Report drawer. Tells the analyst *why* this signal fired. */
export const NOTE_SIGNAL_SOURCE_BLURB: Readonly<Record<NoteSignalSource, string>> = {
  formal_rating: "From the broker's formal rating",
  title:         "Inferred from the note's title",
  body:          'From upgrade/downgrade language in the body',
  report_type:   'From the report being an initiation',
}

// ── Consensus rating formatter ───────────────────────────────────────────
// Unified across Overview, By Stock, Stock Drawer, Report Drawer. Plain
// language ("2 of 2 brokers rated Underweight") instead of the older
// "Unanimous Underweight" phrasing.

export function formatConsensusRating(cr: ConsensusRating): string {
  if (cr.kind === 'none') return 'No rating issued'
  if (cr.kind === 'tie')  return 'Mixed ratings'
  return `${cr.agree} of ${cr.total} brokers rated ${cr.rating}`
}
