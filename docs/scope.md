# Externally-supplied scope

The dashboard is a read-only client. Authentication, token minting,
token refresh, and org / user identity all live in the upstream
system. The dashboard only needs to know:

- the bearer token to put on outbound requests, and
- optional scope hints (`orgId`, `actingUserId`) for headers,

and it needs a way to react cleanly when any of those change.

This module — `src/app/scopeBootstrap.ts` — is the single entry point.

## The contract

```ts
interface ExternalScopeBootstrap {
  token?: string | (() => string | null | undefined | Promise<string | null | undefined>)
  orgIdHint?: string
  actingUserIdHint?: string
  onUnauthenticated?: () => void
  hostLabel?: string
}
```

### `token`

Either a string or a (sync or async) getter. The getter form lets the
host refresh a token lazily — the dashboard calls it before every
outbound request. The dashboard never caches tokens itself.

### `orgIdHint` / `actingUserIdHint`

Advisory headers. `adapter.getSessionScope()` on the upstream remains
the source of truth: the hints are sent on every request so the
upstream can audit-log them, but they are not trusted to identify the
caller.

### `onUnauthenticated`

Fired once per `401` response. The host typically uses this to re-mint
a token out-of-band (e.g. `postMessage` a parent frame). The adapter
still propagates an `UnauthenticatedError` — the callback is a signal,
not a recovery hook.

### `hostLabel`

Free-form diagnostic string; shown nowhere user-facing.

## Sources, in priority order

1. **Host injection** — the host sets
   `window.__BROKER_RESEARCH_DASHBOARD__ = { token, … }` before the app
   mounts. This is the production shape.
2. **URL params** — `?token=…&orgId=…&actingUserId=…` for link-based
   embedding. The dashboard reads these once at boot.
3. **Vite env** — `VITE_API_TOKEN` as a last-resort dev fallback.

## Scope changes at runtime

The host can swap the scope at any time. Two signals are supported:

- `window.postMessage({ type: 'broker-research:scope-changed' }, '*')`
- Replacing `window.__BROKER_RESEARCH_DASHBOARD__` in place.

Either triggers:

1. `ScopeContext` clears the current scope and bumps `generation`.
2. Every `useAdapterQuery` subscriber drops its cached data
   (because `generation` is in its effective dep set).
3. The adapter's `getSessionScope()` re-runs under the new token.
4. Views re-fetch from an empty state under the new scope.

The window between "old scope cleared" and "new scope resolved" shows
the loading state. The UI never renders data from the old scope under
the new one.

## Host integration example

```html
<!-- parent page -->
<iframe src="https://research.example.com/dashboard"></iframe>

<script>
  // Inject the bootstrap *before* the iframe's first paint — either
  // inline in the iframe document, or via postMessage from the parent.
  const iframe = document.querySelector('iframe')
  iframe.contentWindow.__BROKER_RESEARCH_DASHBOARD__ = {
    token: () => currentAccessTokenFromSession(),
    orgIdHint: 'org_vimana',
    actingUserIdHint: 'usr_arjun',
    onUnauthenticated: () => refreshToken().then(() => {
      iframe.contentWindow.postMessage({ type: 'broker-research:scope-changed' }, '*')
    }),
    hostLabel: 'Vimana Desk v2.4',
  }
</script>
```

## What the dashboard does NOT do

- Does not call any auth endpoint.
- Does not open a login screen.
- Does not persist tokens.
- Does not introspect tokens (no JWT parsing, no claims check).
- Does not refresh tokens; it only *asks* the host via
  `onUnauthenticated`.

Authentication and tenant isolation remain strictly upstream
responsibilities.
