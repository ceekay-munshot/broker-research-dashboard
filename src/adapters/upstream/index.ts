// Barrel for the upstream translation layer. `HttpResearchAdapter`,
// `FixtureUpstreamAdapter`, and the contract tests import from here.

export { FixtureUpstreamAdapter } from './FixtureUpstreamAdapter'
export {
  UPSTREAM_FIXTURES, cloneFixture,
  type UpstreamFixtureKey,
} from './fixtureSource'
export * from './mappers'
export {
  RESOURCE_CATALOG, specForKey,
  type ResourceRequirement, type ResourceSpec,
} from './degraded'
export {
  normalizeUpstreamPayload, normalizePagePayload,
  aliasField, coerceNumericString, coerceNumericFields,
  camelCaseKeysDeep,
} from './normalize'
export {
  SCREEN_READINESS, assessScreen, assessAllScreens,
  type ScreenKey, type ScreenReadiness,
  type ScreenReadinessVerdict, type ScreenReadinessReport,
} from './screenReadiness'
export {
  subscribe, getSnapshot, recordResourceCall, recordWarning,
  setDiagnosticsMode, setDiagnosticsScope, resetDiagnostics,
  type DiagnosticsSnapshot, type ResourceCallRecord, type ResourceOutcome,
} from './diagnostics'
export { withDiagnostics } from './withDiagnostics'
export type {
  UpstreamOrgScope, UpstreamOrganization, UpstreamUser,
  UpstreamBroker, UpstreamSector, UpstreamStock,
  UpstreamBrokerEmail, UpstreamAttachment,
  UpstreamResearchReport, UpstreamReportSummary, UpstreamEvidenceSnippet,
  UpstreamBrokerStockOpinion,
  UpstreamConflictClosure, UpstreamSectorIntelligence,
  UpstreamKpiSnapshot, UpstreamIngestionStatus,
  UpstreamPage,
} from './types'
