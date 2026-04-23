import type {
  SectorId, StockTicker, OrgId, ReportId,
} from './ids'
import type { Iso8601, Stance } from './common'

// Global taxonomy. Sectors form a shallow tree (at most two levels in Phase 1);
// `parentId` is null for top-level sectors.
export interface Sector {
  readonly id: SectorId
  readonly name: string
  readonly parentId: SectorId | null
  readonly tickers: readonly StockTicker[]
}

// Phase 2 placeholder. The product goal is that sector intelligence accrues
// over time — every new report tagged into a sector updates its running
// themes, stance mix, and canonical report set. The real adapter will compute
// this server-side from a rolling window; the mock adapter returns a minimal
// fixture to let the UI render.
export interface SectorKnowledgeItem {
  readonly orgId: OrgId
  readonly sectorId: SectorId
  readonly periodStart: Iso8601
  readonly periodEnd: Iso8601
  readonly reportCount: number
  readonly aggregateStance: Stance
  readonly topThemes: readonly SectorTheme[]
  readonly reportIds: readonly ReportId[]
}

export interface SectorTheme {
  readonly theme: string
  readonly mentions: number
  readonly stanceLean: Stance
}
