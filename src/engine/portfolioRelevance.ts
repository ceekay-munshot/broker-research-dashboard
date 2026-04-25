// ─────────────────────────────────────────────────────────────────────────
// Portfolio relevance engine.
//
// Deterministic. No black-box model. Given a `PortfolioSnapshot` and the
// canonical research slice (reports / summaries / opinions / closures),
// emits a relevance row per (report × ticker). Higher scores surface what
// matters most to the firm's actual book this morning.
//
// Rules below are intentionally simple and additive — every rule fires
// independently and contributes a `PortfolioRelevanceReason` with a
// human-readable text. The bucket is a coarse band over the total score.
//
// Membership is computed once per ticker and reused for every report on
// that ticker.
//
// Caller passes `now` for testability; defaults to `new Date()`.
// ─────────────────────────────────────────────────────────────────────────

import type {
  PortfolioConviction, PortfolioDirection, PortfolioMembership,
  PortfolioRelevance, PortfolioRelevanceBucket, PortfolioRelevanceReason,
  PortfolioSnapshot, ReportSummary, ResearchReport, BrokerStockOpinion,
  Stock, StockTicker, SectorId,
} from '../domain'
import type { ConflictClosure } from './types'

export interface PortfolioRelevanceInputs {
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly now?: Date
}

/** Per-ticker membership info — computed once, reused across reports. */
export interface PortfolioTickerContext {
  readonly ticker: StockTicker
  readonly membership: PortfolioMembership
  readonly direction: PortfolioDirection | null
  readonly conviction: PortfolioConviction | null
  readonly weightPct: number | null
  readonly note: string | null
}

export interface PortfolioRelevanceResult {
  /** Relevance row keyed by `${reportId}:${ticker}` (or `${reportId}` for
   *  ticker-less digest items). */
  readonly byKey: ReadonlyMap<string, PortfolioRelevance>
  /** Per-ticker context, including for tickers with no reports yet. */
  readonly contextByTicker: ReadonlyMap<string, PortfolioTickerContext>
  /** Set of all tickers in the book + watchlist for fast lookup. */
  readonly bookTickers: ReadonlySet<string>
  readonly heldTickers: ReadonlySet<string>
  readonly watchlistTickers: ReadonlySet<string>
}

const RECENCY_HOURS_FRESH = 36
const RECENCY_DAYS_RECENT = 7

const BUCKET_THRESHOLDS: Readonly<Record<PortfolioRelevanceBucket, number>> = {
  critical: 90,
  high:     55,
  medium:   25,
  low:      1,
  none:     0,
}

