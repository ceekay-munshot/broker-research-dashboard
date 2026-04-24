# Broker Research Dashboard — Upstream API Contract

> **Audience:** the external upstream API team.
> **Purpose:** give you everything you need to ship a payload this
> dashboard can consume without changes.

This dashboard is a read-only analytics client. It does not ingest mail,
authenticate users, or enforce tenant isolation — all three are your
responsibility. This doc covers the handshake between your API and this
client:

1. What canonical data the dashboard needs.
2. The preferred JSON response shape per endpoint.
3. Required vs optional fields (per endpoint).
4. How translation works if your shape differs from ours.
5. How to verify compatibility with one command.
6. How org scoping must appear on the wire.

## 1. Canonical data model

The dashboard's canonical domain is TypeScript source-of-truth:

- `src/domain/` — entities (Organization, User, Broker, Sector, Stock,
  BrokerEmail, Attachment, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, KpiSnapshot, IngestionStatus).
- `src/engine/types.ts` — derived aggregates (ConflictClosure,
  SectorIntelligence).

Every field the dashboard reads is declared there. If a field is absent
from those files, the dashboard does not use it — you do not need to ship it.

## 2. Preferred response shapes

The preferred on-wire JSON shape is **exactly** the canonical domain shape:
camelCase keys, ISO-8601 UTC timestamps, and numbers as plain JSON numbers.
Realistic examples for every resource ship as fixtures under
[`src/adapters/upstream/fixtures/`](../src/adapters/upstream/fixtures/). Treat
those as the reference implementation. One-liner examples:

```http
GET /v1/session/scope
→ { "orgId": "org_acme", "actingUserId": "usr_demo" }
```

```http
GET /v1/organization
→ {
    "id": "org_acme",
    "name": "Acme Capital Partners LLP",
    "shortName": "Acme",
    "forwardingAddress": "research@acme.broker-research.example.com",
    "createdAt": "2026-01-15T08:30:00.000Z",
    "enabledBrokerIds": ["brk_kotak", "brk_jmfin", "brk_iifl"],
    "timeZone": "Asia/Kolkata",
    "defaultCurrency": "INR"
  }
```

```http
GET /v1/research-reports
→ {
    "items": [ /* ResearchReport[] */ ],
    "nextCursor": null,
    "totalCount": 2
  }
```

See the fixture files for every endpoint; they are the contract.

## 3. Required vs optional (matrix)

| Endpoint                                   | Requirement  | Dashboard behavior if 404 |
| ------------------------------------------ | ------------ | ------------------------- |
| `GET /v1/session/scope`                    | **required** | Bootstrap fails           |
| `GET /v1/organization`                     | **required** | Bootstrap fails           |
| `GET /v1/me`                               | **required** | Bootstrap fails           |
| `GET /v1/brokers`                          | **required** | Filters fail              |
| `GET /v1/sectors`                          | **required** | Filters fail              |
| `GET /v1/stocks`                           | **required** | Filters fail              |
| `GET /v1/broker-emails`                    | list         | Empty list                |
| `GET /v1/broker-emails/:id`                | optional     | "Not found" state         |
| `GET /v1/broker-emails/:id/attachments`    | list         | Empty list                |
| `GET /v1/research-reports`                 | **required** | Dashboard unusable        |
| `GET /v1/research-reports/:id`             | optional     | "Not found" state         |
| `GET /v1/research-reports/:id/summary`     | optional     | Empty summary rendered    |
| `GET /v1/research-reports/:id/evidence`    | list         | Empty list                |
| `GET /v1/opinions`                         | list         | Empty list                |
| `GET /v1/conflict-closures`                | derived      | Empty list                |
| `GET /v1/conflict-closures/:ticker`        | derived      | "Not yet computed" state  |
| `GET /v1/sector-intelligence`              | derived      | Empty list                |
| `GET /v1/sector-intelligence/:sectorId`    | derived      | "Not yet computed" state  |
| `GET /v1/kpi-snapshot`                     | **required** | Dashboard header empty    |
| `GET /v1/ingestion-status`                 | **required** | Header chip shows zero    |

The authoritative list lives in
[`src/adapters/upstream/degraded.ts::RESOURCE_CATALOG`](../src/adapters/upstream/degraded.ts),
with a one-line description per resource. Required vs optional on the
**field level** is documented inline in
[`src/adapters/upstream/types.ts`](../src/adapters/upstream/types.ts).

Fields marked optional there can be omitted from the payload; the
translation layer fills the canonical default. **Required** fields, if
omitted, throw `ContractViolationError` in the client and render an error
state in the UI.

## 4. Translation layer

We ship a translation layer at
[`src/adapters/upstream/mappers.ts`](../src/adapters/upstream/mappers.ts)
that sits between your payload and the canonical domain. Today every
mapper is a near-identity function (your preferred shape matches our
canonical shape). If your shape diverges — snake_case, wrapped envelopes
(`{ data: … }`), renamed fields, extra metadata blocks — the mapper is
where the change happens. **The UI and view models never see your wire
shape; they only ever see canonical domain objects.**

