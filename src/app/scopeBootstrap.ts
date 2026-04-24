// ─────────────────────────────────────────────────────────────────────────
// Externally-supplied scope bootstrap.
//
// The dashboard does NOT authenticate users and does NOT mint tokens. Those
// are upstream concerns. This module is the single read-only entry point
// through which the *host* (whatever product embeds or links to this
// dashboard) supplies:
//
//   - an externally-minted bearer token (required for `upstream` mode)
//   - optional scope hints: orgId, actingUserId
//   - an optional "onUnauthenticated" callback the host uses to re-mint a
//     token when the current one expires
//
// Supported bootstrap sources, in order of priority:
//
//   1. `window.__BROKER_RESEARCH_DASHBOARD__`                (host injection)
//   2. URL query params `?token=...&orgId=...&actingUserId=...`  (link mode)
//   3. Vite env (`VITE_API_TOKEN`, etc.)                       (dev only)
//
// Nothing here verifies a token — that is always the upstream API's job.
// `getSessionScope()` on the adapter is what actually resolves the scope
// the UI runs under; the values read here only feed the HTTP client (for
// auth headers) and pre-seed scope hints where relevant.
// ─────────────────────────────────────────────────────────────────────────

export interface ExternalScopeBootstrap {
  /** Externally-minted bearer token, or a getter that returns one. */
  readonly token?: string | (() => string | null | undefined | Promise<string | null | undefined>)

  /** Optional scope hints. The adapter's `getSessionScope()` is still
   *  authoritative — these are used only for headers when the client cannot
   *  resolve them from the token alone. */
  readonly orgIdHint?: string
  readonly actingUserIdHint?: string

  /** Called when the upstream returns 401. The host can use this to refresh
   *  the token out-of-band (e.g. prompt a parent frame to re-mint). */
  readonly onUnauthenticated?: () => void

  /** Optional host-provided label for diagnostics (e.g. "Vimana Desk v2.4"). */
  readonly hostLabel?: string

  /**
   * Optional raw-upstream → `/v1` normalization profile. When present,
   * applied at the HTTP boundary before the `/v1` mappers see a
   * response. Hosts use this to absorb vendor-specific payload shapes
   * without modifying this repo. See
   * `docs/upstream-normalization-bridge.md`. Kept as `unknown` here so
   * the bootstrap contract does not depend on the full type surface.
   */
  readonly normalizationProfile?: unknown
}

declare global {
  interface Window {
    __BROKER_RESEARCH_DASHBOARD__?: ExternalScopeBootstrap
  }
}

/**
 * Resolve the active bootstrap config from the first source that provides
 * anything useful. Returns an empty object when nothing is supplied — the
 * adapter factory then falls back to env-only behavior.
 */
export function readScopeBootstrap(): ExternalScopeBootstrap {
  const fromWindow = typeof window !== 'undefined' ? window.__BROKER_RESEARCH_DASHBOARD__ : undefined
  if (fromWindow && hasAnyField(fromWindow)) return fromWindow

  const fromUrl = readFromUrl()
  if (fromUrl) return fromUrl

  const fromEnv = readFromEnv()
  if (fromEnv) return fromEnv

  return {}
}

/**
 * Register a subscriber that fires when the host replaces
 * `window.__BROKER_RESEARCH_DASHBOARD__` or when a scope-change event is
 * posted from a parent frame. Used by `ScopeContext` to invalidate all
 * in-flight queries on scope swap, preventing cross-tenant data mixing.
 */
export function onScopeBootstrapChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => { /* noop on server */ }

  const onMessage = (ev: MessageEvent) => {
    if (ev.data && (ev.data as { type?: string }).type === 'broker-research:scope-changed') {
      listener()
    }
  }
  window.addEventListener('message', onMessage)

  // Polling the window global is a last resort for hosts that mutate it in
  // place rather than posting a message. Cheap: shallow identity compare.
  let snapshot = window.__BROKER_RESEARCH_DASHBOARD__
  const intervalId = window.setInterval(() => {
    const current = window.__BROKER_RESEARCH_DASHBOARD__
    if (current !== snapshot) {
      snapshot = current
      listener()
    }
  }, 2000)

  return () => {
    window.removeEventListener('message', onMessage)
    window.clearInterval(intervalId)
  }
}

// ── Internals ────────────────────────────────────────────────────────────

function hasAnyField(b: ExternalScopeBootstrap): boolean {
  return b.token !== undefined
    || b.orgIdHint !== undefined
    || b.actingUserIdHint !== undefined
    || b.onUnauthenticated !== undefined
    || b.hostLabel !== undefined
}

function readFromUrl(): ExternalScopeBootstrap | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? undefined
  const orgIdHint = params.get('orgId') ?? undefined
  const actingUserIdHint = params.get('actingUserId') ?? undefined
  if (!token && !orgIdHint && !actingUserIdHint) return null
  return { token, orgIdHint, actingUserIdHint }
}

function readFromEnv(): ExternalScopeBootstrap | null {
  const token = import.meta.env.VITE_API_TOKEN
  if (!token) return null
  return { token }
}
