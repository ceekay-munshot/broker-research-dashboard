// Barrel for the server-side alerts engine.

export { RULES } from './triggers'
export { computeSeverity, scoreToSeverity, severityRank } from './severity'
export { buildFingerprint, suppressionDecision } from './suppression'
export { buildDigest } from './digest'
export type { BuildDigestInputs } from './digest'
export {
  enrichDigestProse, defaultProseProvider, noopProseProvider,
} from './prose'
export type { ProseProvider, ProseEnrichmentResult } from './prose'
export { runAlerts } from './run'
export type { AlertRunInputs, AlertRunResult } from './run'
export type {
  TriggerInputs, CandidateAlert, AlertPersistence,
} from './types'
