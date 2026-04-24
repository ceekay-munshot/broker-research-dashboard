// Runtime modes the dashboard can boot into. Exactly one mode is active per
// process; the choice is made by `createAdapterFromEnv()` in
// `src/adapters/index.ts` based on `VITE_RESEARCH_ADAPTER`.
//
// The *intended production path* is `upstream` — every other mode is a dev
// convenience or a test harness. See docs/modes.md for the full decision
// matrix.

export type AdapterMode =
  // Production path. The UI talks to the external upstream API that is the
  // source of truth for ingested broker research, authentication, and
  // org-scoped isolation. Nothing in this repo ingests mail or authenticates
  // users in this mode — the dashboard is a read-only analytics client.
  | 'upstream'

  // Local dev harness. The UI talks to the same HTTP contract as `upstream`
  // but pointed at the local server/ process, which parses .eml fixtures and
  // serves them from an InMemoryStore. Intended for iterating on the adapter,
  // parsers, and UI without a live upstream. Not suitable for any
  // customer-facing deployment.
  | 'local'

  // In-memory mock. No network, no server. Fixtures + deterministic engine
  // are wired directly into `MockResearchAdapter`. Fast, offline-friendly,
  // and the right mode for Storybook, component tests, and quick UI work.
  | 'mock'

  // HttpResearchAdapter routed through a stub fetch that is backed by
  // `MockResearchAdapter`. Exercises the full HTTP code path — parsers,
  // error mapping, query encoding — without a live server. Intended for
  // regression tests of the adapter layer itself.
  | 'mock-http'

export const ADAPTER_MODES: readonly AdapterMode[] = [
  'upstream', 'local', 'mock', 'mock-http',
] as const

/** True iff the given mode indicates production (hits the real upstream API). */
export function isProductionMode(mode: AdapterMode): boolean {
  return mode === 'upstream'
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
    case 'upstream':  return 'upstream'
    case 'local':     return 'local'
    case 'mock':      return 'mock'
    case 'mock-http': return 'mock-http'
    // Legacy aliases
    case 'http':      return 'upstream'
    case 'http-stub': return 'mock-http'
    case undefined:   return 'mock'
    default:
      // Caller logs a warning; we still return something sane.
      return 'mock'
  }
}
