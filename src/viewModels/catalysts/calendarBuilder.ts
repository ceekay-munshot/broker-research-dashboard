import type {
  CatalystEvent, EventRiskFlag, PortfolioConviction, PortfolioDirection,
  PortfolioMembership, PortfolioSnapshot,
} from '../../domain'
import type { CatalystCardViewModel, CatalystsViewModel } from './types'

const DAY_MS = 86400e3
const IMPORTANCE_RANK = { critical: 100, high: 70, medium: 40, low: 15 } as const

export interface BuildCalendarInputs {
  readonly catalysts: readonly CatalystEvent[]
  readonly portfolio: PortfolioSnapshot | null
  readonly degradations?: readonly string[]
  readonly now?: Date
}

export function buildCatalystsViewModel(inputs: BuildCalendarInputs): CatalystsViewModel {
  const now = inputs.now ?? new Date()
  if (inputs.catalysts.length === 0) {
    return {
      hasData: false,
      upcoming7d: [], upcoming30d: [], overdue: [], later: [],
      counts: { total: 0, held: 0, watchlist: 0, weakCoverage: 0, divergent: 0 },
      degradations: inputs.degradations ?? ['No catalysts have been ingested yet.'],
    }
  }
  const cards: CatalystCardViewModel[] = inputs.catalysts.map((c) => decorate(c, inputs.portfolio, now))
  cards.sort((a, b) => b.priorityScore - a.priorityScore || a.daysUntil - b.daysUntil)

  const upcoming7d = cards.filter((c) => c.daysUntil >= 0 && c.daysUntil <= 7)
  const upcoming30d = cards.filter((c) => c.daysUntil > 7 && c.daysUntil <= 30)
  const overdue = cards.filter((c) => c.daysUntil < 0).slice(0, 12)
  const later = cards.filter((c) => c.daysUntil > 30).slice(0, 12)

  const counts = {
    total: cards.length,
    held: cards.filter((c) => c.membership === 'held').length,
    watchlist: cards.filter((c) => c.membership === 'watchlist').length,
    weakCoverage: cards.filter((c) =>
      c.riskFlags.includes('thin_coverage') ||
      c.riskFlags.includes('stale_coverage') ||
      c.riskFlags.includes('high_calibration_brokers_silent')).length,
    divergent: cards.filter((c) => c.riskFlags.includes('widening_divergence')).length,
  }

  return {
    hasData: true,
    upcoming7d, upcoming30d, overdue, later,
    counts,
    degradations: inputs.degradations ?? [],
  }
}

function decorate(c: CatalystEvent, snapshot: PortfolioSnapshot | null, now: Date): CatalystCardViewModel {
  const expectedMs = Date.parse(c.expectedAt)
  const daysUntil = Math.round((expectedMs - now.getTime()) / DAY_MS)
  const ctx = bookContextFor(snapshot, c.ticker as unknown as string)

  const urgency = daysUntil < 0 ? 80
    : daysUntil <= 0.5 ? 110 : daysUntil <= 1 ? 100
    : daysUntil <= 3 ? 90 : daysUntil <= 7 ? 70
    : daysUntil <= 14 ? 50 : daysUntil <= 30 ? 30 : 10
  const importance = IMPORTANCE_RANK[c.importance]
  const weightFactor = ctx.membership === 'held'
    ? 1 + Math.min(0.5, (ctx.weightPct ?? 0) / 20)
    : ctx.membership === 'watchlist' ? 0.7
    : ctx.membership === 'adjacent' ? 0.4 : 0.2
  const priority = Math.round(urgency * (importance / 100) * weightFactor * 10) / 10

  // No risk-flag inference here — that's done server-side and arrives via
  // the brief. The card just shows what the catalyst already carries
  // (we'll let the briefs panel surface flags). For the initial UI we
  // synthesize "in book" / urgency reasons.
  const reasons: { code: string; text: string }[] = []
  if (ctx.membership === 'held') {
    reasons.push({
      code: 'pf_held',
      text: `In book · ${ctx.direction ?? 'long'}${ctx.weightPct !== null ? ` · ${ctx.weightPct.toFixed(1)}%` : ''}${ctx.conviction === 'high' ? ' · ★' : ''}`,
    })
  } else if (ctx.membership === 'watchlist') {
    reasons.push({ code: 'pf_watchlist', text: 'On watchlist' })
  }
  if (daysUntil >= 0 && daysUntil <= 1) reasons.push({ code: 'imminent', text: 'Within 24h' })
  else if (daysUntil >= 0 && daysUntil <= 7) reasons.push({ code: 'this_week', text: `In ${daysUntil}d` })
  else if (daysUntil < 0) reasons.push({ code: 'overdue', text: `${Math.abs(daysUntil)}d overdue` })

  return {
    catalystId: c.id,
    ticker: c.ticker as unknown as string,
    stockName: c.stockName,
    type: c.type,
    status: c.status,
    importance: c.importance,
    headline: c.headline,
    description: c.description,
    expectedAt: c.expectedAt,
    expectedDate: c.expectedDate,
    hasIntradayTime: c.hasIntradayTime,
    daysUntil,
    urgencyScore: urgency,
    priorityScore: priority,
    membership: ctx.membership,
    direction: ctx.direction,
    conviction: ctx.conviction,
    weightPct: ctx.weightPct,
    riskFlags: [] as readonly EventRiskFlag[],
    reasonChips: reasons,
  }
}

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
  if (pos) return { membership: 'held', direction: pos.direction, conviction: pos.conviction, weightPct: pos.weightPct }
  const watch = snapshot.watchlist.find((w) => (w.ticker as string) === ticker)
  if (watch) return { membership: 'watchlist', direction: null, conviction: null, weightPct: null }
  return { membership: 'none', direction: null, conviction: null, weightPct: null }
}
