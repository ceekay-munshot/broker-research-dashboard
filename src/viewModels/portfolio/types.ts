// Shared portfolio overlay view-model type — used by the Daily Worklog
// overlay and the By Stock / By Broker book context.

import type {
  PortfolioCoverageSummary, PortfolioRelevance, PortfolioSnapshot,
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
