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
