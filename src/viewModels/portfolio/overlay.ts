// Build the shared `PortfolioOverlay` from the canonical inputs once per
// scope load. Pure transform; both the My Book builder and the worklog
// hook import this so the relevance and coverage logic only runs once.

import type {
  BrokerStockOpinion, PortfolioSnapshot, ReportSummary, ResearchReport,
  Stock,
} from '../../domain'
import type { ConflictClosure } from '../../engine/types'
import {
  buildPortfolioCoverage, buildPortfolioRelevance,
} from '../../engine'
import type { PortfolioOverlay } from './types'

export interface BuildOverlayInputs {
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly now?: Date
}

export function buildPortfolioOverlay(inputs: BuildOverlayInputs): PortfolioOverlay {
  const relevance = buildPortfolioRelevance({
    snapshot: inputs.snapshot,
    reports: inputs.reports,
    summaries: inputs.summaries,
    opinions: inputs.opinions,
    closures: inputs.closures,
    stocks: inputs.stocks,
    now: inputs.now,
  })
  const coverage = buildPortfolioCoverage({
    snapshot: inputs.snapshot,
    reports: inputs.reports,
    opinions: inputs.opinions,
    closures: inputs.closures,
    stocks: inputs.stocks,
    now: inputs.now,
  })

  return {
    snapshot: inputs.snapshot,
    hasPortfolio: !!inputs.snapshot && inputs.snapshot.isConfigured,
    relevanceByKey: relevance.byKey,
    contextByTicker: relevance.contextByTicker,
    coverageByTicker: coverage.byTicker,
    coverage: coverage.summaries,
    heldTickers: relevance.heldTickers,
    watchlistTickers: relevance.watchlistTickers,
  }
}

/** A safe empty overlay for code paths that don't have a snapshot loaded
 *  yet (or for orgs with no portfolio). The dashboard's degraded path. */
export const EMPTY_PORTFOLIO_OVERLAY: PortfolioOverlay = {
  snapshot: null,
  hasPortfolio: false,
  relevanceByKey: new Map(),
  contextByTicker: new Map(),
  coverageByTicker: new Map(),
  coverage: [],
  heldTickers: new Set(),
  watchlistTickers: new Set(),
}
