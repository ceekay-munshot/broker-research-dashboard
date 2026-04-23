import type {
  DivergenceId, OrgId, BrokerId, StockTicker, EvidenceId,
} from './ids'
import type { Iso8601 } from './common'

// Phase 2: a named case where two or more brokers hold materially different
// views on the same ticker. `aiConclusion` is the model-generated resolution
// attempt — left null in Phase 1 and populated once the ARB-closure logic
// ships.
export interface DivergenceCase {
  readonly id: DivergenceId
  readonly orgId: OrgId
  readonly ticker: StockTicker
  readonly spreadPct: number
  readonly highBrokerId: BrokerId
  readonly lowBrokerId: BrokerId
  readonly highTargetPrice: number
  readonly lowTargetPrice: number
  readonly conflicts: readonly DivergenceConflict[]
  readonly aiConclusion: string | null
  readonly generatedAt: Iso8601 | null
  readonly resolvedAt: Iso8601 | null
}

export interface DivergenceConflict {
  readonly topic: string
  readonly bullThesis: string
  readonly bearThesis: string
  readonly bullBrokerIds: readonly BrokerId[]
  readonly bearBrokerIds: readonly BrokerId[]
  readonly evidenceIds: readonly EvidenceId[]
}
