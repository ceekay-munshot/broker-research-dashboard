// Compute deterministic expectation delta over a monitoring window.
//
// Given a current snapshot + the canonical research/alerts feed, look
// back `window` days from the current snapshot's `asOf` and summarize
// how the Street moved into the event:
//  - net stance shift
//  - mean target Δ%
//  - opinion update count + upgrades / downgrades
//  - divergence shift
//  - against-position alert count
//  - new outlier emergence
//  - coverage intensity delta

import type {
  AlertEvent, BrokerStockOpinion, ResearchReport, ReportSummary,
  CatalystEvent, EventExpectationDelta, EventMonitoringWindow,
  ExpectationDeltaSign, ExpectationSnapshot,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

const DAY_MS = 86400e3
const WINDOW_DAYS: Record<EventMonitoringWindow, number> = {
  '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30,
}

const RATING_RANK: Readonly<Record<string, number>> = {
  Sell: 1, Underweight: 2, Hold: 3, 'Not Rated': 3, Overweight: 4, Buy: 5,
}

export interface BuildDeltaInputs {
  readonly catalyst: CatalystEvent
  readonly currentSnapshot: ExpectationSnapshot
  readonly window: EventMonitoringWindow
  readonly priorSnapshot: ExpectationSnapshot | null
  readonly opinions: readonly BrokerStockOpinion[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly alerts: readonly AlertEvent[]
  readonly closures: readonly ConflictClosure[]
}

export function buildExpectationDelta(inputs: BuildDeltaInputs): EventExpectationDelta {
  const ticker = inputs.catalyst.ticker
  const now = new Date(inputs.currentSnapshot.asOf)
  const cutoff = now.getTime() - WINDOW_DAYS[inputs.window] * DAY_MS

  // Reports + summaries on this ticker within window.
  const summaryByReport = new Map(inputs.summaries.map((s) => [s.reportId as string, s]))
  const tickerReports = inputs.reports
    .filter((r) => r.tickers.some((t) => (t as string) === (ticker as string)))
    .filter((r) => Date.parse(r.receivedAt) >= cutoff && Date.parse(r.receivedAt) <= now.getTime())
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

  // Opinion updates in window: distinct (broker, lastUpdatedAt) within window.
  const tickerOpinionUpdates = inputs.opinions.filter((o) =>
    o.ticker === ticker && Date.parse(o.lastUpdatedAt) >= cutoff && Date.parse(o.lastUpdatedAt) <= now.getTime(),
  )

  // Rating up/down via summaries with prior rating context (best effort).
  let upgrades = 0, downgrades = 0
  for (const r of tickerReports) {
    const sum = summaryByReport.get(r.id as string)
    if (!sum?.rating) continue
    const prior = inputs.opinions.find((o) => o.brokerId === r.brokerId && o.ticker === ticker)
    if (!prior?.rating) continue
    const a = RATING_RANK[prior.rating] ?? 3
    const b = RATING_RANK[sum.rating] ?? 3
    if (b > a) upgrades += 1
    else if (b < a) downgrades += 1
  }

  // Mean target change %.
  const targetChanges: number[] = []
  for (const r of tickerReports) {
    const sum = summaryByReport.get(r.id as string)
    if (!sum) continue
    if (sum.targetPrice === null || sum.priorTargetPrice === null) continue
    if (sum.priorTargetPrice === 0) continue
    targetChanges.push(((sum.targetPrice - sum.priorTargetPrice) / sum.priorTargetPrice) * 100)
  }
  const meanTargetChangePct = targetChanges.length === 0
    ? null
    : Math.round((targetChanges.reduce((s, x) => s + x, 0) / targetChanges.length) * 10) / 10

  // Stance shift: prior snapshot stance mix vs current.
  let stanceShift: ExpectationDeltaSign = 'flat'
  if (inputs.priorSnapshot) {
    const prior = inputs.priorSnapshot.stanceMix
    const cur = inputs.currentSnapshot.stanceMix
    const priorTotal = Math.max(1, prior.bullish + prior.neutral + prior.bearish)
    const curTotal   = Math.max(1, cur.bullish + cur.neutral + cur.bearish)
    const priorBullPct = (prior.bullish / priorTotal) * 100
    const curBullPct = (cur.bullish / curTotal) * 100
    const priorBearPct = (prior.bearish / priorTotal) * 100
    const curBearPct = (cur.bearish / curTotal) * 100
    const bullShift = curBullPct - priorBullPct
    const bearShift = curBearPct - priorBearPct
    if (bullShift >= 8 && bearShift <= -3) stanceShift = 'more_bullish'
    else if (bearShift >= 8 && bullShift <= -3) stanceShift = 'more_cautious'
    else if (Math.abs(bullShift) >= 5 && Math.abs(bearShift) >= 5) stanceShift = 'mixed'
    else stanceShift = 'flat'
  } else if (upgrades > downgrades + 1) {
    stanceShift = 'more_bullish'
  } else if (downgrades > upgrades + 1) {
    stanceShift = 'more_cautious'
  }

  // Divergence shift.
  let divergenceShift: 'widened' | 'narrowed' | 'unchanged' = 'unchanged'
  if (inputs.priorSnapshot) {
    const priorDiv = inputs.priorSnapshot.hasDivergence
    const curDiv = inputs.currentSnapshot.hasDivergence
    if (!priorDiv && curDiv) divergenceShift = 'widened'
    else if (priorDiv && !curDiv) divergenceShift = 'narrowed'
  }

  // Against-position alerts in window.
  const againstPositionAlerts = inputs.alerts.filter((a) =>
    !a.suppressed && a.kind === 'against_position' && a.lineage.ticker === ticker
    && Date.parse(a.generatedAt) >= cutoff && Date.parse(a.generatedAt) <= now.getTime(),
  ).length

  // Outlier emergence: outliers in current closure that were not in prior.
  let outlierEmergence = 0
  const closure = inputs.closures.find((c) => c.ticker === ticker) ?? null
  if (closure) {
    if (inputs.priorSnapshot) {
      // Heuristic: prior snapshot didn't carry outlier set; treat all
      // current outliers as emerged when prior had no divergence.
      outlierEmergence = inputs.priorSnapshot.hasDivergence ? 0 : closure.outliers.length
    } else {
      outlierEmergence = closure.outliers.length
    }
  }

  // Coverage intensity delta: distinct brokers in window vs prior snapshot's count.
  const distinctNow = new Set(tickerReports.map((r) => r.brokerId as string)).size
  const distinctPrior = inputs.priorSnapshot?.distinctBrokers ?? 0
  const coverageIntensityDelta = distinctNow - distinctPrior

  // Reasons.
  const reasons: { code: string; text: string }[] = []
  if (meanTargetChangePct !== null && Math.abs(meanTargetChangePct) >= 1) {
    reasons.push({
      code: 'mean_target_change',
      text: `Mean target ${meanTargetChangePct >= 0 ? '+' : ''}${meanTargetChangePct.toFixed(1)}% across ${tickerOpinionUpdates.length} updates.`,
    })
  }
  if (upgrades > 0 || downgrades > 0) {
    reasons.push({
      code: 'rating_moves',
      text: `${upgrades} upgrade${upgrades === 1 ? '' : 's'} / ${downgrades} downgrade${downgrades === 1 ? '' : 's'} in ${inputs.window}.`,
    })
  }
  if (againstPositionAlerts > 0) {
    reasons.push({
      code: 'against_pressure',
      text: `${againstPositionAlerts} against-position alert${againstPositionAlerts === 1 ? '' : 's'} in ${inputs.window}.`,
    })
  }
  if (divergenceShift !== 'unchanged') {
    reasons.push({ code: 'divergence_shift', text: `Divergence ${divergenceShift}.` })
  }
  if (outlierEmergence > 0) {
    reasons.push({ code: 'outliers_emerged', text: `${outlierEmergence} outlier${outlierEmergence === 1 ? '' : 's'} active.` })
  }
  if (coverageIntensityDelta > 0) {
    reasons.push({ code: 'coverage_up', text: `Coverage breadth +${coverageIntensityDelta} brokers in ${inputs.window}.` })
  } else if (coverageIntensityDelta < 0) {
    reasons.push({ code: 'coverage_down', text: `Coverage breadth ${coverageIntensityDelta} brokers in ${inputs.window}.` })
  }

  return {
    catalystId: inputs.catalyst.id,
    window: inputs.window,
    priorAsOf: inputs.priorSnapshot?.asOf ?? new Date(cutoff).toISOString(),
    currentAsOf: inputs.currentSnapshot.asOf,
    stanceShift,
    meanTargetChangePct,
    opinionUpdates: tickerOpinionUpdates.length,
    ratingDowngrades: downgrades,
    ratingUpgrades: upgrades,
    divergenceShift,
    againstPositionAlerts,
    outlierEmergence,
    coverageIntensityDelta,
    reasons,
  }
}
