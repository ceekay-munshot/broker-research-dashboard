// ─────────────────────────────────────────────────────────────────────────
// semanticColor.ts — the dashboard's single source of truth for what a
// colour MEANS.
//
// Colour here is a signal, not decoration. Every place that turns a value
// (a rating, a target-price move, a feed status…) into a colour must go
// through this module so the meaning never drifts:
//
//   positive  → green   bullish / favourable / improving (Buy, Upgrade, TP raise)
//   negative  → red     bearish / unfavourable (Sell, Downgrade, TP cut, miss)
//   neutral   → grey    unchanged / informational / metadata (Hold, Maintain)
//   caution   → amber   mixed / moderate / uncertain / pending / outlier
//   info      → blue    new coverage / informational-but-noteworthy (Initiation)
//   brand     → gold    Munshot brand accent — chrome only (tab underline,
//                       active filters), never a financial-sentiment signal
//
// Two rules this module exists to enforce:
//   • Amber means *caution*, never "bad". A downgrade is RED, not amber.
//   • Brand gold is chrome, never sentiment. A "BUY idea" is GREEN, not gold.
// ─────────────────────────────────────────────────────────────────────────

import type { Rating, Stance } from '../domain'
import type { ResultantState } from '../engine/types'

export type SemanticTone =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'caution'
  | 'info'
  | 'brand'

// ── Tone → Tailwind classes ───────────────────────────────────────────────
// Full literal strings so Tailwind's JIT scanner picks every class up. Never
// build these by concatenation — a partial literal would be tree-shaken away.

/** Inline text colour — a coloured word/number inside running text. */
export const TONE_TEXT_CLASS: Readonly<Record<SemanticTone, string>> = {
  positive: 'text-emerald-400',
  negative: 'text-rose-400',
  neutral:  'text-slate-300',
  caution:  'text-amber-300',
  info:     'text-sky-300',
  brand:    'text-accent',
}

/** Border + text + fill for a chip / badge / pill. */
export const TONE_CHIP_CLASS: Readonly<Record<SemanticTone, string>> = {
  positive: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  negative: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
  neutral:  'border-line/15 text-slate-300 bg-line/[0.03]',
  caution:  'border-amber-500/40 text-amber-300 bg-amber-500/10',
  info:     'border-sky-500/40 text-sky-300 bg-sky-500/10',
  brand:    'border-accent/40 text-accent bg-accent/10',
}

/** Solid fill — dots, meter / severity bars, sparkline strokes. */
export const TONE_SOLID_CLASS: Readonly<Record<SemanticTone, string>> = {
  positive: 'bg-emerald-400',
  negative: 'bg-rose-400',
  neutral:  'bg-slate-500',
  caution:  'bg-amber-400',
  info:     'bg-sky-400',
  brand:    'bg-accent',
}

/** Raw hex — SVG stroke/fill and other contexts that cannot take a class. */
export const TONE_HEX: Readonly<Record<SemanticTone, string>> = {
  positive: '#34d399', // emerald-400
  negative: '#fb7185', // rose-400
  neutral:  '#94a3b8', // slate-400
  caution:  '#fbbf24', // amber-400
  info:     '#38bdf8', // sky-400
  brand:    '#d4af37', // Munshot gold
}

export type ToneVariant = 'text' | 'chip' | 'solid'

/** Resolve a tone to a class string for a given render target. */
export function toneClass(tone: SemanticTone, variant: ToneVariant = 'text'): string {
  if (variant === 'chip') return TONE_CHIP_CLASS[tone]
  if (variant === 'solid') return TONE_SOLID_CLASS[tone]
  return TONE_TEXT_CLASS[tone]
}

// ── Recommendation / rating ───────────────────────────────────────────────
// Buy/Overweight are bullish (green); Underweight/Sell are bearish (red) —
// Underweight was previously coloured amber, which read as mere caution.

const RATING_TONE: Readonly<Record<Rating, SemanticTone>> = {
  'Buy':         'positive',
  'Overweight':  'positive',
  'Hold':        'neutral',
  'Underweight': 'negative',
  'Sell':        'negative',
  'Not Rated':   'neutral',
}

export function getRecommendationTone(rating: Rating): SemanticTone {
  return RATING_TONE[rating]
}

// ── Stance ────────────────────────────────────────────────────────────────

const STANCE_TONE: Readonly<Record<Stance, SemanticTone>> = {
  bullish: 'positive',
  neutral: 'neutral',
  bearish: 'negative',
}

export function getStanceTone(stance: Stance): SemanticTone {
  return STANCE_TONE[stance]
}

// ── Numeric change ────────────────────────────────────────────────────────
// Target-price moves, point deltas, % changes, trend deltas: up is favourable
// (green), down is unfavourable (red), no move / unknown is neutral (grey).

export function getChangeTone(delta: number | null | undefined): SemanticTone {
  if (delta == null || Number.isNaN(delta) || delta === 0) return 'neutral'
  return delta > 0 ? 'positive' : 'negative'
}

// ── Resultant (Street) state ──────────────────────────────────────────────

const RESULTANT_STATE_TONE: Readonly<Record<ResultantState, SemanticTone>> = {
  consensus_bullish:  'positive',
  consensus_bearish:  'negative',
  mixed_constructive: 'positive',
  mixed_cautious:     'negative',
  unresolved:         'neutral',
  outlier_driven:     'caution',
}

export function getResultantStateTone(state: ResultantState): SemanticTone {
  return RESULTANT_STATE_TONE[state]
}

/**
 * Chip classes for the Street-state badge. Defined once here so the four
 * surfaces that render it (By Stock, Street drawer, Sector Feed,
 * Disagreements) can never drift apart. The two `mixed_*` states are
 * deliberately fainter than their full-consensus counterparts — a directional
 * *tilt*, not a settled consensus.
 */
