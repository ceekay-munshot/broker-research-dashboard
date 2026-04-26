// Pure deterministic analysis layer. The adapter invokes these builders to
// produce ConflictClosure and SectorIntelligence; the view-model layer
// consumes the results and shapes them for rendering. Rules are documented
// in docs/closure-logic.md.

export * from './types'
export { buildConflictClosure } from './conflictClosure'
export type { ConflictClosureInputs } from './conflictClosure'
export { buildSectorIntelligence } from './sectorIntelligence'
export type { SectorIntelligenceInputs } from './sectorIntelligence'
export { DIMENSION_TOPICS, classifyTheme, topicForDimension } from './classifiers'
export { buildPortfolioRelevance, scoreToBucket } from './portfolioRelevance'
export type {
  PortfolioRelevanceInputs, PortfolioTickerContext, PortfolioRelevanceResult,
} from './portfolioRelevance'
export { buildPortfolioCoverage } from './portfolioCoverage'
export type {
  PortfolioCoverageInputs, PortfolioCoverageResult,
} from './portfolioCoverage'
export {
  computeRankAdjustment, rankDeltasById, NO_ADJUSTMENT,
} from './adaptiveRanking'
export type {
  AdjustmentInputs, RankAdjustment, AdjustmentReason, SuppressionReason, AdjustmentSource,
} from './adaptiveRanking'
export {
  adaptiveRankingFlags, readAdaptiveRankingFlags, __setAdaptiveRankingFlagsForTesting,
} from './adaptiveRankingFlags'
export type { AdaptiveRankingFlags } from './adaptiveRankingFlags'
