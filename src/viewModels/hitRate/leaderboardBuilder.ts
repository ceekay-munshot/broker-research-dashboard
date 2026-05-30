// Builds the Hit Rate leaderboard from a CalibrationSnapshot. Pure data
// transform — no React, no side effects — so it's trivially testable and
// works identically whether the snapshot came from the live feed or mocks.

import type { Broker, CalibrationSnapshot } from '../../domain'
import { indexBy } from '../shared'
import type { AnalystHitRateRow, HitRateLeaderboardViewModel } from './types'

export interface BuildHitRateLeaderboardInputs {
  readonly snapshot: CalibrationSnapshot | null
  readonly brokers: readonly Broker[]
}

const EMPTY_MESSAGE =
  'No track record yet — accuracy appears once analysts have enough rated calls with market history behind them.'

export function buildHitRateLeaderboard(
  inp: BuildHitRateLeaderboardInputs,
): HitRateLeaderboardViewModel {
  const snap = inp.snapshot
  if (!snap || snap.brokerCalibrations.length === 0) {
    return { hasData: false, rows: [], emptyMessage: EMPTY_MESSAGE, generatedAt: snap?.generatedAt ?? null }
  }

  // Join the brand colour from the broker catalog so the leaderboard glyphs
  // match the broker identity used everywhere else.
  const brokerById = indexBy(inp.brokers, (b) => b.id as unknown as string)

  const rows: AnalystHitRateRow[] = snap.brokerCalibrations
    .filter((b) => b.sampleSize > 0)
    .map((b) => ({
      brokerId: b.brokerId,
      shortName: b.brokerShortName,
      color: brokerById.get(b.brokerId as unknown as string)?.brandColor ?? null,
      hitRate: b.hitRate,
      sampleSize: b.sampleSize,
      meanReturnPct: b.meanReturnPct,
      confidence: b.confidence,
      longHitRate: b.longHitRate,
      shortHitRate: b.shortHitRate,
    }))

  // Most accurate first. A null hit rate (no directional calls) sorts last;
  // ties break on sample size so the better-evidenced analyst ranks higher.
  rows.sort((a, b) => {
    const ah = a.hitRate ?? -1
    const bh = b.hitRate ?? -1
    if (bh !== ah) return bh - ah
    return b.sampleSize - a.sampleSize
  })

  return {
    hasData: rows.length > 0,
    rows,
    emptyMessage: rows.length === 0 ? EMPTY_MESSAGE : null,
    generatedAt: snap.generatedAt,
  }
}
