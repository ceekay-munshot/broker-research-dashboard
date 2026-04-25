// ─────────────────────────────────────────────────────────────────────────
// Portfolio coverage / staleness analytics.
//
// Per-position metrics: how recent is the latest broker note? how many
// brokers cover this name? is there an unresolved street disagreement?
// is one of my own active brokers an outlier?
//
// Pure transform. No I/O.
// ─────────────────────────────────────────────────────────────────────────

import type {
  PortfolioCoverageSummary, PositionResearchActivity, PositionRiskFlag,
  PortfolioSnapshot, ResearchReport, BrokerStockOpinion,
  Stock, StockTicker,
} from '../domain'
import type { ConflictClosure } from './types'

export interface PortfolioCoverageInputs {
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly now?: Date
}

const DAY_MS = 86400e3
const STALE_DAYS_HELD = 14
const STALE_DAYS_WATCH = 30
const STALE_DAYS_HIGH_CONVICTION = 7

export interface PortfolioCoverageResult {
  readonly byTicker: ReadonlyMap<string, PortfolioCoverageSummary>
  readonly summaries: readonly PortfolioCoverageSummary[]
}

export function buildPortfolioCoverage(inputs: PortfolioCoverageInputs): PortfolioCoverageResult {
  const now = inputs.now ?? new Date()
  const nowMs = Date.parse(now.toISOString())
  const snap = inputs.snapshot

  const stockByTicker = new Map<string, Stock>()
  for (const s of inputs.stocks) stockByTicker.set(s.ticker as string, s)

  const closureByTicker = new Map<string, ConflictClosure>()
  for (const c of inputs.closures) closureByTicker.set(c.ticker as string, c)

  // Pre-bucket reports per ticker.
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

  const byTicker = new Map<string, PortfolioCoverageSummary>()
  if (!snap) return { byTicker, summaries: [] }

  // Held positions first, then watchlist.
  const tickerToConv: Record<string, 'high' | 'medium' | 'low' | null> = {}
  const tickerToDir: Record<string, 'long' | 'short' | 'hedge' | null> = {}
  const tickerToWeight: Record<string, number | null> = {}
  const tickerToMembership: Record<string, 'held' | 'watchlist'> = {}

  for (const p of snap.positions) {
    const k = p.ticker as string
    tickerToConv[k] = p.conviction
    tickerToDir[k]  = p.direction
    tickerToWeight[k] = p.weightPct
    tickerToMembership[k] = 'held'
  }
  for (const w of snap.watchlist) {
    const k = w.ticker as string
    if (k in tickerToMembership) continue
    tickerToConv[k] = null
    tickerToDir[k]  = null
    tickerToWeight[k] = null
    tickerToMembership[k] = 'watchlist'
  }

  for (const k of Object.keys(tickerToMembership)) {
    const ticker = k as unknown as StockTicker
    const reports = reportsByTicker.get(k) ?? []
    const lastReport = reports[0] ?? null
    const lastAt = lastReport?.receivedAt ?? null
    const daysSinceLast = lastAt !== null
      ? Math.floor((nowMs - Date.parse(lastAt)) / DAY_MS)
      : null

    const reportsLast24h = reports.filter((r) => nowMs - Date.parse(r.receivedAt) <= 1 * DAY_MS).length
    const reportsLast3d  = reports.filter((r) => nowMs - Date.parse(r.receivedAt) <= 3 * DAY_MS).length
    const reportsLast7d  = reports.filter((r) => nowMs - Date.parse(r.receivedAt) <= 7 * DAY_MS).length
    const distinctBrokersLast7d = new Set(
      reports
        .filter((r) => nowMs - Date.parse(r.receivedAt) <= 7 * DAY_MS)
        .map((r) => r.brokerId as string),
    ).size
    const distinctBrokersAllTime = new Set(reports.map((r) => r.brokerId as string)).size

    const closure = closureByTicker.get(k) ?? null
    const hasUnresolvedDivergence = !!closure
      && (closure.disagreements.length > 0
        || closure.resultant.state === 'unresolved'
        || closure.resultant.state === 'mixed_constructive'
        || closure.resultant.state === 'mixed_cautious'
        || closure.resultant.state === 'outlier_driven')
    const hasOutlier = !!closure && closure.outliers.length > 0

    // Risk flags.
    const flags: PositionRiskFlag[] = []
    if (distinctBrokersAllTime === 0) flags.push('no_coverage')
    if (distinctBrokersAllTime === 1) flags.push('single_broker_coverage')

    const conviction = tickerToConv[k]
    const membership = tickerToMembership[k]
    const staleThresh = membership === 'watchlist'
      ? STALE_DAYS_WATCH
      : conviction === 'high' ? STALE_DAYS_HIGH_CONVICTION : STALE_DAYS_HELD
    if (daysSinceLast !== null && daysSinceLast > staleThresh) flags.push('stale_coverage')
    if (daysSinceLast === null) flags.push('stale_coverage')
    if (hasUnresolvedDivergence) flags.push('unresolved_divergence')
    if (hasOutlier) flags.push('broker_outlier')

    // Most-recent target / rating "significant change" detection.
    let recentChangeBucket: string | null = null
    const recentOpinion = inputs.opinions
      .filter((o) => o.ticker === ticker)
      .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))[0]
    if (recentOpinion && recentOpinion.targetPrice !== null && recentOpinion.priorTargetPrice !== null) {
      const delta = recentOpinion.targetPrice - recentOpinion.priorTargetPrice
      if (delta !== 0 && recentOpinion.priorTargetPrice !== 0) {
        const pct = Math.abs(delta / recentOpinion.priorTargetPrice) * 100
        if (pct >= 15) recentChangeBucket = 'major'
        else if (pct >= 7) recentChangeBucket = 'moderate'
        else recentChangeBucket = 'minor'
      }
    }
    if (recentChangeBucket === 'major' || recentChangeBucket === 'moderate') {
      flags.push('recent_significant_change')
    }

    const activity: PositionResearchActivity = {
      ticker,
      reportsLast24h,
      reportsLast3d,
      reportsLast7d,
      distinctBrokersLast7d,
      daysSinceLastReport: daysSinceLast,
      lastReportAt: lastAt,
    }

    byTicker.set(k, {
      ticker,
      stockName: stockByTicker.get(k)?.name ?? null,
      membership: tickerToMembership[k],
      direction: tickerToDir[k],
      conviction,
      weightPct: tickerToWeight[k],
      activity,
      distinctBrokersAllTime,
      hasUnresolvedDivergence,
      hasOutlier,
      recentChangeBucket,
      riskFlags: flags,
    })
  }

  // Stable order: held by weight desc, then watchlist alpha.
  const summaries = [...byTicker.values()].sort((a, b) => {
    if (a.membership !== b.membership) return a.membership === 'held' ? -1 : 1
    if (a.membership === 'held') {
      const aw = a.weightPct ?? 0
      const bw = b.weightPct ?? 0
      if (aw !== bw) return bw - aw
    }
    return (a.ticker as string).localeCompare(b.ticker as string)
  })

  return { byTicker, summaries }
}
