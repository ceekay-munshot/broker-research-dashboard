// Barrel for every mock fixture. This is the only module the
// MockResearchAdapter imports from; treating it as a single data source keeps
// the adapter's filter logic easy to read.
//
// The hand-written fixtures (a tightly-tuned April slice) are MERGED with the
// generated ~6-month history in `./generated.ts` so every dashboard surface —
// date-range filters, the "new today" card, per-broker timelines, multi-broker
// consensus/disagreement, upgrades/downgrades — has enough data to study.
//
//   • reports / summaries / emails / attachments / evidence: appended (many
//     notes per broker-ticker is exactly the timeline we want).
//   • opinions: the "latest call per (broker,ticker)" projection MUST stay
//     unique per pair, or the closure engine double-counts a broker — so we
//     merge then keep the newest lastUpdatedAt per (org,broker,ticker).

import { reports as handReports } from './reports'
import { summaries as handSummaries } from './summaries'
import { brokerEmails as handEmails } from './emails'
import { attachments as handAttachments } from './attachments'
import { evidenceSnippets as handEvidence } from './evidenceSnippets'
import { brokerStockOpinions as handOpinions } from './opinions'
import { GENERATED } from './generated'
import type { BrokerStockOpinion } from '../domain'

export { organizations, DEFAULT_ORG_ID, SECONDARY_ORG_ID } from './organizations'
export { users, DEFAULT_USER_ID } from './users'
export { brokers } from './brokers'
export { sectors } from './sectors'
export { stocks } from './stocks'

// ── Merged time-series fixtures (hand-written + generated) ──────────────────
export const reports = [...handReports, ...GENERATED.reports]
export const summaries = [...handSummaries, ...GENERATED.summaries]
export const brokerEmails = [...handEmails, ...GENERATED.emails]
export const attachments = [...handAttachments, ...GENERATED.attachments]
export const evidenceSnippets = [...handEvidence, ...GENERATED.evidence]

// Opinions: dedupe by (orgId, brokerId, ticker), newest lastUpdatedAt wins.
// Generated rows are relative-to-now, so they supersede the fixed-date
// hand-written rows for any overlapping pair.
export const brokerStockOpinions: readonly BrokerStockOpinion[] = (() => {
  const byPair = new Map<string, BrokerStockOpinion>()
  for (const o of [...handOpinions, ...GENERATED.opinions]) {
    const key = `${o.orgId as unknown as string}|${o.brokerId as unknown as string}|${o.ticker as unknown as string}`
    const prev = byPair.get(key)
    if (!prev || o.lastUpdatedAt > prev.lastUpdatedAt) byPair.set(key, o)
  }
  return [...byPair.values()]
})()

export { ingestionJobs } from './ingestionJobs'
export { kpiSnapshots, ingestionStatuses } from './kpi'
export { portfolioSnapshots } from './portfolios'
export { alertEvents, alertDigests } from './alerts'
export { calibrationSnapshot } from './calibration'
export { dailyPricePoints, benchmarkSeries } from './marketData'
export { catalystEvents } from './catalysts'
export { preEventBriefs, postEventReviews, expectationSnapshots } from './catalystBriefs'