export const RESULTANT_STATE_CHIP_CLASS: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:  'border-emerald-500/50 text-emerald-300 bg-emerald-500/[0.06]',
  consensus_bearish:  'border-rose-500/50 text-rose-300 bg-rose-500/[0.06]',
  mixed_constructive: 'border-emerald-400/30 text-emerald-300 bg-emerald-500/[0.03]',
  mixed_cautious:     'border-rose-400/30 text-rose-300 bg-rose-500/[0.03]',
  unresolved:         'border-slate-400/30 text-slate-300 bg-line/[0.02]',
  outlier_driven:     'border-amber-500/40 text-amber-300 bg-amber-500/[0.04]',
}

// ── ARB band (how much the Street disagrees) ──────────────────────────────
// Tight agreement is reassuring (green); wide disagreement is a risk (red);
// a moderate gap is a caution (amber).

export function getArbTone(band: 'none' | 'low' | 'moderate' | 'high'): SemanticTone {
  switch (band) {
    case 'low':      return 'positive'
    case 'moderate': return 'caution'
    case 'high':     return 'negative'
    case 'none':     return 'neutral'
  }
}

// ── Change significance (broker-memory buckets) ───────────────────────────
// A red→amber→grey severity ramp by magnitude, plus blue for new coverage.
// `major` is red as the top of the *severity* ramp (like a critical alert),
// not a claim that the change itself is bearish.

export function getSignificanceTone(
  bucket: 'major' | 'moderate' | 'minor' | 'first_coverage',
): SemanticTone {
  switch (bucket) {
    case 'major':          return 'negative'
    case 'moderate':       return 'caution'
    case 'first_coverage': return 'info'
    case 'minor':          return 'neutral'
  }
}

// ── Delivery status (Inbox) ───────────────────────────────────────────────

export function getDeliveryStatusTone(
  status: 'sent' | 'failed' | 'suppressed' | 'queued' | 'retrying' | 'skipped' | 'other',
): SemanticTone {
  switch (status) {
    case 'sent':     return 'positive'
    case 'failed':   return 'negative'
    case 'queued':
    case 'retrying': return 'caution' // in-flight / pending
    default:         return 'neutral' // suppressed / skipped / other
  }
}

// ── Feed status (header chip) ─────────────────────────────────────────────

export function getFeedStatusTone(
  tone: 'live' | 'idle' | 'delayed' | 'error' | 'waiting',
): SemanticTone {
  switch (tone) {
    case 'live':    return 'positive'
    case 'delayed': return 'caution'
    case 'error':   return 'negative'
    default:        return 'neutral' // idle / waiting
  }
}

// ── Broker action label (forwarded-note action tag) ───────────────────────
// "Initiation" is new coverage → info (blue); a quality tag like "High-signal
// note" is informational → neutral; everything else is classified by keyword.

export function getActionLabelTone(label: string): SemanticTone {
  const v = label.trim().toLowerCase()
  if (v === '') return 'neutral'
  if (v.includes('initiat')) return 'info'
  if (v.includes('high-signal') || v.includes('high signal')) return 'neutral'
  return getSemanticTone(label)
}

// ── General free-text classifier ──────────────────────────────────────────
// For free-form labels with no typed enum — action tags, rating words, signed
// deltas. Keyword- and sign-based; falls back to neutral when nothing matches.

export function getSemanticTone(value: string): SemanticTone {
  const v = value.trim().toLowerCase()
  if (v === '') return 'neutral'

  // An explicit sign / arrow prefix wins: "+10%", "▲ 5%", "-3%", "▼ 2%".
  const sign = v.match(/^[+\-−▲▼↑↓]/)
  if (sign) {
    const c = sign[0]
    return c === '+' || c === '▲' || c === '↑' ? 'positive' : 'negative'
  }

  // Caution / mixed — checked first so "moderate" / "mixed" win over a stray
  // directional word elsewhere in the same phrase.
  if (/\b(mixed|moderate|watchlist|pending|uncertain|tentative|partial|outlier|disagree\w*|conflict\w*|caution|needs?\s+review|low\s+confidence)\b/.test(v)) {
    return 'caution'
  }

  // Negative / bearish.
  if (/\b(sell|reduce|underperform|underweight|downgrade|de-?rat\w*|miss(?:ed)?|cut|trim|lower(?:ed)?|bear\w*|negative|contraction|decline)\b/.test(v)) {
    return 'negative'
  }

  // Positive / bullish.
  if (/\b(buy|add|accumulate|outperform|overweight|upgrade|raise[sd]?|increase[sd]?|beat|bull\w*|positive|upside|expansion|long)\b/.test(v)) {
    return 'positive'
  }

  // Neutral / unchanged.
  if (/\b(hold|neutral|equal[-\s]?weight|market\s?perform|maintain|unchanged|no\s+change|flat|in[-\s]?line)\b/.test(v)) {
    return 'neutral'
  }

  return 'neutral'
}

// ── Broker identity ───────────────────────────────────────────────────────
// Broker identity must NOT borrow sentiment colours — a red or green broker
// glyph reads as a rating. Brokers are shown with a neutral treatment plus
// their initials / name, never a sentiment hue. (The brand-colour data field
// is left intact; it is simply not used as a sentiment-adjacent indicator.)

/** Neutral square glyph that frames a broker's initials. */
export const BROKER_GLYPH_CLASS = 'bg-line/10 border border-line/10 text-slate-200'

/** Neutral dot marker for a broker in a filter list or table header. */
export const BROKER_DOT_CLASS = 'bg-slate-500'
