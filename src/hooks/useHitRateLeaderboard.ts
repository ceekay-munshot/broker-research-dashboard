import { useMemo } from 'react'
import type { Broker, CalibrationSnapshot } from '../domain'
import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import {
  buildHitRateLeaderboard, type HitRateLeaderboardViewModel,
} from '../viewModels/hitRate'

// Loads the analyst-accuracy leaderboard: the latest calibration snapshot
// joined with the broker catalog (for brand colours). The snapshot fetch
// swallows errors to null so a feed without calibration data degrades to the
// empty-state message rather than erroring the whole tab.
export function useHitRateLeaderboard(): QueryResult<HitRateLeaderboardViewModel> {
  const snap = useAdapterQuery<CalibrationSnapshot | null>(
    async (a, s) => {
      try { return await a.getCalibrationSnapshot(s) }
      catch { return null }
    },
    [],
  )
  const brokers = useAdapterQuery<readonly Broker[]>((a, s) => a.listBrokers(s), [])

  const data = useMemo<HitRateLeaderboardViewModel | null>(() => {
    if (snap.loading || brokers.loading) return null
    return buildHitRateLeaderboard({ snapshot: snap.data ?? null, brokers: brokers.data ?? [] })
  }, [snap.data, snap.loading, brokers.data, brokers.loading])

  if (brokers.error) return { data: null, loading: false, error: brokers.error }
  if (!data)         return { data: null, loading: true, error: null }
  return { data, loading: false, error: null }
}
