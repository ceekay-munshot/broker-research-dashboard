// Bootstrap helper: collect inputs from the canonical store, build the
// portfolio overlay snapshot from fixtures, and call `runAlerts` for
// every configured org. Used by both the server boot path and the CLI.

import type { OrgId } from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { brokers as catalogBrokers } from '../config/organizations'
import { stocks as catalogStocks } from '../../../src/mocks/stocks'
import { portfolioSnapshots } from '../../../src/mocks/portfolios'
import { buildConflictClosure } from '../../../src/engine'
import { runAlerts, type AlertRunInputs } from './run'
import type { AlertPersistence } from './types'

export interface OrgAlertSummary {
  readonly orgId: OrgId
  readonly emitted: number
  readonly suppressed: number
  readonly digests: number
}

/** Run alert generation against a HybridCanonicalStore for a list of orgs.
 *  Persists alerts/digests/runs into the store (which dual-writes to the
 *  Repo). Returns a per-org summary suitable for log output. */
export async function runAlertsForStore(
  store: HybridCanonicalStore,
  orgIds: readonly OrgId[],
  source: AlertRunInputs['source'],
  now: Date = new Date(),
): Promise<readonly OrgAlertSummary[]> {
  const summaries: OrgAlertSummary[] = []
  for (const orgId of orgIds) {
    const persistence: AlertPersistence = {
      upsertAlert: (a) => store.upsertAlert(a),
      upsertDigest: (d) => store.upsertDigest(d),
      upsertDigestRun: (r) => store.upsertDigestRun(r),
      listRecentAlerts: (id, sinceMs) =>
        store.listAlerts(id, { sinceMs, includeSuppressed: true }),
    }
    const reports = store.listReports(orgId)
    const summariesArr = store.listSummaries(orgId)
    const opinions = store.listOpinions(orgId)
    const stocks = catalogStocks
    const brokers = catalogBrokers
    const snapshot = portfolioSnapshots.find((p) => p.orgId === orgId) ?? null

    // Build closures on demand for tickers with at least one opinion.
    const tickerSet = new Set<string>()
    for (const o of opinions) tickerSet.add(o.ticker as unknown as string)
    const closures = []
    for (const t of tickerSet) {
      const tickerOpinions = opinions.filter((o) => (o.ticker as unknown as string) === t)
      if (tickerOpinions.length === 0) continue
      const reportIds = new Set(tickerOpinions.map((o) => o.lastReportId as unknown as string))
      const scopeSummaries = summariesArr.filter((s) => reportIds.has(s.reportId as unknown as string))
      const scopeEvidence = store.listEvidence(orgId).filter((e) => reportIds.has(e.reportId as unknown as string))
      const closure = buildConflictClosure({
        ticker: t as unknown as Parameters<typeof buildConflictClosure>[0]['ticker'],
        opinions: tickerOpinions,
        summaries: scopeSummaries,
        evidence: scopeEvidence,
        brokers,
      })
      closures.push(closure)
    }

    const result = await runAlerts({
      orgId,
      snapshot,
      reports,
      summaries: summariesArr,
      opinions,
      closures,
      stocks,
      brokers,
      now,
      persistence,
      source,
    })
    summaries.push({
      orgId,
      emitted: result.emitted.length,
      suppressed: result.suppressed.length,
      digests: result.digests.length,
    })
  }
  return summaries
}
