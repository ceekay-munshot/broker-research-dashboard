import type { ResearchAdapter } from './ResearchAdapter'
import { MockResearchAdapter } from './MockResearchAdapter'

// Singleton adapter instance. The UI imports `getResearchAdapter()` and
// never instantiates the adapter directly, so that a different
// implementation (e.g. HttpResearchAdapter against a real API) can replace
// the mock with a single call to setResearchAdapter() at bootstrap.
let adapterInstance: ResearchAdapter = new MockResearchAdapter()

export function getResearchAdapter(): ResearchAdapter {
  return adapterInstance
}

export function setResearchAdapter(next: ResearchAdapter): void {
  adapterInstance = next
}

export type { ResearchAdapter } from './ResearchAdapter'
export { MockResearchAdapter } from './MockResearchAdapter'
export type {
  ListEmailsQuery, ListReportsQuery,
  ListOpinionsQuery, ListDivergencesQuery,
} from './queries'
export {
  AdapterError, OrgScopeViolationError, NotFoundError, InvalidQueryError,
} from './errors'
