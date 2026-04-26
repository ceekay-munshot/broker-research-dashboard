// Build a portfolio-aware catalyst calendar.
//
// Every catalyst gets decorated with the org's portfolio context
// (membership, direction, weight, conviction), an urgency score
// (days-to-event), a priority score (urgency × importance × weight),
// and risk flags drawn from the canonical research + alert + calibration
// state.

import type {
  CatalystCalendarEntry, CatalystEvent, CatalystImportance,
  EventRiskFlag, OrgId, PortfolioMembership,
  PortfolioDirection, PortfolioConviction,
  AlertEvent, BrokerStockOpinion, ResearchReport,
  PortfolioSnapshot, CalibrationSnapshot,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

const DAY_MS = 86400e3

const IMPORTANCE_RANK: Record<CatalystImportance, number> = {
  critical: 100, high: 70, medium: 40, low: 15,
}

const STALE_DAYS_HELD_HC = 7
const STALE_DAYS_HELD = 14
const STALE_DAYS_WATCH = 30
const THIN_COVERAGE_BROKER_COUNT = 2

export interface BuildCalendarInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly catalysts: readonly CatalystEvent[]
  readonly reports: readonly ResearchReport[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly alerts: readonly AlertEvent[]
  readonly calibration: CalibrationSnapshot | null
  readonly now: Date
}

export function buildCatalystCalendar(inputs: BuildCalendarInputs): readonly CatalystCalendarEntry[] {
  const out: CatalystCalendarEntry[] = []
  const reportsByTicker = new Map<string, ResearchReport[]>()
  for (const r of inputs.reports) {
    for (const t of r.tickers) {
      const k = t as string
      const arr = reportsByTicker.get(k) ?? []
      arr.push(r)
      reportsByTicker.set(k, arr)
    }
  }
  for (const arr of reportsByTicker.values()) {
    arr.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }
  const closuresByTicker = new Map<string, ConflictClosure>()
  for (const c of inputs.closures) closuresByTicker.set(c.ticker as string, c)

  const calibrationByBroker = new Map<string, ReturnType<typeof getBrokerScore>>()
  for (const b of inputs.calibration?.brokerCalibrations ?? []) {
    calibrationByBroker.set(b.brokerId as string, getBrokerScore(b))
  }

  for (const c of inputs.catalysts) {
    if (c.orgId !== inputs.orgId) continue
    const tk = c.ticker as string
    const expectedMs = Date.parse(c.expectedAt)
    const daysUntil = Math.round((expectedMs - inputs.now.getTime()) / DAY_MS)
    const ctx = bookContextFor(inputs.snapshot, tk)

    const reports = reportsByTicker.get(tk) ?? []
    const lastReportAt = reports[0]?.receivedAt ?? null
    const daysSinceLast = lastReportAt
      ? Math.floor((inputs.now.getTime() - Date.parse(lastReportAt)) / DAY_MS)
      : Number.POSITIVE_INFINITY
    const recentReports = reports.filter((r) =>
      inputs.now.getTime() - Date.parse(r.receivedAt) <= 14 * DAY_MS,
    )
    const distinctRecentBrokers = new Set(recentReports.map((r) => r.brokerId as string)).size

    const closure = closuresByTicker.get(tk) ?? null
    const tickerAlerts = inputs.alerts.filter((a) =>
      !a.suppressed && a.lineage.ticker === c.ticker,
    )
    const recentAgainst = tickerAlerts.filter((a) =>
      a.kind === 'against_position' &&
      inputs.now.getTime() - Date.parse(a.generatedAt) <= 14 * DAY_MS,
    ).length

    const riskFlags: EventRiskFlag[] = []
    if (distinctRecentBrokers <= THIN_COVERAGE_BROKER_COUNT && (ctx.membership === 'held' || ctx.membership === 'watchlist')) {
      riskFlags.push('thin_coverage')
    }
    const staleThresh = ctx.membership === 'watchlist'
      ? STALE_DAYS_WATCH
      : ctx.conviction === 'high' ? STALE_DAYS_HELD_HC : STALE_DAYS_HELD
    if (daysSinceLast > staleThresh && (ctx.membership === 'held' || ctx.membership === 'watchlist')) {
      riskFlags.push('stale_coverage')
    }
    if (closure && (
      closure.resultant.state === 'mixed_constructive' ||
      closure.resultant.state === 'mixed_cautious' ||
      closure.resultant.state === 'unresolved' ||
      closure.disagreements.length > 0
    )) {
      riskFlags.push('widening_divergence')
    }
    if (closure && closure.outliers.length > 0 && ctx.membership === 'held') {
      const outlierBroker = closure.outliers[0]!.brokerId as string
      const cal = calibrationByBroker.get(outlierBroker)
      if (cal && cal.score >= 25) riskFlags.push('outlier_active')
    }
    if (recentAgainst >= 1 && ctx.membership === 'held') {
      riskFlags.push('against_position_pressure')
    }
    if (ctx.membership === 'held' && daysUntil >= 0 && daysUntil <= 7) {
      // Are top-calibrated brokers silent into the event?
      const topCalBrokers = [...calibrationByBroker.entries()]
        .filter(([_, v]) => v.score >= 30 && v.confidence !== 'very_low' && v.confidence !== 'low')
        .map(([id]) => id)
      const recentCalibrated = recentReports.filter((r) => topCalBrokers.includes(r.brokerId as string))
      if (topCalBrokers.length > 0 && recentCalibrated.length === 0) {
        riskFlags.push('high_calibration_brokers_silent')
      }
    }

    // Urgency: 100 at the event, 0 at 30+ days out, 110 on the day,
    // 80 if overdue (still important to revisit).
    let urgency: number
    if (daysUntil < 0) urgency = 80
    else if (daysUntil <= 0.5) urgency = 110
    else if (daysUntil <= 1) urgency = 100
    else if (daysUntil <= 3) urgency = 90
    else if (daysUntil <= 7) urgency = 70
    else if (daysUntil <= 14) urgency = 50
    else if (daysUntil <= 30) urgency = 30
    else urgency = 10

    const importance = IMPORTANCE_RANK[c.importance]
    const weightFactor = ctx.membership === 'held'
      ? 1 + Math.min(0.5, (ctx.weightPct ?? 0) / 20)  // up to +50% for ~10% weight
      : ctx.membership === 'watchlist'
      ? 0.7
      : ctx.membership === 'adjacent' ? 0.4 : 0.2
    const priority = Math.round(urgency * (importance / 100) * weightFactor * 10) / 10

    const reasons: { code: string; text: string }[] = []
    if (ctx.membership === 'held') {
      reasons.push({
        code: 'pf_held',
        text: `In book · ${ctx.direction ?? 'long'}${ctx.weightPct !== null ? ` · ${ctx.weightPct.toFixed(1)}%` : ''}${ctx.conviction === 'high' ? ' · high conviction' : ''}`,
      })
    } else if (ctx.membership === 'watchlist') {
      reasons.push({ code: 'pf_watchlist', text: 'On watchlist' })
    } else if (ctx.membership === 'adjacent') {
      reasons.push({ code: 'pf_adjacent', text: 'Adjacent sector to book' })
    }
    if (daysUntil >= 0 && daysUntil <= 1) reasons.push({ code: 'imminent', text: 'Within 24h' })
    else if (daysUntil >= 0 && daysUntil <= 7) reasons.push({ code: 'this_week', text: `In ${daysUntil}d` })
    else if (daysUntil < 0) reasons.push({ code: 'overdue', text: `Past expected date by ${Math.abs(daysUntil)}d` })

    out.push({
      catalyst: c,
      membership: ctx.membership,
      direction: ctx.direction,
      conviction: ctx.conviction,
      weightPct: ctx.weightPct,
      daysUntil,
      urgencyScore: urgency,
      priorityScore: priority,
      riskFlags,
      reasons,
    })
  }

  out.sort((a, b) => b.priorityScore - a.priorityScore || a.daysUntil - b.daysUntil)
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────

function bookContextFor(
  snapshot: PortfolioSnapshot | null,
  ticker: string,
): {
  membership: PortfolioMembership
  direction: PortfolioDirection | null
  conviction: PortfolioConviction | null
  weightPct: number | null
} {
  if (!snapshot) return { membership: 'none', direction: null, conviction: null, weightPct: null }
  const pos = snapshot.positions.find((p) => (p.ticker as string) === ticker)
  if (pos) {
    return {
      membership: 'held',
      direction: pos.direction,
      conviction: pos.conviction,
      weightPct: pos.weightPct,
    }
  }
  const watch = snapshot.watchlist.find((w) => (w.ticker as string) === ticker)
  if (watch) return { membership: 'watchlist', direction: null, conviction: null, weightPct: null }
  return { membership: 'none', direction: null, conviction: null, weightPct: null }
}

function getBrokerScore(b: { score: number; confidence: 'very_low' | 'low' | 'medium' | 'high' }): { score: number; confidence: 'very_low' | 'low' | 'medium' | 'high' } {
  return { score: b.score, confidence: b.confidence }
}