export function buildPortfolioRelevance(inputs: PortfolioRelevanceInputs): PortfolioRelevanceResult {
  const now = inputs.now ?? new Date()
  const snapshot = inputs.snapshot

  // ── 1. Build per-ticker context (held / watchlist / adjacent / none).
  const contextByTicker = new Map<string, PortfolioTickerContext>()
  const heldTickers = new Set<string>()
  const watchlistTickers = new Set<string>()
  const heldSectors = new Set<SectorId>()
  const stockByTicker = new Map<string, Stock>()
  for (const s of inputs.stocks) stockByTicker.set(s.ticker as string, s)

  if (snapshot) {
    for (const p of snapshot.positions) {
      heldTickers.add(p.ticker as string)
      const stk = stockByTicker.get(p.ticker as string)
      if (stk) heldSectors.add(stk.sectorId)
      contextByTicker.set(p.ticker as string, {
        ticker: p.ticker,
        membership: 'held',
        direction: p.direction,
        conviction: p.conviction,
        weightPct: p.weightPct,
        note: p.note,
      })
    }
    for (const w of snapshot.watchlist) {
      const tk = w.ticker as string
      if (heldTickers.has(tk)) continue
      watchlistTickers.add(tk)
      contextByTicker.set(tk, {
        ticker: w.ticker,
        membership: 'watchlist',
        direction: null,
        conviction: null,
        weightPct: null,
        note: w.note,
      })
    }
  }

  // ── 2. Pre-index closures + summaries for O(1) lookups.
  const closureByTicker = new Map<string, ConflictClosure>()
  for (const c of inputs.closures) closureByTicker.set(c.ticker as string, c)
  const summaryByReport = new Map<string, ReportSummary>()
  for (const s of inputs.summaries) summaryByReport.set(s.reportId as string, s)

  // Brokers covering each ticker recently — for "Street is updating" rule.
  const recentBrokerCount = new Map<string, number>()
  if (snapshot) {
    const cutoffMs = Date.parse(now.toISOString()) - RECENCY_DAYS_RECENT * 86400e3
    const tmp = new Map<string, Set<string>>()
    for (const r of inputs.reports) {
      if (Date.parse(r.receivedAt) < cutoffMs) continue
      for (const t of r.tickers) {
        const k = t as string
        const set = tmp.get(k) ?? new Set<string>()
        set.add(r.brokerId as string)
        tmp.set(k, set)
      }
    }
    for (const [k, v] of tmp) recentBrokerCount.set(k, v.size)
  }

  // ── 3. Score each (report × ticker) pair.
  const byKey = new Map<string, PortfolioRelevance>()
  const bookTickers = new Set<string>([...heldTickers, ...watchlistTickers])

  for (const report of inputs.reports) {
    const summary = summaryByReport.get(report.id as string) ?? null
    const tickers = report.tickers.length === 0 ? [null] : report.tickers

    for (const ticker of tickers) {
      const tk = ticker ? (ticker as string) : null
      const ctx = tk ? contextByTicker.get(tk) ?? null : null
      const sectorAdj = !ctx && tk
        ? (() => {
            const stk = stockByTicker.get(tk)
            return stk ? heldSectors.has(stk.sectorId) : false
          })()
        : false

      const membership: PortfolioMembership = ctx?.membership
        ?? (sectorAdj ? 'adjacent' : 'none')

      // Adjacent ticker context (no per-ticker membership row).
      if (!ctx && tk && sectorAdj && !contextByTicker.has(tk)) {
        contextByTicker.set(tk, {
          ticker: ticker as StockTicker,
          membership: 'adjacent',
          direction: null,
          conviction: null,
          weightPct: null,
          note: null,
        })
      }

      const reasons: PortfolioRelevanceReason[] = []
      let score = 0

      // Rule: membership baseline.
      if (membership === 'held') {
        score += 40
        reasons.push({ code: 'pf_held', text: 'in current book', points: 40 })
      } else if (membership === 'watchlist') {
        score += 20
        reasons.push({ code: 'pf_watchlist', text: 'on watchlist', points: 20 })
      } else if (membership === 'adjacent') {
        score += 5
        reasons.push({ code: 'pf_adjacent', text: 'adjacent sector to book', points: 5 })
      }

      // Rule: position size weight (only for held).
      if (ctx?.membership === 'held' && (ctx.weightPct ?? 0) >= 5) {
        const w = ctx.weightPct as number
        const points = w >= 7 ? 25 : 15
        score += points
        reasons.push({ code: 'pf_size', text: `${w.toFixed(1)}% weight position`, points })
      }
      if (ctx?.membership === 'held' && ctx.conviction === 'high') {
        score += 10
        reasons.push({ code: 'pf_conviction', text: 'high-conviction holding', points: 10 })
      }

      // Rule: report-level signal — rating change / target change.
      if (summary && summary.rating) {
        if (summary.priorTargetPrice !== null && summary.targetPrice !== null) {
          const delta = summary.targetPrice - summary.priorTargetPrice
          if (delta !== 0 && summary.priorTargetPrice !== 0) {
            const pct = Math.abs(delta / summary.priorTargetPrice) * 100
            if (pct >= 7) {
              const points = pct >= 15 ? 18 : 10
              score += points
              reasons.push({
                code: 'sig_target',
                text: `target moved ${delta > 0 ? '+' : '-'}${pct.toFixed(0)}%`,
                points,
              })
            }
          }
        }
      }

      // Rule: stance disagrees with position direction (held only).
      if (ctx?.membership === 'held' && summary && ctx.direction) {
        const stance = summary.stance
        const dir = ctx.direction
        if ((dir === 'long' && stance === 'bearish') || (dir === 'short' && stance === 'bullish')) {
          score += 22
          reasons.push({
            code: 'pf_against',
            text: `broker view opposes your ${dir} position`,
            points: 22,
          })
        } else if ((dir === 'long' && stance === 'bullish') || (dir === 'short' && stance === 'bearish')) {
          score += 4
          reasons.push({
            code: 'pf_with',
            text: `broker view supports your ${dir} position`,
            points: 4,
          })
        }
      }

      // Rule: divergence / unresolved street state on held/watchlist.
      const closure = tk ? closureByTicker.get(tk) ?? null : null
      if (closure && (membership === 'held' || membership === 'watchlist')) {
        const state = closure.resultant.state
        if (state === 'unresolved' || state === 'mixed_constructive' || state === 'mixed_cautious' || state === 'outlier_driven' || closure.disagreements.length > 0) {
          score += 14
          reasons.push({
            code: 'pf_divergence',
            text: 'unresolved divergence on this name',
            points: 14,
          })
        }
        if (closure.outliers.some((o) => (o.brokerId as string) === (report.brokerId as string))) {
          score += 8
          reasons.push({
            code: 'pf_outlier',
            text: 'this broker is an outlier on the name',
            points: 8,
          })
        }
      }

      // Rule: multiple brokers updating the same name recently.
      if (tk && (membership === 'held' || membership === 'watchlist')) {
        const c = recentBrokerCount.get(tk) ?? 0
        if (c >= 3) {
          score += 10
          reasons.push({ code: 'pf_pile_in', text: `${c} brokers covering this 7d`, points: 10 })
        }
      }

      // Rule: report recency (only if relevant at all).
      const ageMs = Date.parse(now.toISOString()) - Date.parse(report.receivedAt)
      const ageHours = ageMs / 3600e3
      if (membership !== 'none') {
        if (ageHours <= RECENCY_HOURS_FRESH) {
          score += 8
          reasons.push({ code: 'recency_fresh', text: 'fresh today', points: 8 })
        } else if (ageHours <= RECENCY_DAYS_RECENT * 24) {
          score += 3
          reasons.push({ code: 'recency_week', text: 'this week', points: 3 })
        }
      }

      // Rule: report type weighting.
      if (membership !== 'none') {
        if (report.reportType === 'initiation' || report.reportType === 'deep_dive') {
          score += 8
          reasons.push({ code: 'sig_type', text: report.reportType.replace('_', ' '), points: 8 })
        } else if (report.reportType === 'flash' || report.reportType === 'earnings_review') {
          score += 4
          reasons.push({ code: 'sig_type', text: report.reportType.replace('_', ' '), points: 4 })
        }
      }

      const bucket = scoreToBucket(score)
      const key = tk ? `${report.id}:${tk}` : `${report.id}`
      byKey.set(key, {
        bucket,
        score,
        reasons,
        membership,
        direction: ctx?.direction ?? null,
        conviction: ctx?.conviction ?? null,
        weightPct: ctx?.weightPct ?? null,
        bookSummary: composeBookSummary(membership, ctx, reasons),
      })
    }
  }

  return {
    byKey,
    contextByTicker,
    bookTickers,
    heldTickers,
    watchlistTickers,
  }
}

