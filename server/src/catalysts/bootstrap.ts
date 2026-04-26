// Bootstrap helper: adapt the canonical store to the catalyst engine.
// Used by both the server boot path and the CLI.

import type { OrgId, CatalystEvent, ExpectationSnapshot, PreEventBrief, PostEventReview } from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { brokers as catalogBrokers, sectors as catalogSectors } from '../config/organizations'
import { stocks as catalogStocks } from '../../../src/mocks/stocks'
import { portfolioSnapshots } from '../../../src/mocks/portfolios'
import { buildConflictClosure } from '../../../src/engine'
import { runCatalysts } from './run'
import { FixtureCatalystProvider } from './catalystProvider'

export interface OrgCatalystSummary {
  readonly orgId: OrgId
  readonly calendarSize: number
  readonly snapshots: number
  readonly briefs: number
  readonly reviews: number
}

export async function runCatalystsForStore(
  store: HybridCanonicalStore,
  orgIds: readonly OrgId[],
  now: Date = new Date(),
): Promise<readonly OrgCatalystSummary[]> {
  const provider = new FixtureCatalystProvider()
  const summaries: OrgCatalystSummary[] = []

  for (const orgId of orgIds) {
    const reports = store.listReports(orgId)
    const summariesArr = store.listSummaries(orgId)
    const opinions = store.listOpinions(orgId)
    const alerts = store.listAlerts(orgId, { includeSuppressed: false })
    const portfolio = portfolioSnapshots.find((p) => p.orgId === orgId) ?? null
    const calibration = store.latestCalibrationSnapshot(orgId)
    const stocks = catalogStocks
    const brokers = catalogBrokers
    const sectors = catalogSectors

    // Build closures on-demand for tickers with opinions.
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

    const result = await runCatalysts({
      orgId,
      snapshot: portfolio,
      catalysts: provider.listCatalysts(orgId),
      reports,
      summaries: summariesArr,
      opinions,
      alerts,
      closures,
      stocks,
      brokers,
      sectors,
      calibration,
      now,
    }, {
      upsertCatalyst: (c: CatalystEvent) => store.upsertCatalyst(c),
      upsertSnapshot: (s: ExpectationSnapshot) => store.upsertExpectationSnapshot(s),
      upsertBrief:    (b: PreEventBrief) => store.upsertPreEventBrief(b),
      upsertReview:   (r: PostEventReview) => store.upsertPostEventReview(r),
      priorSnapshot:  (id, catId, atOrBefore) => store.priorExpectationSnapshot(id, catId, atOrBefore),
    })

    summaries.push({
      orgId,
      calendarSize: result.calendar.length,
      snapshots: result.snapshots.length,
      briefs: result.briefs.length,
      reviews: result.reviews.length,
    })
  }
  return summaries
}
