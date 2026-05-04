// Runtime modes the dashboard can boot into. Exactly one mode is active per
// process; the choice is made by `createAdapterFromEnv()` in
// `src/adapters/index.ts` based on `VITE_RESEARCH_ADAPTER`.
//
// The *intended production path* is `upstream` — every other mode is a dev
// convenience or a test harness. See docs/modes.md for the full decision
// matrix.

export type AdapterMode =
  // Default runtime path. The dashboard reads from a single
  // `DashboardServerOutput` payload produced by the cofounder's server
  // (server-side email fetch + LLM extraction). No mocks, no fake data —
  // when no payload exists yet the dashboard renders its full shell with
  // placeholders ("Awaiting server output", "—", skeleton rows).
  | 'server'

  // Production path that talks to a fully-implemented external upstream API
  // (legacy contract). Kept for backward compatibility with deployments
  // that still wire the per-resource HTTP endpoints. New deployments
  // should prefer `server` and have the cofounder's server emit the
  // `DashboardServerOutput` envelope.
  | 'upstream'

  // Local dev harness. Same HTTP contract as `upstream` but pointed at the
  // local server/ process. Dev-only.
  | 'local'

  // In-memory mock — DEV ONLY. Fixtures + deterministic engine wired into
  // `MockResearchAdapter`. Useful for Storybook, component tests, and
  // offline UI work. Never runs in production. Opt in with
  // VITE_RESEARCH_ADAPTER=mock.
  | 'mock'

  // HTTP code path against a stub fetch backed by MockResearchAdapter.
  // Adapter-layer regression tests only.
  | 'mock-http'

  // FixtureUpstreamAdapter — serves `src/adapters/upstream/fixtures/*.json`
  // through the canonical mapper layer. Integration-rehearsal mode for
  // exercising the wire-shape handshake before the real upstream is live.
  // See docs/upstream-contract.md.
  | 'upstream-fixture'

export const ADAPTER_MODES: readonly AdapterMode[] = [
  'server', 'upstream', 'local', 'mock', 'mock-http', 'upstream-fixture',
] as const

/** True iff the given mode indicates a production runtime (server payload
 *  or HTTP upstream). Mock modes return false. */
export function isProductionMode(mode: AdapterMode): boolean {
  return mode === 'server' || mode === 'upstream'
}

/** True iff the given mode routes requests over HTTP (upstream *or* local). */
export function isHttpMode(mode: AdapterMode): boolean {
  return mode === 'upstream' || mode === 'local' || mode === 'mock-http'
}

/**
 * Back-compat: older `.env` files used `http`/`http-stub`. Map them to the
 * current mode vocabulary so stale envs keep working while the rename
 * settles.
 */
export function normalizeAdapterMode(raw: string | undefined): AdapterMode {
  switch (raw) {
    case 'server':           return 'server'
    case 'upstream':         return 'upstream'
    case 'local':            return 'local'
    case 'mock':             return 'mock'
    case 'mock-http':        return 'mock-http'
    case 'upstream-fixture': return 'upstream-fixture'
    // Legacy aliases
    case 'http':             return 'upstream'
    case 'http-stub':        return 'mock-http'
    case undefined:          return 'server'
    default:
      // Caller logs a warning; we still return something sane.
      return 'server'
  }
}
