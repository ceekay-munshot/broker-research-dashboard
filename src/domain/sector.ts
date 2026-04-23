import type {
  SectorId, StockTicker,
} from './ids'

// Global taxonomy. Sectors form a shallow tree (at most two levels in Phase 1);
// `parentId` is null for top-level sectors.
//
// Accumulated per-sector intelligence (repeated signals, unresolved debates,
// resultant roll-up) lives in src/engine/types.ts as `SectorIntelligence` and
// is produced by the deterministic engine, not stored in the domain layer.
export interface Sector {
  readonly id: SectorId
  readonly name: string
  readonly parentId: SectorId | null
  readonly tickers: readonly StockTicker[]
}
