// Bootstrap helper: adapt a HybridCanonicalStore + market provider to
// the calibration engine. Used by the server boot path and the CLI.

import type { OrgId, CalibrationSnapshot } from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { brokers as catalogBrokers } from '../config/organizations'
import { stocks as catalogStocks } from '../../../src/mocks/stocks'
import { portfolioSnapshots } from '../../../src/mocks/portfolios'
import { runCalibration } from './run'
import { FixtureMarketDataProvider } from './marketProvider'

export interface OrgCalibrationSummary {
  readonly orgId: OrgId
  readonly events: number
  readonly outcomes: number
  readonly brokers: number
  readonly alertKinds: number
}

/** Run calibration for every configured org. Persists snapshots into
 *  the store (which dual-writes to the Repo). */
export async function runCalibrationForStore(
  store: HybridCanonicalStore,
  orgIds: readonly OrgId[],
  source: CalibrationSnapshot['source'],
  now: Date = new Date(),
): Promise<readonly OrgCalibrationSummary[]> {
  const market = new FixtureMarketDataProvider()
  const summaries: OrgCalibrationSummary[] = []
  for (const orgId of orgIds) {
    const reports = store.listReports(orgId)
    const summariesArr = store.listSummaries(orgId)
    const opinions = store.listOpinions(orgId)
    const alerts = store.listAlerts(orgId, { includeSuppressed: false })
    const stocks = catalogStocks
    const brokers = catalogBrokers
    const snapshot = portfolioSnapshots.find((p) => p.orgId === orgId) ?? null

    const result = await runCalibration({
      orgId,
      snapshot,
      reports,
      summaries: summariesArr,
      opinions,
      alerts,
      stocks,
      brokers,
      market,
      now,
    }, {
      upsertSnapshot: (snap) => store.upsertCalibrationSnapshot(snap),
    }, source)

    summaries.push({
      orgId,
      events: result.events.length,
      outcomes: result.outcomes.length,
      brokers: result.brokers.filter((b) => b.sampleSize > 0).length,
      alertKinds: result.alerts.filter((a) => a.sampleSize > 0).length,
    })
  }
  return summaries
}
