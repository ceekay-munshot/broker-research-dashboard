// Orchestrator for the catalyst engine.
//
// Steps:
//   1. Build the portfolio-aware calendar.
//   2. For each non-completed catalyst, take an expectation snapshot.
//   3. For each catalyst, compute 7d / 30d expectation deltas.
//   4. For each "actionable" catalyst (next 30d, held/watchlist),
//      build a deterministic pre-event brief.
//   5. For just-completed catalysts within a small grace window,
//      stub a post-event review.
//   6. Persist everything via the supplied `CatalystPersistence`.

import type {
  CatalystCalendarEntry, EventExpectationDelta,
  EventMonitoringWindow, ExpectationSnapshot, PostEventReview,
  PreEventBrief, EventRiskFlag,
} from '../../../src/domain'
import { EVENT_MONITORING_WINDOWS } from '../../../src/domain'
import { buildCatalystCalendar } from './calendar'
import { buildExpectationSnapshot } from './expectations'
import { buildExpectationDelta } from './delta'
import { buildPreEventBrief } from './brief'
import { buildPostEventReviewStub } from './review'
import type {
  CatalystEngineInputs, CatalystPersistence, CatalystRunResult,
} from './types'

const DAY_MS = 86400e3
const ACTIONABLE_DAYS = 30
const POST_EVENT_GRACE_DAYS = 3

export async function runCatalysts(
  inputs: CatalystEngineInputs,
  persistence: CatalystPersistence,
): Promise<CatalystRunResult> {
  // 1. Calendar.
  const calendar: readonly CatalystCalendarEntry[] = buildCatalystCalendar({
    orgId: inputs.orgId,
    snapshot: inputs.snapshot,
    catalysts: inputs.catalysts,
    reports: inputs.reports,
    opinions: inputs.opinions,
    closures: inputs.closures,
    alerts: inputs.alerts,
    calibration: inputs.calibration,
    now: inputs.now,
  })

  // Persist every catalyst we touched (idempotent).
  for (const e of inputs.catalysts) {
    if (e.orgId === inputs.orgId) persistence.upsertCatalyst(e)
  }

  // 2. Snapshot per non-completed catalyst, indexed by catalystId.
  const snapshots: ExpectationSnapshot[] = []
  const snapshotByCatalyst = new Map<string, ExpectationSnapshot>()
  for (const entry of calendar) {
    if (entry.catalyst.status === 'completed' || entry.catalyst.status === 'cancelled') continue
    const snap = buildExpectationSnapshot({
      orgId: inputs.orgId,
      catalyst: entry.catalyst,
      opinions: inputs.opinions,
      reports: inputs.reports,
      stocks: inputs.stocks,
      brokers: inputs.brokers,
      closures: inputs.closures,
      calibration: inputs.calibration,
      now: inputs.now,
    })
    snapshots.push(snap)
    snapshotByCatalyst.set(entry.catalyst.id as unknown as string, snap)
    persistence.upsertSnapshot(snap)
  }

  // 3. Deltas per catalyst per window.
  const deltasByCatalyst = new Map<string, EventExpectationDelta[]>()
  for (const entry of calendar) {
    const cur = snapshotByCatalyst.get(entry.catalyst.id as unknown as string)
    if (!cur) continue
    const out: EventExpectationDelta[] = []
    for (const window of EVENT_MONITORING_WINDOWS) {
      // Look up a prior snapshot for the catalyst around (now - window).
      const targetMs = inputs.now.getTime() - WINDOW_MS_FOR(window)
      const prior = persistence.priorSnapshot
        ? persistence.priorSnapshot(inputs.orgId, entry.catalyst.id as unknown as string, new Date(targetMs))
        : null
      out.push(buildExpectationDelta({
        catalyst: entry.catalyst,
        currentSnapshot: cur,
        window,
        priorSnapshot: prior,
        opinions: inputs.opinions,
        reports: inputs.reports,
        summaries: inputs.summaries,
        alerts: inputs.alerts,
        closures: inputs.closures,
      }))
    }
    deltasByCatalyst.set(entry.catalyst.id as unknown as string, out)
  }

  // 4. Pre-event briefs for actionable catalysts.
  const briefs: PreEventBrief[] = []
  for (const entry of calendar) {
    const isActionable = entry.daysUntil >= 0 && entry.daysUntil <= ACTIONABLE_DAYS
    const inBook = entry.membership === 'held' || entry.membership === 'watchlist'
    if (!isActionable || !inBook) continue
    const cur = snapshotByCatalyst.get(entry.catalyst.id as unknown as string)
    if (!cur) continue
    const deltas = deltasByCatalyst.get(entry.catalyst.id as unknown as string) ?? []
    const delta7d = deltas.find((d) => d.window === '7d') ?? null
    const delta30d = deltas.find((d) => d.window === '30d') ?? null
    const brief = buildPreEventBrief({
      orgId: inputs.orgId,
      catalyst: entry.catalyst,
      snapshot: cur,
      delta7d,
      delta30d,
      portfolio: inputs.snapshot,
      reports: inputs.reports,
      summaries: inputs.summaries,
      opinions: inputs.opinions,
      alerts: inputs.alerts,
      calibration: inputs.calibration,
      riskFlags: entry.riskFlags as readonly EventRiskFlag[],
      now: inputs.now,
    })
    persistence.upsertBrief(brief)
    briefs.push(brief)
  }

  // 5. Post-event review stubs for just-completed catalysts.
  const reviews: PostEventReview[] = []
  for (const entry of calendar) {
    const expectedMs = Date.parse(entry.catalyst.expectedAt)
    const ageDays = (inputs.now.getTime() - expectedMs) / DAY_MS
    if (ageDays >= 0 && ageDays <= POST_EVENT_GRACE_DAYS && entry.catalyst.status !== 'cancelled') {
      const cur = snapshotByCatalyst.get(entry.catalyst.id as unknown as string)
      if (!cur) continue
      const review = buildPostEventReviewStub({
        orgId: inputs.orgId,
        catalyst: entry.catalyst,
        preEventSnapshot: cur,
        now: inputs.now,
      })
      persistence.upsertReview(review)
      reviews.push(review)
    }
  }

  return {
    orgId: inputs.orgId,
    calendar,
    snapshots,
    briefs,
    reviews,
    deltasByCatalyst,
  }
}

function WINDOW_MS_FOR(w: EventMonitoringWindow): number {
  switch (w) {
    case '24h': return 1 * DAY_MS
    case '3d':  return 3 * DAY_MS
    case '7d':  return 7 * DAY_MS
    case '14d': return 14 * DAY_MS
    case '30d': return 30 * DAY_MS
  }
}
