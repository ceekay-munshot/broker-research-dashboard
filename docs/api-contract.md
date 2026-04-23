# Broker Research Dashboard — Backend API contract

This document specifies the exact HTTP contract the backend has to satisfy
for the current frontend and engine. It is **read-only** — no write
endpoints are defined and the frontend never attempts writes.

The canonical reference for every JSON shape is the TypeScript types in
`src/domain/` and `src/engine/types.ts`. The parsers in
`src/adapters/http/parsers.ts` are authoritative: any field they reject
with `ContractViolationError` is out-of-contract.

## 1. Conventions

- **Transport:** HTTPS. JSON request/response bodies. UTF-8.
- **Base URL:** configured per environment via `VITE_API_BASE_URL`. All
  paths in this document are appended verbatim (no trailing slash on the
  base).
- **Version prefix:** every path begins with `/v1/`.
- **Casing:** paths are kebab-case; JSON field names are camelCase.
- **Timestamps:** ISO-8601 UTC strings, `YYYY-MM-DDTHH:mm:ss.sssZ`.
- **IDs:** opaque strings (`org_*`, `brk_*`, `eml_*`, `rpt_*`, `sum_*`,
  `ev_*`, `att_*`, `sec_*`, `job_*`). Tickers are NSE-style uppercase
  identifiers (`TCS`, `RELIANCE`, …).
- **Currency:** ISO-4217 codes (`INR`, `USD`). Monetary numbers are
  plain numbers (no string wrapping).

## 2. Authentication + scope

Every request carries:

| Header              | Source                                 | Required                              |
| ------------------- | -------------------------------------- | ------------------------------------- |
| `Authorization`     | `Bearer <token>` from `VITE_API_TOKEN` | when a token is configured            |
| `X-Org-Id`          | `OrgScope.orgId`                       | always except `/v1/session/scope`     |
| `X-Acting-User-Id`  | `OrgScope.actingUserId`                | always except `/v1/session/scope`     |
| `Accept`            | `application/json`                     | always                                |

The server is the source of truth for authorization. It cross-checks the
bearer token against `X-Org-Id`; any mismatch returns `403
ORG_SCOPE_VIOLATION`. `X-Acting-User-Id` is advisory (the server can
extract the user from the token) but the frontend always sends it for
audit logs.

## 3. Error envelope

All non-2xx responses use a uniform JSON shape:

```json
{
  "error": {
    "code": "ORG_SCOPE_VIOLATION",
    "message": "user usr_arjun is not a member of org_sahyadri",
    "details": { "optional": "payload" },
    "requestId": "req_abc123"
  }
}
```

HTTP status → error code mapping:

| Status | `code`                  | Frontend class                               |
| ------ | ----------------------- | -------------------------------------------- |
| 400    | `INVALID_QUERY`         | `InvalidQueryError`                          |
| 401    | `UNAUTHENTICATED`       | `UnauthenticatedError`                       |
| 403    | `ORG_SCOPE_VIOLATION`   | `OrgScopeViolationError`                     |
| 404    | `NOT_FOUND`             | `NotFoundError`                              |
| 5xx    | any                     | `AdapterError` (code copied from body)       |

For `GET /v1/<resource>/:id` endpoints the frontend treats 404 as a
domain `null`, not an error. For `GET /v1/<resource>` (list) endpoints a
404 is always an error (the listing endpoint always exists).

## 4. Pagination

List endpoints that return `Page<T>` use an opaque cursor:

```json
{
  "items": [ ... ],
  "nextCursor": "b2Zmc2V0PTUw" | null,
  "totalCount": 412
}
```

Clients send `?cursor=<nextCursor>&limit=<n>` to fetch the next page.
`nextCursor === null` signals end-of-stream. `limit` defaults to 50 on
the server, max 200; the server is free to clamp down silently.

Non-paginated lists (`listBrokers`, `listSectors`, `listAttachments`,
`listEvidenceSnippets`, `listBrokerStockOpinions`, `listConflictClosures`,
`listSectorIntelligence`) return a plain JSON array.

## 5. Filter semantics

Array query params use **comma-separated** values:

```
?brokerIds=brk_kotak,brk_mosl&statuses=ready,parsing
```

Empty arrays are omitted rather than sent as the empty string. All
filters on a listing are AND-combined; the server returns items that
match every filter.

