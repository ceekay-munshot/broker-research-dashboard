import type {
  BrokerId, SectorId, StockTicker,
} from '../domain/ids'
import type { Iso8601, Stance } from '../domain/common'
import type { EmailProcessingStatus } from '../domain/status'
import type { ReportType } from '../domain/report'
import type { ResultantState } from '../engine/types'

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

export interface ListClosuresQuery {
  readonly tickers?: readonly StockTicker[]
  readonly sectorIds?: readonly SectorId[]
  readonly states?: readonly ResultantState[]
  readonly minSpreadPct?: number
  /** When true, returns only closures with at least one DisagreementPoint. */
  readonly mustHaveDisagreements?: boolean
  /** When true, returns only closures with at least one OutlierClassification. */
  readonly mustHaveOutliers?: boolean
}
