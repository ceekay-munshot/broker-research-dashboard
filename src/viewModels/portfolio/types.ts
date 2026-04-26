// Shared portfolio overlay view-model types — used by My Book, the
// Daily Worklog overlay, and the By Stock / By Broker book context.

import type {
  PortfolioCoverageSummary, PortfolioRelevance, PortfolioSnapshot,
  StockTicker, ReportId,
} from '../../domain'
import type { PortfolioTickerContext } from '../../engine/portfolioRelevance'

/** Bundle of derived portfolio context the UI shares across tabs.
 *  Hooks compute this once per scope-load and pass it down. */
export interface PortfolioOverlay {
  readonly snapshot: PortfolioSnapshot | null
  readonly hasPortfolio: boolean
  readonly relevanceByKey: ReadonlyMap<string, PortfolioRelevance>
  readonly contextByTicker: ReadonlyMap<string, PortfolioTickerContext>
  readonly coverageByTicker: ReadonlyMap<string, PortfolioCoverageSummary>
  readonly coverage: readonly PortfolioCoverageSummary[]
  readonly heldTickers: ReadonlySet<string>
  readonly watchlistTickers: ReadonlySet<string>
}

/** A single tile on the My Book tab showing one position-level card. */
export interface MyBookPositionCardViewModel {
  readonly ticker: StockTicker
  readonly stockName: string | null
  readonly membership: 'held' | 'watchlist'
  readonly direction: 'long' | 'short' | 'hedge' | null
  readonly conviction: 'high' | 'medium' | 'low' | null
  readonly weightPct: number | null
  readonly note: string | null
  readonly reportsLast24h: number
  readonly reportsLast7d: number
  readonly distinctBrokersLast7d: number
  readonly daysSinceLastReport: number | null
  readonly hasUnresolvedDivergence: boolean
  readonly hasOutlier: boolean
  readonly recentChangeBucket: string | null
  readonly riskFlags: readonly string[]
  /** A dominant relevance row computed from the most-recent report on this
   *  ticker, when present. Used to show "why it matters" + reasons. */
  readonly headlineRelevance: PortfolioRelevance | null
  readonly headlineReportId: ReportId | null
}

/** "Today's activity on the book" row. */
export interface MyBookActivityRow {
  readonly reportId: ReportId
  readonly ticker: StockTicker
  readonly brokerId: import('../../domain').BrokerId | null
  readonly brokerShortName: string
  readonly brokerColor: string | null
  readonly headline: string
  readonly publishedAt: string
  readonly receivedAt: string
  readonly relevance: PortfolioRelevance
  readonly stance: 'bullish' | 'neutral' | 'bearish'
  readonly rating: string | null
  readonly targetPrice: number | null
  readonly targetCurrency: string | null
  readonly priorTargetPrice: number | null
  readonly membership: 'held' | 'watchlist' | 'adjacent'
  /** Module 23 — adaptive ranking annotation. Null when no signal. */
  readonly adaptive: import('../adaptiveRanking').AdaptiveAnnotation | null
}

export interface MyBookSection<T> {
  readonly title: string
  readonly subtitle: string
  readonly items: readonly T[]
  readonly emptyText: string
}

export interface MyBookViewModel {
  readonly hasPortfolio: boolean
  readonly snapshotAsOf: string | null
  readonly headline: {
    readonly heldCount: number
    readonly watchlistCount: number
    readonly grossExposurePct: number | null
    readonly reportsOnBookToday: number
    readonly reportsOnBookLast7d: number
    readonly criticalToday: number
    readonly staleCoverageCount: number
    readonly singleBrokerCount: number
    readonly unresolvedDivergenceCount: number
  }
  readonly todayOnBook:           MyBookSection<MyBookActivityRow>
  readonly significantChanges:    MyBookSection<MyBookActivityRow>
  readonly unresolvedDivergence:  MyBookSection<MyBookPositionCardViewModel>
  readonly watchlistFresh:        MyBookSection<MyBookActivityRow>
  readonly staleCoverage:         MyBookSection<MyBookPositionCardViewModel>
  readonly positions:             readonly MyBookPositionCardViewModel[]
  readonly degradations: readonly string[]
}
