import type { ResearchAdapter } from './ResearchAdapter'
import { MockResearchAdapter } from './MockResearchAdapter'
import { HttpResearchAdapter } from './HttpResearchAdapter'
import { createStubFetch } from './http/stubFetch'
import { type AdapterMode, normalizeAdapterMode } from './AdapterMode'
import { readScopeBootstrap } from '../app/scopeBootstrap'
import { FixtureUpstreamAdapter } from './upstream'
import { withDiagnostics } from './upstream/withDiagnostics'
import { setDiagnosticsMode } from './upstream/diagnostics'
import {
  identityProfile, exampleDivergentProfile,
  type UpstreamNormalizationProfile,
} from './rawUpstream'

// ─────────────────────────────────────────────────────────────────────────
// Adapter singleton + factory.
//
// The UI imports `getResearchAdapter()` and never constructs an adapter
// directly. Which concrete implementation is returned depends on the
// selected mode:
//
//   upstream   → HttpResearchAdapter → external upstream API (production)
//   local      → HttpResearchAdapter → local server/ (dev harness)
//   mock       → MockResearchAdapter (in-memory fixtures + engine)
//   mock-http  → HttpResearchAdapter + stub fetch backed by MockResearchAdapter
//
// The externally-supplied bootstrap (token, scope hints, onUnauthenticated
// callback) is read from `scopeBootstrap.ts` — this file never reads host
// globals or auth state directly.
//
// See docs/architecture.md and docs/modes.md.
// ─────────────────────────────────────────────────────────────────────────

// NB: declaration order matters — `readActiveMode()` writes to `activeMode`,
// so `activeMode` must exist before `createAdapterFromEnv()` (which calls
// `readActiveMode()` internally) runs.
let activeMode: AdapterMode = normalizeAdapterMode(undefined)
let adapterInstance: ResearchAdapter = withDiagnostics(createAdapterFromEnv())
setDiagnosticsMode(activeMode)

export function getResearchAdapter(): ResearchAdapter {
  return adapterInstance
}

export function setResearchAdapter(next: ResearchAdapter): void {
  adapterInstance = withDiagnostics(next)
}

/** Which mode the active adapter is running in. Read-only after bootstrap. */
export function getActiveAdapterMode(): AdapterMode {
  return activeMode
}

/**
 * Env-driven factory. Called once at module load; the host can override by
 * calling `setResearchAdapter()` after bootstrap.
 *
 *   VITE_RESEARCH_ADAPTER  upstream | local | mock (default) | mock-http
 *   VITE_API_BASE_URL      required when mode=upstream or mode=local
 *   VITE_API_TOKEN         dev fallback bearer token; host injection is preferred
 *
 * See .env.example and docs/modes.md for the full contract.
 */
export function createAdapterFromEnv(): ResearchAdapter {
  const mode = readActiveMode()

  if (mode === 'upstream' || mode === 'local') {
    const baseUrl = import.meta.env.VITE_API_BASE_URL
    if (!baseUrl) {
      throw new Error(
        `VITE_API_BASE_URL is required when VITE_RESEARCH_ADAPTER=${mode}. ` +
        `Point it at the external upstream API for mode=upstream, or at the local ` +
        `server (default http://localhost:4000) for mode=local.`,
      )
    }
    const bootstrap = readScopeBootstrap()
    return new HttpResearchAdapter({
      baseUrl,
      authToken: bootstrap.token ?? import.meta.env.VITE_API_TOKEN,
      onUnauthenticated: bootstrap.onUnauthenticated,
      normalizationProfile: resolveNormalizationProfile(bootstrap.normalizationProfile),
    })
  }

  if (mode === 'mock-http') {
    // Full HTTP code path (client + parsers + error mapping) against a stub
    // fetch backed by MockResearchAdapter. Used by the adapter-layer tests
    // to exercise contract behavior without a live server.
    const mockBacking = new MockResearchAdapter({ simulatedLatencyMs: 0 })
    return new HttpResearchAdapter({
      baseUrl: 'http://stub.local',
      fetchImpl: createStubFetch(mockBacking),
    })
  }

  if (mode === 'upstream-fixture') {
    // Integration-rehearsal mode: serve the canonical upstream JSON fixtures
    // through the translation layer. See docs/upstream-contract.md.
    return new FixtureUpstreamAdapter()
  }

  return new MockResearchAdapter()
}

/**
 * Resolve the normalization profile to hand to the HTTP client:
 *   1. If the host bootstrap object supplied one, use it verbatim.
 *   2. Else, map `VITE_UPSTREAM_PROFILE` to a bundled profile
 *      (`identity` by default, `example` for the demonstration profile).
 *   3. Fall back to the identity profile — byte-for-byte unchanged.
 */
function resolveNormalizationProfile(hostProfile: unknown): UpstreamNormalizationProfile {
  if (isProfile(hostProfile)) return hostProfile
  const envName = (import.meta.env.VITE_UPSTREAM_PROFILE as string | undefined)?.trim()
  if (envName === 'example' || envName === 'example-divergent') return exampleDivergentProfile
  return identityProfile
}

function isProfile(v: unknown): v is UpstreamNormalizationProfile {
  return !!v && typeof v === 'object'
    && typeof (v as UpstreamNormalizationProfile).name === 'string'
    && typeof (v as UpstreamNormalizationProfile).defaultNormalizer === 'function'
    && typeof (v as UpstreamNormalizationProfile).endpoints === 'object'
}

function readActiveMode(): AdapterMode {
  const raw = import.meta.env.VITE_RESEARCH_ADAPTER as string | undefined
  const mode = normalizeAdapterMode(raw)
  if (raw && raw !== mode && mode !== normalizeAdapterMode(undefined)) {
    // A legacy alias was mapped (e.g. 'http' → 'upstream'). Note the remap
    // but don't fail loudly — back-compat is the point.
    // eslint-disable-next-line no-console
    console.info(`[adapter] VITE_RESEARCH_ADAPTER="${raw}" normalized to "${mode}"`)
  } else if (raw && !['upstream', 'local', 'mock', 'mock-http', 'upstream-fixture'].includes(raw)) {
    // eslint-disable-next-line no-console
    console.warn(`[adapter] Unknown VITE_RESEARCH_ADAPTER="${raw}"; falling back to "mock".`)
  }
  activeMode = mode
  return mode
}

export type { ResearchAdapter } from './ResearchAdapter'
export { MockResearchAdapter } from './MockResearchAdapter'
export { HttpResearchAdapter } from './HttpResearchAdapter'
export type { AdapterMode } from './AdapterMode'
export { ADAPTER_MODES, isProductionMode, isHttpMode } from './AdapterMode'
export type {
  ListEmailsQuery, ListReportsQuery,
  ListOpinionsQuery, ListClosuresQuery,
} from './queries'
export {
  AdapterError, OrgScopeViolationError, NotFoundError,
  InvalidQueryError, UnauthenticatedError, ContractViolationError,
} from './errors'
