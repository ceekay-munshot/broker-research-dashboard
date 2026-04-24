# Raw-upstream → `/v1` normalization bridge

> The layer that sits at the HTTP boundary, below the canonical `/v1`
> contract, turning whatever the real upstream wire format looks like
> into `/v1`-shaped JSON.

## Why this exists

Everything above the HTTP client — the mapper layer
(`src/adapters/upstream/`), canonical domain types (`src/domain/`),
view-models (`src/viewModels/`), and the UI (Daily Worklog, change
detection, By Stock, By Broker, Divergence, …) — was built against a
stable documented `/v1` contract (see [`docs/api-contract.md`](./api-contract.md)).

Real upstreams rarely speak the exact contract. They wrap responses in
envelopes, use snake_case, rename primary keys, return bare arrays
where a `Page<T>` is expected, ship numeric strings, and so on.

Rather than leak those differences into every consumer, this repo
ships a **normalization bridge**: a single layer that normalizes raw
wire payloads into the `/v1` shape *before* anything else runs. The
consumer layers never know the upstream wasn't `/v1` to begin with.

## The two-stage model

```
raw upstream JSON
      │
      │   ┌── Stage 1 — NEW ─────────────────────────────────────┐
      │   │  src/adapters/rawUpstream/                           │
      │   │  normalizeRawUpstream(raw, endpointKey, profile)     │
      │   │    • unwrap envelopes ({data}, {response}, …)        │
      │   │    • snake_case → camelCase                          │
      │   │    • rename / alias ID fields                        │
      │   │    • wrap bare arrays as Page<T>                     │
      │   │    • coerce numeric strings at known sites           │
      │   └──────────────────────────────────────────────────────┘
      ▼
/v1-shaped JSON                          ←── stable internal seam
      │
      │   ┌── Stage 2 — existing ────────────────────────────────┐
      │   │  src/adapters/upstream/                              │
      │   │  mappers → canonical domain objects                  │
      │   │  strict type checking via parsers                    │
      │   │  orgId cross-check guardrails                        │
      │   └──────────────────────────────────────────────────────┘
      ▼
Canonical domain
      │
      ▼
view-models (worklog / broker-memory / stock / broker / divergence)
      │
      ▼
UI  (Daily Worklog, Change tab, Latest broker changes, What changed recently, …)
```

Stage 2 and everything below it is **untouched** by this bridge. The
Daily Worklog, the Change detection rule table, the per-stock broker
changes rail, the per-broker "what changed recently" panel — all of
them continue to consume `/v1`-shaped data and the canonical domain,
unchanged.

## Where the code lives

| File                                                                            | Purpose                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`types.ts`](../src/adapters/rawUpstream/types.ts)                              | `EndpointNormalizer`, `UpstreamNormalizationProfile` |
| [`bridge.ts`](../src/adapters/rawUpstream/bridge.ts)                            | `normalizeRawUpstream(raw, key, profile)` entry     |
| [`transforms.ts`](../src/adapters/rawUpstream/transforms.ts)                    | Composable primitives (compose, unwrap, camelCase, …)|
| [`profiles/identity.ts`](../src/adapters/rawUpstream/profiles/identity.ts)      | Default profile — no-op                              |
| [`profiles/exampleDivergent.ts`](../src/adapters/rawUpstream/profiles/exampleDivergent.ts) | Demonstration profile for a divergent vendor |
| [`__tests__/bridge.ts`](../src/adapters/rawUpstream/__tests__/bridge.ts)        | Contract tests (`npm run test:bridge`)               |

## Profile authoring

A profile is a name + per-endpoint normalizer map + a default
normalizer used when no per-endpoint entry is defined:

```ts
import {
  compose, unwrapEnvelope, camelCaseKeys, rename, wrapAsPage,
  coerceNumericFields, mapPageItems,
  type UpstreamNormalizationProfile,
} from '../../adapters/rawUpstream'

export const vendorAcmeProfile: UpstreamNormalizationProfile = {
  name: 'vendor-acme',
  description: 'Acme vendor: envelope + snake_case + alt IDs.',

  defaultNormalizer: compose(unwrapEnvelope(), camelCaseKeys()),

  endpoints: {
    organization: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'id' }),
    ),
    researchReports: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      wrapAsPage({ itemsAt: 'results', cursorFrom: 'next', totalFrom: 'count' }),
      mapPageItems(rename({ organizationId: 'orgId' })),
    ),
    reportSummary: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'orgId' }),
      coerceNumericFields(['targetPrice', 'priorTargetPrice', 'confidence']),
    ),
    // ... etc.
  },
}
```

