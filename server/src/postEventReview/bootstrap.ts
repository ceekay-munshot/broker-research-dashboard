// Bootstrap helper: walk the catalyst calendar, detect catalysts that
// have just completed (within a grace window), pull their pre-event
// snapshot, and emit a fully-populated PostEventReview.
//
// Used by both the server boot path and the CLI.

import type { OrgId, PostEventReview } from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { brokers as catalogBrokers, sectors as catalogSectors } from '../config/organizations'
import { stocks as catalogStocks } from '../../../src/mocks/stocks'
import { buildConflictClosure } from '../../../src/engine'
import { runPostEventReview } from './run'
import { FixtureMarketDataProvider } from '../calibration/marketProvider'

const DAY_MS = 86400e3
const POST_EVENT_REVIEW_GRACE_DAYS = 14

export interface OrgPostEventReviewSummary {
  readonly orgId: OrgId
  readonly attempted: number
  readonly produced: number
  readonly skipped: number
}

export async function runPostEventReviewsForStore(
  store: HybridCanonicalStore,
  orgIds: readonly OrgId[],
  now: Date = new Date(),
): Promise<readonly OrgPostEventReviewSummary[]> {
  const market = new FixtureMarketDataProvider()
  const summaries: OrgPostEventReviewSummary[] = []

  for (const orgId of orgIds) {
    const catalysts = store.listCatalysts(orgId)
    const reports = store.listReports(orgId)
    const summariesArr = store.listSummaries(orgId)
    const opinions = store.listOpinions(orgId)
    const alerts = store.listAlerts(orgId, { includeSuppressed: false })
    const calibration = store.latestCalibrationSnapshot(orgId)
    const stocks = catalogStocks
    const brokers = catalogBrokers
    const sectors = catalogSectors

    let attempted = 0
    let produced = 0
    let skipped = 0

    for (const c of catalysts) {
      const expectedMs = Date.parse(c.expectedAt)
      const ageDays = (now.getTime() - expectedMs) / DAY_MS
      // Reviewable window: event happened in the past, within grace.
      if (ageDays < 0) continue
      if (ageDays > POST_EVENT_REVIEW_GRACE_DAYS) continue
      // Skip cancelled catalysts.
      if (c.status === 'cancelled') continue
      attempted += 1

      // Pull the most recent pre-event snapshot for this catalyst —
      // produced by the catalyst engine before the event.
      const preSnapshots = store.listExpectationSnapshots(orgId, c.id)
      const preSnapshot = preSnapshots[preSnapshots.length - 1]
      if (!preSnapshot) {
        skipped += 1
        continue
      }

      // Pre-event closure: rebuild from opinions whose lastUpdatedAt
      // <= event time. Best-effort: we use the live closure as a proxy
      // when no time-anchored data is available.
      const tickerOpinions = opinions.filter((o) => o.ticker === c.ticker)
      const reportIds = new Set(tickerOpinions.map((o) => o.lastReportId as unknown as string))
      const scopeSummaries = summariesArr.filter((s) => reportIds.has(s.reportId as unknown as string))
      const preClosure = tickerOpinions.length === 0 ? null : buildConflictClosure({
        ticker: c.ticker,
        opinions: tickerOpinions,
        summaries: scopeSummaries,
        evidence: [],
        brokers,
      })

      const closures = preClosure === null ? [] : [preClosure]

      const review: PostEventReview = await runPostEventReview({
        orgId,
        catalyst: c,
        preEventSnapshot: preSnapshot,
        preEventClosure: preClosure,
        opinions,
        reports,
        summaries: summariesArr,
        alerts,
        closures,
        stocks,
        sectors,
        brokers,
        calibration,
        market,
        now,
      }, {
        upsertReview: (r) => store.upsertPostEventReview(r),
      })
      void review
      produced += 1
    }
    summaries.push({ orgId, attempted, produced, skipped })
  }
  return summaries
}
