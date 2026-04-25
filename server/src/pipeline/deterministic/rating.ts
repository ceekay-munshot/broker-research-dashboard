import type { Rating, Stance } from '../../../../src/domain'

/** Vocabulary, ordered so explicit single-word ratings beat softer
 *  modifiers. The leading `\b` boundary ensures `Hold` doesn't match
 *  `households`. Action verbs ("Downgrade to Sell") win when present. */
const RATING_VOCAB: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'Not Rated']

/** Detect the primary rating in a text segment. Order of preference:
 *  1. Action phrases ("upgrade to Buy", "downgrade to Sell").
 *  2. First standalone keyword from the vocab.
 *  Returns null + ambiguous=true when conflicting actions are present. */
export function detectRating(text: string): { readonly rating: Rating | null; readonly conflicting: boolean } {
  if (!text) return { rating: null, conflicting: false }
  // Action phrases.
  const actionRe = /\b(?:up(?:graded? to|grade)|down(?:graded? to|grade)|maintain(?:ed)?|reiterat(?:e|ed)|initiate(?:d)? at)\s+(Buy|Overweight|Hold|Underweight|Sell|Not Rated)\b/gi
  const actionHits = [...text.matchAll(actionRe)].map((m) => m[1] as Rating)
  if (actionHits.length > 0) {
    const distinct = new Set(actionHits)
    if (distinct.size === 1) return { rating: actionHits[0]!, conflicting: false }
    return { rating: null, conflicting: true }
  }
  // Standalone keywords.
  for (const r of RATING_VOCAB) {
    if (new RegExp(`\\b${r}\\b`, 'i').test(text)) return { rating: r, conflicting: false }
  }
  return { rating: null, conflicting: false }
}

/** Map rating → stance. Conservative: an unknown / null rating is
 *  `neutral` until something stronger is provided. */
export function stanceFromRating(rating: Rating | null): Stance {
  if (rating === 'Buy' || rating === 'Overweight') return 'bullish'
  if (rating === 'Sell' || rating === 'Underweight') return 'bearish'
  return 'neutral'
}
