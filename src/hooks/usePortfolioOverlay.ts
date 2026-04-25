// Hook that produces the shared `PortfolioOverlay` from canonical inputs.
// Used by My Book, Daily Worklog, By Stock, and By Broker so the relevance
// + coverage logic only runs once per scope load.
//
// Tolerates a missing portfolio: if the adapter returns null (no portfolio
// configured for the org), the overlay reports `hasPortfolio=false` and
// every consumer renders its degraded path.

import type {
  BrokerStockOpinion, ReportSummary, ResearchReport, Stock,
  PortfolioSnapshot,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import {
  EMPTY_PORTFOLIO_OVERLAY, buildPortfolioOverlay,
} from '../viewModels/portfolio'
import type { PortfolioOverlay } from '../viewModels/portfolio'

export interface PortfolioOverlayInputs {
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
}

export function usePortfolioOverlay(inputs: PortfolioOverlayInputs): QueryResult<PortfolioOverlay> {
  const snapshot = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => {
      try { return await a.getPortfolioSnapshot(s) }
      catch { return null }
    },
    [],
  )

  if (snapshot.loading) return { data: null, loading: true, error: null }

  // Even on error we don't fail — degrade cleanly to "no portfolio".
  const snap = snapshot.data ?? null
  if (snap === null) {
    return { data: EMPTY_PORTFOLIO_OVERLAY, loading: false, error: null }
  }

  const overlay = buildPortfolioOverlay({
    snapshot: snap,
    reports: inputs.reports,
    summaries: inputs.summaries,
    opinions: inputs.opinions,
    closures: inputs.closures,
    stocks: inputs.stocks,
  })
  return { data: overlay, loading: false, error: null }
}
