# Runtime modes

The dashboard picks one of four adapter modes at boot, driven by
`VITE_RESEARCH_ADAPTER`. The UI, domain, selectors, and views are the
same across all four — only the data source changes.

## Decision matrix

| Mode               | Data source                                     | Network? | Use it for                                              |
| ------------------ | ----------------------------------------------- | -------- | ------------------------------------------------------- |
| `upstream`         | External upstream API                           | Yes      | **Production**                                          |
| `local`            | Local `server/` process                         | Yes      | Iterating on adapter / parsers / UI with the full stack |
| `mock`             | `src/mocks/*` + `src/engine/` in-process        | No       | Offline dev, Storybook, component-level work            |
| `mock-http`        | `HttpResearchAdapter` over a stub `fetch`       | No       | Adapter-layer tests that exercise parsers & error paths |
| `upstream-fixture` | `FixtureUpstreamAdapter` over bundled JSON      | No       | Integration rehearsal against the upstream wire shape   |

Legacy values `http` (→ `upstream`) and `http-stub` (→ `mock-http`) are
still accepted for back-compat.

## Commands

```bash
# mock (default) — no backend needed, instant
npm run dev

# local dev harness — start server first, then UI
npm run server:dev           # terminal A: localhost:4000
npm run dev:local            # terminal B: UI wired to :4000

# upstream — production shape, pointed at a real API
VITE_API_BASE_URL=https://api.example.com npm run dev:upstream

# upstream-fixture — integration rehearsal against bundled JSON fixtures
npm run dev:upstream-fixture

# typecheck both client and server
npm run typecheck

# run the upstream contract tests
npm run test:contract

# when the upstream team shares sample payloads — drop into
# upstream-samples/ and run the one-command readiness check.
npm run upstream:ready

# field-level diff between samples and reference fixtures
npm run upstream:compare
```

## Required env per mode

| Variable            | `upstream` | `local` | `mock` | `mock-http` | `upstream-fixture` |
| ------------------- | ---------- | ------- | ------ | ----------- | ------------------ |
| `VITE_API_BASE_URL` | required   | required| –      | –           | –                  |
| `VITE_API_TOKEN`    | dev only¹  | optional| –      | –           | –                  |

¹ In production, the host injects the token via
`window.__BROKER_RESEARCH_DASHBOARD__` — `VITE_API_TOKEN` is a dev
fallback only. See [`scope.md`](./scope.md).

## What each mode guarantees

### `upstream`
- Bearer token, `X-Org-Id`, `X-Acting-User-Id` on every request.
- Full contract validation — a malformed response throws
  `ContractViolationError` with a field path.
- Cross-tenant guardrail: every record's `orgId` is cross-checked
  against the request scope.
- The upstream is the system of record; no writes originate here.

### `local`
- Identical HTTP contract to `upstream`, pointed at the local
  `server/` process. The server reads `.eml` fixtures from
  `server/fixtures/` and serves them out of an in-memory store.
- Intended only for dev. Nothing in `server/` is production-ready.

### `mock`
- No network. `MockResearchAdapter` serves fixtures in-process and
  runs the deterministic engine layer on demand.
- Simulated latency (~80ms) so loading states look production-ish.
- The right default for component work.

### `mock-http`
- The full HTTP code path — `HttpClient`, parsers, error mapping,
  query encoding — routed through a stub `fetch` backed by the mock
  adapter. Use this to catch parser or error-mapping regressions
  without a live server.

### `upstream-fixture`
- Serves the canonical upstream JSON fixtures in
  `src/adapters/upstream/fixtures/` through the translation layer.
- The wire shape exercised here matches what the external upstream
  API is expected to return. Use for integration rehearsal before
  the real API is available, or to drive visual review of new UI
  changes against realistic upstream payloads.

## Picking a mode

```
Need real upstream data?        → upstream
Integration rehearsal offline?  → upstream-fixture
Working on adapter / parsers?   → local or mock-http
Working on UI only?             → mock
Writing adapter-layer tests?    → mock-http
Demoing offline?                → mock
```