## 6. Endpoints

### 6.1 Session

#### `GET /v1/session/scope`
**Purpose:** resolve the scope the current bearer token is authorized for.
Called exactly once at frontend bootstrap.
**Scope headers:** not required.
**Response:** `OrgScope` — `{ orgId, actingUserId }`.

### 6.2 Tenant + catalog

| Method + path                  | Response          |
| ------------------------------ | ----------------- |
| `GET /v1/organization`         | `Organization`    |
| `GET /v1/me`                   | `User`            |
| `GET /v1/brokers`              | `Broker[]`        |
| `GET /v1/brokers/:brokerId`    | `Broker` \| 404   |
| `GET /v1/sectors`              | `Sector[]`        |
| `GET /v1/sectors/:sectorId`    | `Sector` \| 404   |
| `GET /v1/stocks`               | `Stock[]`         |
| `GET /v1/stocks/:ticker`       | `Stock` \| 404    |

`listBrokers` returns only brokers in `Organization.enabledBrokerIds`.
`listStocks` returns only stocks with at least one active opinion in the
scope's org (see §6.5).

### 6.3 Inbound pipeline

#### `GET /v1/broker-emails`
Paginated list of inbound emails.

| Query param  | Type                                   |
| ------------ | -------------------------------------- |
| `since`      | ISO-8601 inclusive lower bound         |
| `until`      | ISO-8601 inclusive upper bound         |
| `brokerIds`  | comma-separated `BrokerId[]`           |
| `statuses`   | comma-separated `EmailProcessingStatus[]` |
| `limit`      | int, default 50, max 200               |
| `cursor`     | opaque cursor                          |

**Response:** `Page<BrokerEmail>`. Items sorted `receivedAt` desc.

#### `GET /v1/broker-emails/:emailId`
**Response:** `BrokerEmail` or 404.

#### `GET /v1/broker-emails/:emailId/attachments`
**Response:** `Attachment[]`.

### 6.4 Research artifacts

#### `GET /v1/research-reports`
Paginated list of normalized reports.

| Query param    | Type                                       |
| -------------- | ------------------------------------------ |
| `since`        | ISO-8601                                    |
| `until`        | ISO-8601                                    |
| `brokerIds`    | `BrokerId[]`                                |
| `tickers`      | `StockTicker[]`                             |
| `sectorIds`    | `SectorId[]`                                |
| `reportTypes`  | `ReportType[]`                              |
| `stances`      | `Stance[]` (filters via summary.stance)     |
| `limit`        | int, default 50, max 200                    |
| `cursor`       | opaque cursor                               |

**Response:** `Page<ResearchReport>`. Items sorted `publishedAt` desc.

#### `GET /v1/research-reports/:reportId`
**Response:** `ResearchReport` or 404.

#### `GET /v1/research-reports/:reportId/summary`
**Response:** `ReportSummary` or 404. The summary is the Phase-1
audit-backed synthesis of the report; every `keyPoint` / `risk` /
`theme` indexes into the evidence endpoint.

#### `GET /v1/research-reports/:reportId/evidence`
**Response:** `EvidenceSnippet[]`. Each snippet references a page of the
source PDF and a `supportingField` that tells the UI where to anchor the
citation.

### 6.5 Derived analytics

These are aggregations over §6.4. The backend is free to:

- **precompute** them (write-time) and serve the cached result, or
- **compute** them on read using the rules in `docs/closure-logic.md`.

Either way the JSON shape is identical and the frontend treats the
result identically.

#### `GET /v1/opinions`
Every broker's latest view per ticker in scope.

| Query param | Type            |
| ----------- | --------------- |
| `brokerIds` | `BrokerId[]`    |
| `tickers`   | `StockTicker[]` |

**Response:** `BrokerStockOpinion[]`.

#### `GET /v1/conflict-closures`
Per-ticker deterministic analysis.

| Query param              | Type                | Notes                                     |
| ------------------------ | ------------------- | ----------------------------------------- |
| `tickers`                | `StockTicker[]`     |                                           |
| `sectorIds`              | `SectorId[]`        |                                           |
| `states`                 | `ResultantState[]`  | `consensus_bullish`, `outlier_driven`, …  |
| `minSpreadPct`           | number              |                                           |
| `mustHaveDisagreements`  | boolean             | filter to closures with ≥1 disagreement   |
| `mustHaveOutliers`       | boolean             | filter to closures with ≥1 outlier        |

