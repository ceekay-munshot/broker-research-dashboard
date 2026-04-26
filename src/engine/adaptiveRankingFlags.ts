// ─────────────────────────────────────────────────────────────────────────
// Feature-flag readers for the calibration-aware ranking layer.
//
// Two flags govern the entire layer:
//
//   VITE_CALIBRATION_AWARE_RANKING=1
//     Apply adjusted scoring + adjusted sort order to the high-value
//     surfaces (worklog, my-book, briefing, by-broker, pre-event top
//     reads). When off, the surfaces render with the baseline ranking
//     they had before this module — bit-for-bit unchanged.
//
//   VITE_SHOW_RANKING_COMPARE=1
//     Render the operator/dev compare chip on each adjusted item:
//       "rank ▲2 · cal +5"
//     plus a hover tooltip listing the reason strings.
//
// The compare flag is independent — it can be on with adjustments off
// (in which case every chip reads "rank ▬ · cal 0") and vice versa.
// ─────────────────────────────────────────────────────────────────────────

export interface AdaptiveRankingFlags {
  readonly enabled: boolean
  readonly showCompare: boolean
}

/** Read flags from Vite env. Safe to call at module load. */
export function readAdaptiveRankingFlags(): AdaptiveRankingFlags {
  // import.meta.env is statically replaced by Vite. The cast keeps this
  // file importable from non-Vite contexts (tests, server) where
  // ImportMeta has no `env` property at the type level.
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
    const enabled = env.VITE_CALIBRATION_AWARE_RANKING === '1'
                 || env.VITE_CALIBRATION_AWARE_RANKING === 'true'
    const showCompare = env.VITE_SHOW_RANKING_COMPARE === '1'
                     || env.VITE_SHOW_RANKING_COMPARE === 'true'
    return { enabled, showCompare }
  } catch {
    return { enabled: false, showCompare: false }
  }
}

/** Cached singleton — flags are static for a session. */
let cached: AdaptiveRankingFlags | null = null
export function adaptiveRankingFlags(): AdaptiveRankingFlags {
  if (cached === null) cached = readAdaptiveRankingFlags()
  return cached
}

/** Test-only override. Resets the cache so subsequent reads pick up the change. */
export function __setAdaptiveRankingFlagsForTesting(flags: AdaptiveRankingFlags | null): void {
  cached = flags
}
