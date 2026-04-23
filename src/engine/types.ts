import type {
  BrokerId, EvidenceId, StockTicker, Iso8601,
  Stance, Rating, SectorId, ReportId,
} from '../domain'

// ─── Canonical disagreement dimensions ────────────────────────────────
// These are the axes the engine classifies broker signals on. A broker's
// summary contributes a signal to one or more dimensions (derived from
// themes via classifiers.ts); aggregation per dimension produces either a
// ConsensusPoint or a DisagreementPoint.
export type DisagreementDimension =
  | 'stance'
  | 'rating'
  | 'target_price'
  | 'growth'
  | 'margin'
  | 'demand_or_pricing'
  | 'order_book'
  | 'timing_or_catalyst'
  | 'management_execution'

// The overall state of the Street's view on a ticker. Deterministically
// derived from stance distribution and outlier detection (see
// docs/closure-logic.md).
export type ResultantState =
  | 'consensus_bullish'
  | 'consensus_bearish'
  | 'mixed_constructive'
  | 'mixed_cautious'
  | 'unresolved'
  | 'outlier_driven'

export type StrengthBand = 'strong' | 'moderate' | 'weak'

export type OutlierReason =
  | 'target_price_z'     // target > 1.25σ from mean (needs ≥3 brokers)
  | 'rating_contrary'    // broker's rating sharply disagrees with majority
  | 'stance_contrary'    // broker's stance contradicts a ≥66% majority

export interface ConsensusPoint {
  readonly dimension: DisagreementDimension
  readonly topic: string
  readonly claim: string
  readonly polarity: Stance
  readonly supportingBrokerIds: readonly BrokerId[]
  readonly supportingClaims: readonly string[]
  readonly evidenceIds: readonly EvidenceId[]
}

export interface DisagreementPoint {
  readonly dimension: DisagreementDimension
  readonly topic: string
  readonly bullClaims: readonly string[]
  readonly bearClaims: readonly string[]
  readonly bullBrokerIds: readonly BrokerId[]
  readonly bearBrokerIds: readonly BrokerId[]
  readonly bullEvidenceIds: readonly EvidenceId[]
  readonly bearEvidenceIds: readonly EvidenceId[]
}

export interface OutlierClassification {
  readonly brokerId: BrokerId
  readonly reasons: readonly OutlierReason[]
  readonly primaryReason: OutlierReason
  readonly direction: 'bullish' | 'bearish'
  readonly targetZScore: number | null
  readonly notes: string
}

export interface ResultantLogic {
  readonly ticker: StockTicker
  readonly state: ResultantState
  readonly strength: StrengthBand
  readonly narrative: string
  readonly keyDrivers: readonly string[]
  readonly openQuestions: readonly string[]
  readonly asOf: Iso8601
}

export interface ConfidenceDetail {
  readonly score: number           // 0..1
  readonly band: StrengthBand
  readonly rationale: readonly string[]
}

export interface TargetStats {
  readonly count: number
  readonly mean: number | null
  readonly median: number | null
  readonly high: number | null
  readonly low: number | null
  readonly stdev: number | null
  readonly spreadPct: number | null
}

export interface ConflictClosure {
  readonly ticker: StockTicker
  readonly asOf: Iso8601
  readonly brokerCount: number
  readonly brokerIds: readonly BrokerId[]
  readonly lastReportIds: readonly ReportId[]
  readonly stanceDistribution: Readonly<Record<Stance, number>>
  readonly ratingDistribution: Readonly<Partial<Record<Rating, number>>>
  readonly targetStats: TargetStats
  readonly consensus: readonly ConsensusPoint[]
  readonly disagreements: readonly DisagreementPoint[]
  readonly outliers: readonly OutlierClassification[]
  readonly resultant: ResultantLogic
  readonly confidence: ConfidenceDetail
}

// ─── Sector intelligence ──────────────────────────────────────────────

export type SectorSignalClassification =
  | 'repeated_sector'      // ≥2 tickers × ≥2 brokers, same direction
  | 'single_name'          // only one ticker carries this theme
  | 'broker_specific'      // multiple tickers but only one broker
  | 'unresolved_debate'    // same theme appears bullish AND bearish

export interface SectorSignal {
  readonly theme: string
  readonly classification: SectorSignalClassification
  readonly tickers: readonly StockTicker[]
  readonly brokerIds: readonly BrokerId[]
  readonly stanceLean: Stance
  readonly evidenceIds: readonly EvidenceId[]
  readonly mentionCount: number
  readonly firstSeen: Iso8601
  readonly lastSeen: Iso8601
}

export interface SectorResultantEntry {
  readonly ticker: StockTicker
  readonly state: ResultantState
  readonly strength: StrengthBand
}

export interface SectorIntelligence {
  readonly sectorId: SectorId
  readonly sectorName: string
  readonly periodStart: Iso8601
  readonly periodEnd: Iso8601
  readonly asOf: Iso8601
  readonly reportCount: number
  readonly tickerCount: number
  readonly brokerCount: number
  readonly aggregateStance: Stance
  readonly aggregateStanceScore: number      // −1..+1
  readonly signals: readonly SectorSignal[]
  readonly resultantStates: readonly SectorResultantEntry[]
}
