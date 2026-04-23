import type {
  BrokerId, SectorId, StockTicker,
} from '../domain/ids'
import type { Iso8601, Stance } from '../domain/common'
import type { EmailProcessingStatus } from '../domain/status'
import type { ReportType } from '../domain/report'

// Filter shapes for the adapter's list methods. Every field is optional; an
// empty query returns everything the scope allows, bounded by pagination.

export interface ListEmailsQuery {
  readonly since?: Iso8601
  readonly until?: Iso8601
  readonly brokerIds?: readonly BrokerId[]
  readonly statuses?: readonly EmailProcessingStatus[]
  readonly limit?: number
  readonly cursor?: string | null
}

export interface ListReportsQuery {
  readonly since?: Iso8601
  readonly until?: Iso8601
  readonly brokerIds?: readonly BrokerId[]
  readonly tickers?: readonly StockTicker[]
  readonly sectorIds?: readonly SectorId[]
  readonly reportTypes?: readonly ReportType[]
  readonly stances?: readonly Stance[]
  readonly limit?: number
  readonly cursor?: string | null
}

export interface ListOpinionsQuery {
  readonly brokerIds?: readonly BrokerId[]
  readonly tickers?: readonly StockTicker[]
}

export interface ListDivergencesQuery {
  readonly minSpreadPct?: number
  readonly tickers?: readonly StockTicker[]
}