export function scoreToBucket(score: number): PortfolioRelevanceBucket {
  if (score >= BUCKET_THRESHOLDS.critical) return 'critical'
  if (score >= BUCKET_THRESHOLDS.high)     return 'high'
  if (score >= BUCKET_THRESHOLDS.medium)   return 'medium'
  if (score >= BUCKET_THRESHOLDS.low)      return 'low'
  return 'none'
}

function composeBookSummary(
  membership: PortfolioMembership,
  ctx: PortfolioTickerContext | null,
  reasons: readonly PortfolioRelevanceReason[],
): string {
  if (membership === 'none') return 'Not in current book or watchlist.'
  if (membership === 'adjacent') return 'Adjacent to a held sector — read for context.'

  const head = membership === 'held'
    ? `Held ${ctx?.direction ?? 'long'}${ctx?.weightPct !== null && ctx?.weightPct !== undefined ? ` · ${ctx.weightPct.toFixed(1)}% weight` : ''}${ctx?.conviction ? ` · ${ctx.conviction} conviction` : ''}`
    : 'Watchlist name'

  // Pull out the most-explanatory non-baseline reasons for the tail.
  const tailReasons = reasons
    .filter((r) => !r.code.startsWith('pf_held')
                && !r.code.startsWith('pf_watchlist')
                && !r.code.startsWith('pf_adjacent')
                && !r.code.startsWith('pf_size')
                && !r.code.startsWith('pf_conviction'))
    .slice(0, 2)
    .map((r) => r.text)
  if (tailReasons.length === 0) return `${head}.`
  return `${head}. ${tailReasons.join(' · ')}.`
}
