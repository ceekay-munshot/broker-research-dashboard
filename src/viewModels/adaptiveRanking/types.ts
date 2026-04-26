// Shared shapes used by surfaces that consume the adaptive ranking
// engine. Every surface that participates in compare mode tags each
// item with an `AdaptiveAnnotation` so the UI can render the chip
// uniformly.

import type { RankAdjustment } from '../../engine'

export interface AdaptiveAnnotation {
  /** The full adjustment record (baseline + adjusted + reasons + suppressions). */
  readonly adjustment: RankAdjustment
  /** Rank delta vs baseline ordering — positive = moved up the list. */
  readonly rankDelta: number
  /** Whether the adjustment actually moved this item (delta != 0). */
  readonly moved: boolean
}