### Available transforms

| Transform                                     | What it does                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| `compose(f, g, h)`                            | Left-to-right composition: `h(g(f(x)))`                    |
| `identity`                                    | `(x) => x` — marker for "already canonical"                |
| `unwrapEnvelope(keys?)`                       | Recursively collapse `{ <key>: inner }` single-key objects |
| `camelCaseKeys()`                             | Recursive `snake_case` → `camelCase`                        |
| `rename({ from: to, … })`                     | Move one or more keys to canonical names                    |
| `alias(canonical, [aliasA, aliasB, …])`       | Accept first-seen alias as canonical                        |
| `at(path, fn)`                                | Run a transform at a nested dot-path                        |
| `pluck(path)`                                 | Return a nested value, or input if path missing             |
| `wrapAsPage({ itemsAt, cursorFrom, totalFrom })`| Normalize any pageable shape to `{ items, nextCursor, totalCount }` |
| `mapArray(fn)`                                | Apply a transform to every element of an array              |
| `mapPageItems(fn)`                            | Apply a transform to every `Page<T>.items[i]`              |
| `coerceNumericFields(['a', 'b'])`             | Turn numeric strings into numbers at named fields           |

### Endpoint keys

Every endpoint key the dashboard uses comes from `RESOURCE_CATALOG` in
[`src/adapters/upstream/degraded.ts`](../src/adapters/upstream/degraded.ts).
Use those exact keys in `profile.endpoints`:

```
sessionScope · organization · currentUser
brokers · sectors · stocks
brokerEmails · brokerEmail · attachments
researchReports · researchReport · reportSummary · reportEvidence
opinions · conflictClosures · conflictClosure
sectorIntelligence · sectorIntelligenceFor
kpiSnapshot · ingestionStatus
```

## Selecting a profile at runtime

In priority order:

1. **Host injection.** The host page sets
   `window.__BROKER_RESEARCH_DASHBOARD__.normalizationProfile` to a
   full profile object before the dashboard boots. This is the
   production pattern — ship a vendor profile alongside the dashboard,
   inject it via the bootstrap.
2. **Env selector.** `VITE_UPSTREAM_PROFILE=example` (or
   `example-divergent`) selects a bundled profile. Default is
   `identity`.
3. **Identity.** If nothing is configured, every response passes
   through untouched. The dashboard behaves exactly as it did before
   this bridge existed.

The profile is wired into `HttpResearchAdapter` through its
`HttpClientOptions.normalizationProfile`; `HttpClient` runs it on every
response body at the boundary:

```ts
const body = await response.json()
if (config.endpointKey) {
  return normalizeRawUpstream(body, config.endpointKey, this.normalizationProfile)
}
return body
```

## What the bridge does **not** do

- **Does not** talk to React, fetch, or any other runtime. Pure
  JSON-to-JSON transforms.
- **Does not** enforce tenant isolation. The `orgId` cross-check stays
  in `HttpResearchAdapter` and `FixtureUpstreamAdapter`, below the
  bridge.
- **Does not** replace the existing `src/adapters/upstream/` mapper
  layer. That layer still handles:
  - strict type validation (parsers reject shape mismatches with full
    field paths);
  - per-field default filling for optional fields the upstream omits;
  - `ContractViolationError` / `OrgScopeViolationError` surfacing;
  - the contract-test harness against reference fixtures.
- **Does not** redesign any UI. Daily Worklog, change detection, By
  Stock, By Broker, Divergence, and every screen keep consuming the
  same `/v1`-shaped data as before.

## Verifying a new profile

```bash
# 1. Write your profile under src/adapters/rawUpstream/profiles/
# 2. Export it from index.ts (optional — for direct import).
# 3. Run the bridge contract tests:
npm run test:bridge

# 4. Run the existing `/v1` contract tests to confirm the mappers
#    still accept the normalized output:
npm run test:contract

# 5. Optionally rehearse end-to-end in the browser:
VITE_RESEARCH_ADAPTER=upstream \
VITE_API_BASE_URL=https://your-vendor.example.com \
VITE_UPSTREAM_PROFILE=vendor-acme \
npm run dev:upstream
```

Or inject the profile via the bootstrap from a host page:

```html
<script>
  window.__BROKER_RESEARCH_DASHBOARD__ = {
    token: () => getTokenFromHost(),
    normalizationProfile: VENDOR_ACME_PROFILE,   // imported from your build
  }
</script>
```
