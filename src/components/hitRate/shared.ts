// Small presentational helpers shared by the Hit Rate leaderboard + detail.
// Colour is a signal, routed through the central semantic-tone system.

import type { SemanticTone } from '../../lib/semanticColor'

/** A hit rate reads as good (green) / mixed (grey) / poor (red). 55% and 45%
 *  bracket "no better than a coin flip" — the line that matters to an investor. */
export function hitRateTone(hitRate: number | null): SemanticTone {
  if (hitRate === null) return 'neutral'
  if (hitRate >= 0.55) return 'positive'
  if (hitRate < 0.45) return 'negative'
  return 'neutral'
}

/** A 0..1 fraction as a whole-number percentage, or an em dash when null. */
export function formatPct(fraction: number | null): string {
  return fraction === null ? '—' : `${Math.round(fraction * 100)}%`
}
