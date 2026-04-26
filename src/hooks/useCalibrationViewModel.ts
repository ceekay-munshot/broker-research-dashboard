import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CalibrationSnapshot, SourcesHealthSnapshot } from '../domain'
import {
  buildCalibrationViewModel, type CalibrationViewModel,
} from '../viewModels/calibration'
import { stalenessDegradationsForKinds } from '../viewModels/sources'

export function useCalibrationViewModel(): QueryResult<CalibrationViewModel> {
  const snap = useAdapterQuery<CalibrationSnapshot | null>(
    async (a, s) => {
      try { return await a.getCalibrationSnapshot(s) }
      catch { return null }
    },
    [],
  )
  const sourcesQ = useAdapterQuery<SourcesHealthSnapshot | null>(
    async (a, s) => { try { return await a.getSourcesHealth(s) } catch { return null } },
    [],
  )
  if (snap.loading) return { data: null, loading: true, error: null }
  if (snap.error)   return { data: null, loading: false, error: snap.error }

  const degradations: string[] = []
  if (!snap.data) degradations.push('No calibration snapshot has been generated yet for this org. Run `npm run ops -- calibration:recompute` to seed one.')
  for (const note of stalenessDegradationsForKinds(sourcesQ.data ?? null, ['market_data'])) {
    degradations.unshift(note)
  }

  const vm = buildCalibrationViewModel({ snapshot: snap.data ?? null, degradations })
  return { data: vm, loading: false, error: null }
}
