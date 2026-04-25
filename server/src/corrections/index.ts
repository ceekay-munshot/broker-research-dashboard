export type {
  CorrectionRule, CorrectionPayload, CorrectionType,
  CorrectionScope, CorrectionAuditEntry, CorrectionApplication,
  CorrectionRuleSet,
} from './types'
export { indexRules } from './types'
export { findApplicableRules, matchesScope, conflictSignature, type MatchContext } from './matcher'
export {
  applyArtifactCorrections, applyCandidateCorrections,
  type ArtifactCorrectionResult, type CandidateCorrectionResult,
} from './apply'
export { promoteToGoldFixture, type GoldFixtureDraft } from './promote'
