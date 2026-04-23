import type {
  StockTicker, SectorId, OrgId, BrokerId, ReportId,
} from './ids'
import type { Iso8601, Stance, Rating, IsoCurrency } from './common'

// Global stock catalog. The ticker itself is the primary key. `sectorId` is
// the primary sector; multi-sector names are modeled via the reverse edge on
// Sector.tickers when needed.
export interface Stock {
  readonly ticker: StockTicker
  readonly name: string
  readonly sectorId: SectorId
  readonly currency: IsoCurrency
  readonly exchange: string | null
  readonly lastPrice: number | null
  readonly lastPriceAsOf: Iso8601 | null
}

// Derived: one broker's current view on one stock, taken from the most recent
// ready ResearchReport by that broker that mentions the ticker. Org-scoped
// because "most recent" depends on which reports the org actually received.
//
// This is the primary object the `By Broker` and `By Stock` UI reads from,
// and the input to the conflict-closure engine (src/engine/conflictClosure.ts)
// that produces consensus/disagreement/outlier/resultant output.
export interface BrokerStockOpinion {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly ticker: StockTicker
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: IsoCurrency | null
  readonly lastReportId: ReportId
  readonly lastUpdatedAt: Iso8601
  readonly impliedUpsidePct: number | null
}
