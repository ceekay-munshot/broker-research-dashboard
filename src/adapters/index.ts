import type { ResearchAdapter } from './ResearchAdapter'
import { MockResearchAdapter } from './MockResearchAdapter'
import { HttpResearchAdapter } from './HttpResearchAdapter'
import { createStubFetch } from './http/stubFetch'

// Singleton adapter instance. The UI imports `getResearchAdapter()` and
// never instantiates the adapter directly, so that a different
// implementation can replace the current one with a single call to
// setResearchAdapter() at bootstrap — or, more commonly, via env vars
// wired through createAdapterFromEnv().
let adapterInstance: ResearchAdapter = createAdapterFromEnv()

export function getResearchAdapter(): ResearchAdapter {
  return adapterInstance
}

export function setResearchAdapter(next: ResearchAdapter): void {
  adapterInstance = next
}

/**
 * Env-driven adapter factory. Called once at module load.
 *
 *   VITE_RESEARCH_ADAPTER  mock (default) | http | http-stub
 *   VITE_API_BASE_URL      required when mode = http
 *   VITE_API_TOKEN         optional bearer token
 *
 * See .env.example and docs/api-contract.md for conventions.
 */
export function createAdapterFromEnv(): ResearchAdapter {
  const mode = (import.meta.env.VITE_RESEARCH_ADAPTER ?? 'mock') as string

  if (mode === 'http') {
    const baseUrl = import.meta.env.VITE_API_BASE_URL
    if (!baseUrl) {
      throw new Error('VITE_API_BASE_URL is required when VITE_RESEARCH_ADAPTER=http')
    }
    return new HttpResearchAdapter({
      baseUrl,
      authToken: import.meta.env.VITE_API_TOKEN,
    })
  }

  if (mode === 'http-stub') {
    // Exercises the full HTTP code path (client + parsers + error mapping)
    // without a real backend. Every request is routed to a MockResearchAdapter
    // under the hood through src/adapters/http/stubFetch.ts.
    const mockBacking = new MockResearchAdapter({ simulatedLatencyMs: 0 })
    return new HttpResearchAdapter({
      baseUrl: 'http://stub.local',
      fetchImpl: createStubFetch(mockBacking),
    })
  }

  if (mode !== 'mock') {
    // eslint-disable-next-line no-console
    console.warn(`Unknown VITE_RESEARCH_ADAPTER="${mode}"; falling back to mock.`)
  }
  return new MockResearchAdapter()
}

export type { ResearchAdapter } from './ResearchAdapter'
export { MockResearchAdapter } from './MockResearchAdapter'
export { HttpResearchAdapter } from './HttpResearchAdapter'
export type {
  ListEmailsQuery, ListReportsQuery,
  ListOpinionsQuery, ListClosuresQuery,
} from './queries'
export {
  AdapterError, OrgScopeViolationError, NotFoundError,
  InvalidQueryError, UnauthenticatedError, ContractViolationError,
} from './errors'