Examples of shape divergences the mappers can absorb without the UI
noticing:

- `snake_case` → camelCase key renames.
- `{ data: [...], meta: { cursor } }` envelope → flatten to `Page<T>`.
- `updated_at` → `lastUpdatedAt`.
- Numeric strings → numbers.
- Missing-field defaults (`timeZone`, `defaultCurrency`, etc.).

> **Onboarding quick-start**: drop your sample payloads into
> [`upstream-samples/`](../upstream-samples/) and run `npm run upstream:ready`.
> Full workflow in [`docs/upstream-onboarding.md`](./upstream-onboarding.md).

> **Wire-shape differs from `/v1`?** Write a normalization profile.
> This dashboard has a raw-upstream → `/v1` bridge at the HTTP boundary
> so you do not have to mold your payloads to match the contract below.
> See [`docs/upstream-normalization-bridge.md`](./upstream-normalization-bridge.md).

## 5. Verify compatibility

The contract-test harness runs every fixture through the mapper pipeline
and asserts the canonical output. Point it at *your* payloads by replacing
the JSON files in [`src/adapters/upstream/fixtures/`](../src/adapters/upstream/fixtures/)
with your sample responses, then run:

```bash
npm run test:contract
```

A passing run means your payloads speak the contract this dashboard
expects. A failing run prints a precise field path
(`[upstream:organization] Organization.enabledBrokerIds[0]: expected string,
got number`) so the fix is obvious.

You can also run the entire dashboard against your fixture set without a
live server:

```bash
VITE_RESEARCH_ADAPTER=upstream-fixture npm run dev
# open http://localhost:5173 — the dashboard renders against the fixtures
```

And against a live deployment of your API:

```bash
VITE_RESEARCH_ADAPTER=upstream VITE_API_BASE_URL=https://your-api.example.com npm run dev
```

## 6. Org scoping on the wire

The dashboard does not authenticate. It sends whatever your host page
hands it through [`src/app/scopeBootstrap.ts`](../src/app/scopeBootstrap.ts)
as the bearer token and optional header hints. Required behavior on your side:

- Every request carries `Authorization: Bearer <token>` once a token is
  configured. The dashboard does not mint, refresh, or introspect it.
- Every request carries `X-Org-Id` and `X-Acting-User-Id` headers. Those
  are advisory — you derive the true scope from the token — but the
  dashboard cross-checks the `orgId` on every returned record against the
  request's `X-Org-Id` and throws `OrgScopeViolationError` on mismatch.
  Never return a record whose `orgId` differs from the request scope.
- Org boundaries: enforce tenant isolation in your authorization layer.
  The dashboard's cross-check is a last-line defense, not a substitute.
- 401 Unauthenticated: return `{ error: { code: "UNAUTHENTICATED", … } }`.
  The dashboard surfaces it via `onUnauthenticated` so the host page can
  mint a fresh token.
- 403 Org-scope violation: return `{ error: { code: "ORG_SCOPE_VIOLATION",
  … } }`. The dashboard surfaces it as `OrgScopeViolationError`.

See [`docs/api-contract.md`](./api-contract.md) for the full error envelope
and [`docs/scope.md`](./scope.md) for how scope flows through the client.

## 7. Day-1 degraded shipping plan

You do not need to ship everything on day 1. The minimum the dashboard
needs to boot and render something is:

1. `GET /v1/session/scope` — returns the scope from the token.
2. `GET /v1/organization` — the tenant.
3. `GET /v1/me` — the user.
4. `GET /v1/brokers`, `/v1/sectors`, `/v1/stocks` — catalog, can be empty.
5. `GET /v1/research-reports` — empty `items` is fine.
6. `GET /v1/kpi-snapshot` — zeros are fine.
7. `GET /v1/ingestion-status` — zeros are fine.

All other endpoints can 404 on day 1; the dashboard renders empty states
and keeps working. Derived analytics (conflict closures, sector
intelligence) are the last to ship.

## 8. Where to look

- Canonical types: [`src/domain/`](../src/domain/)
- Upstream wire types: [`src/adapters/upstream/types.ts`](../src/adapters/upstream/types.ts)
- Mappers: [`src/adapters/upstream/mappers.ts`](../src/adapters/upstream/mappers.ts)
- Required/optional catalog: [`src/adapters/upstream/degraded.ts`](../src/adapters/upstream/degraded.ts)
- Sample payloads: [`src/adapters/upstream/fixtures/`](../src/adapters/upstream/fixtures/)
- Contract tests: [`src/adapters/upstream/__tests__/contract.ts`](../src/adapters/upstream/__tests__/contract.ts)
- API contract (full error shape, pagination): [`docs/api-contract.md`](./api-contract.md)
- Scope + token flow: [`docs/scope.md`](./scope.md)