**Response:** `ConflictClosure[]`. The frontend will sort by
`targetStats.spreadPct` desc when rendering; the server can return any
order.

#### `GET /v1/conflict-closures/:ticker`
**Response:** `ConflictClosure` or 404.

#### `GET /v1/sector-intelligence`
**Response:** `SectorIntelligence[]`.

#### `GET /v1/sector-intelligence/:sectorId`
**Response:** `SectorIntelligence` or 404.

### 6.6 Dashboard + ops

| Method + path               | Response           |
| --------------------------- | ------------------ |
| `GET /v1/kpi-snapshot`      | `KpiSnapshot`      |
| `GET /v1/ingestion-status`  | `IngestionStatus`  |

## 7. JSON shape reference

All shapes mirror the TypeScript types:

- `Organization`, `User`, `Broker`, `Sector`, `Stock` — `src/domain/`
- `BrokerEmail`, `Attachment` — `src/domain/broker.ts`
- `ResearchReport`, `ReportSummary`, `EvidenceSnippet`,
  `ReportCatalyst` — `src/domain/report.ts`
- `BrokerStockOpinion` — `src/domain/stock.ts`
- `KpiSnapshot`, `KpiDelta` — `src/domain/kpi.ts`
- `IngestionStatus`, `EmailProcessingStatus` — `src/domain/status.ts`
- `ConflictClosure` (with `ConsensusPoint`, `DisagreementPoint`,
  `OutlierClassification`, `ResultantLogic`, `ConfidenceDetail`,
  `TargetStats`) — `src/engine/types.ts`
- `SectorIntelligence`, `SectorSignal`, `SectorResultantEntry` — same file

Every readonly/`Readonly<>` modifier in TypeScript is a transport-level
hint only; the JSON is plain objects and arrays.

## 8. Server-side closure computation

The backend has two options for closures + sector intelligence:

1. **Compute on read** — the server runs exactly the rules in
   `docs/closure-logic.md` and returns the result. Simpler to implement;
   slower under load; cacheable.

2. **Precompute** — a background job writes `ConflictClosure` rows to
   a table per `(orgId, ticker)` on every opinion / summary change, and
   the HTTP handler reads from that table. Faster; trickier consistency.

Either is acceptable. The HTTP response shape is identical. The
frontend's `HttpResearchAdapter` does not know or care which strategy
the backend uses.

## 9. Minimum dataset

For the dashboard to render meaningfully the backend needs to serve, at
minimum:

- 1 `Organization` matching the bearer token's scope
- 1 `User` matching the acting user
- ≥ 5 `Broker` rows in `Organization.enabledBrokerIds`
- ≥ 3 `Sector` rows
- ≥ 8 `Stock` rows with coverage
- ≥ 15 `BrokerEmail` rows with `status = ready` (plus some in `queued`
  / `parsing` / `failed` to exercise the ingestion status chip)
- Matching `Attachment`, `ResearchReport`, `ReportSummary`, and
  `EvidenceSnippet` records for every ready email
- ≥ 1 `BrokerStockOpinion` per (broker, ticker) the org covers; for
  meaningful outlier detection the most-watched tickers should have
  ≥ 3 opinions
- `ConflictClosure` for every covered ticker (or the ability to compute
  it on demand from the above)
- `SectorIntelligence` for every sector in scope
- 1 `KpiSnapshot` + 1 `IngestionStatus`

## 10. Reference fixture

The frontend ships with a complete fixture that satisfies every
endpoint. Set `VITE_RESEARCH_ADAPTER=http-stub` to run the full HTTP
code path against an in-memory stub that serves the fixture. The stub
uses the same URL patterns documented above; it's a useful contract
test for the backend before the real server comes online.

## 11. Swapping the mock for the real backend

Once the backend satisfies this contract:

1. Deploy it with a stable base URL (e.g. `https://api.example.com`).
2. In the frontend's deployment env, set:
   ```
   VITE_RESEARCH_ADAPTER=http
   VITE_API_BASE_URL=https://api.example.com
   VITE_API_TOKEN=<token>  # or wire a real auth flow
   ```
3. Redeploy. No source changes needed.
