# Upstream onboarding workflow

> **For the external upstream API team + the dashboard team.**
> How to hand over the first real payloads and check them end-to-end.

There is one drop-zone, two commands, and one verdict.

## 1. Drop samples

Put the upstream team's sample JSON files into
[`upstream-samples/`](../upstream-samples/), one file per endpoint, named
exactly like the reference fixtures in
[`src/adapters/upstream/fixtures/`](../src/adapters/upstream/fixtures/):

| Endpoint                              | Filename                 |
| ------------------------------------- | ------------------------ |
| `GET /v1/session/scope`               | `session-scope.json`     |
| `GET /v1/organization`                | `organization.json`      |
| `GET /v1/me`                          | `me.json`                |
| `GET /v1/brokers`                     | `brokers.json`           |
| `GET /v1/sectors`                     | `sectors.json`           |
| `GET /v1/stocks`                      | `stocks.json`            |
| `GET /v1/broker-emails`               | `broker-emails.json`     |
| `GET /v1/research-reports`            | `research-reports.json`  |
| `GET /v1/research-reports/:id/summary`| `report-summary.json`    |
| `GET /v1/research-reports/:id/evidence`| `evidence.json`         |
| `GET /v1/opinions`                    | `opinions.json`          |
| `GET /v1/conflict-closures`           | `conflict-closures.json` |
| `GET /v1/conflict-closures/:ticker`   | `conflict-closure.json`  |
| `GET /v1/sector-intelligence`         | `sector-intelligence.json` |
| `GET /v1/kpi-snapshot`                | `kpi-snapshot.json`      |
| `GET /v1/ingestion-status`            | `ingestion-status.json`  |

**Minimum day-1 set**: `session-scope`, `organization`, `me`, `brokers`,
`sectors`, `stocks`, `research-reports`, `kpi-snapshot`, `ingestion-status`.
Anything else is icing; the dashboard degrades gracefully to empty
states.

## 2. Check compatibility

```bash
npm run upstream:ready
```

Prints a single verdict:

- **READY** — the dashboard can be pointed at the upstream as-is.
- **NEEDS MAPPER WORK** — harmless drift detected; the translation layer
  can absorb it, but review the drift report before promoting samples to
  fixtures.
- **BLOCKED** — a required field is missing or a required field has the
  wrong type. The dashboard will not render meaningfully until the
  upstream fixes it.

Under the hood, `upstream:ready` runs four gated steps:

1. Fixture JSON parses.
2. Contract tests pass on current fixtures
   ([`test:contract`](../src/adapters/upstream/__tests__/contract.ts)).
3. Every *required* endpoint has a sample in `upstream-samples/`.
4. Per-endpoint diff between each sample and its reference fixture
   ([`upstream:compare`](../src/adapters/upstream/__tests__/compare.ts)).

## 3. See the field-level diff

```bash
npm run upstream:compare
```

Per endpoint:

```
--- organization.json ---
  ✓ 8 matching · ? 0 missing · + 1 extra · ≈ 1 rename · ! 0 type-mismatch
    ≈ id                                        [HARMLESS] sample sent "organization_id" instead (harmless — normalize absorbs it)
    + extendedMetadata                          [HARMLESS]
  verdict: HARMLESS
```

- `✓ matching` — field is on both sides with compatible types.
- `? missing` — dashboard expects the field; sample omits it. Blocking
  unless the field is declared optional in
  [`src/adapters/upstream/types.ts`](../src/adapters/upstream/types.ts).
- `+ extra` — sample has an extra field the dashboard does not read.
  Always harmless.
- `≈ rename` — sample has the field under a different name; the compare
  tool recognizes common renames (snake_case ↔ camelCase, id aliases,
  pagination aliases). Harmless when the normalize layer absorbs it.
- `! type-mismatch` — same field, different type (e.g. number vs. string).
  Numeric-string at a known numeric site is harmless (coerced). Otherwise
  blocking.

## 4. Handling drift

**Harmless drift** is absorbed automatically by
[`src/adapters/upstream/normalize.ts`](../src/adapters/upstream/normalize.ts):

- snake_case → camelCase (recursive).
- Envelope unwrap: `{ data: … }`, `{ response: … }`, `{ result: … }`,
  `{ payload: … }`.
- Bare arrays wrapped into `Page<T>` with defaults for `nextCursor` /
  `totalCount`.
- Pagination aliases: `cursor` → `nextCursor`, `total` / `count` →
  `totalCount`.
- Numeric strings coerced to numbers at known numeric fields (target
  prices, confidence, throughput).
- Alt-ID fields: `organization_id` → `id`, `userId` → `id`, etc. These
  are documented per mapper in
  [`mappers.ts`](../src/adapters/upstream/mappers.ts).

**Structural drift** — a semantically different payload shape — requires
a one-line change in `mappers.ts`. Each mapper exposes two affordances:

```ts
// in mappers.ts
aliasField(x, 'canonicalName', ['alias1', 'alias2'], ctx.endpoint)
coerceNumericFields(x, ['fieldA', 'fieldB'], 'ResourceName')
```

Add your alias/coercion, re-run `npm run upstream:ready`, and the
dashboard picks up the drift.

## 5. Rehearse in the browser

Once `upstream:ready` prints `READY`, boot the dashboard against your
dropped samples without leaving the laptop:

```bash
# copy upstream-samples/*.json → src/adapters/upstream/fixtures/
cp upstream-samples/*.json src/adapters/upstream/fixtures/
npm run dev:upstream-fixture
# open http://localhost:5173 — dashboard renders against your samples.
```

In dev mode there is a **floating chip** in the bottom-right showing
per-resource status, per-screen readiness, and mapper warnings. You can
also run `window.__upstreamDiagnostics()` in the browser console for the
full dump.

## 6. Promote to production

When the samples are production-representative:

```bash
cp upstream-samples/*.json src/adapters/upstream/fixtures/
npm run test:contract           # should still be green
git commit -m "upstream: adopt real-payload shape"
```

Then point the app at the live API:

```bash
VITE_RESEARCH_ADAPTER=upstream \
VITE_API_BASE_URL=https://your-api.example.com \
npm run dev:upstream
```

## 7. What the dashboard needs — at a glance

| Screen                  | Required resources                                                                 | Degrades if missing                       |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Dashboard (home + KPIs) | `organization`, `currentUser`, `brokers`, `sectors`, `stocks`, `researchReports`, `kpiSnapshot` | `ingestionStatus`, `opinions`             |
| By Broker               | `brokers`, `opinions`                                                              | `researchReports`, `stocks`               |
| By Stock                | `stocks`, `opinions`                                                               | `researchReports`, `conflictClosures`     |
| Report detail           | `researchReport`                                                                   | `reportSummary`, `reportEvidence`         |
| Divergence / Arb        | `opinions`                                                                         | `conflictClosures`                        |
| Sector Feed             | `sectors`, `researchReports`                                                       | `sectorIntelligence`                      |
| Ingestion status        | `ingestionStatus`                                                                  | `brokerEmails`                            |

Authoritative source:
[`src/adapters/upstream/screenReadiness.ts`](../src/adapters/upstream/screenReadiness.ts).

## 8. When in doubt

- Full contract reference: [`docs/upstream-contract.md`](./upstream-contract.md).
- Auth / scope handshake: [`docs/scope.md`](./scope.md).
- Adapter modes: [`docs/modes.md`](./modes.md).
- Architecture: [`docs/architecture.md`](./architecture.md).
