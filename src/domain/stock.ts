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
// This is the primary object the `By Broker` and `By Stock` UI reads from.
// In the mock adapter it is served from a fixture; in the real adapter it
// will be computed server-side and cached.
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

// Derived: aggregate of all active BrokerStockOpinions for one ticker in one
// org. Drives the `By Stock` consensus header and the divergence detector.
export interface ConsensusView {
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly brokerCount: number
  readonly avgTargetPrice: number | null
  readonly medianTargetPrice: number | null
  readonly highTargetPrice: number | null
  readonly lowTargetPrice: number | null
  readonly spreadPct: number | null
  readonly stanceDistribution: Readonly<Record<Stance, number>>
  readonly ratingDistribution: Readonly<Partial<Record<Rating, number>>>
  readonly asOf: Iso8601
}
