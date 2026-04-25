# Broker Research Dashboard — Architecture

This repository is a **read-only analytics / presentation client**. It is
not the system of record. The intended production topology is:

> The server-side raw-artifact processing pipeline that turns raw upstream
> emails / PDFs / linked artifacts into the canonical `/v1` entities the
> frontend consumes is documented separately:
> [`docs/pipeline.md`](./pipeline.md).

> The live operational layer — durable persistence, incremental sync,
> idempotency, and replay/reprocess tooling — is documented at
> [`docs/live-sync.md`](./live-sync.md).

> The extraction quality harness, review workflow, and operator
> diagnostics (eval / scorecards / field-stats / replay-diff) are
> documented at [`docs/eval.md`](./eval.md).

```
        ┌────────────────────────────────────┐
        │     External Upstream API          │
        │                                    │
        │   • ingests customer broker        │
        │     research emails                │
        │   • authenticates customers        │
        │   • enforces org / tenant          │
        │     data isolation                 │
        │   • returns authorized,            │
        │     customer-scoped research data  │
        └──────────────┬─────────────────────┘
                       │  HTTPS, JSON, Bearer token
                       │  X-Org-Id, X-Acting-User-Id
                       ▼
        ┌────────────────────────────────────┐
        │   Adapter layer                    │
        │   src/adapters/HttpResearchAdapter │
        │                                    │
        │   • HTTP transport, headers, auth  │
        │   • orgId cross-check guardrail    │
        │   • typed error mapping            │
        └──────────────┬─────────────────────┘
                       │  raw JSON (upstream shape)
                       ▼
        ┌────────────────────────────────────┐
        │   Upstream translation layer       │
        │   src/adapters/upstream/           │
        │                                    │
        │   • explicit upstream payload types│
        │   • mappers (upstream → canonical) │
        │   • required vs optional policy    │
        │   • contract tests + fixtures      │
        └──────────────┬─────────────────────┘
                       │  ResearchAdapter interface
                       ▼
        ┌────────────────────────────────────┐
        │   Canonical domain types           │
        │   src/domain/*                     │
        │                                    │
        │   • branded IDs                    │
        │   • read-only, immutable records   │
        └──────────────┬─────────────────────┘
                       │  Organization, ResearchReport, …
                       ▼
        ┌────────────────────────────────────┐
        │   Selectors / view models          │
        │   src/viewModels/*                 │
        │                                    │
        │   • pure transformers              │
        │   • UI-shaped outputs              │
        └──────────────┬─────────────────────┘
                       │  DashboardViewModel, …
                       ▼
        ┌────────────────────────────────────┐
        │   UI                               │
        │   src/components/*                 │
        └────────────────────────────────────┘
```

## What lives where

| Concern                          | Owner                              |
| -------------------------------- | ---------------------------------- |
| Mailbox sync / email ingestion   | **Upstream API** (not this repo)   |
| Customer authentication          | **Upstream API** (not this repo)   |
| Org / tenant isolation           | **Upstream API** (not this repo)   |
| Token minting / refresh          | **Upstream API + host app**        |
| Read-only analysis + presentation | **This dashboard**                 |
| Canonical domain contract        | **This dashboard** (`src/domain/`) |
| Parser / engine / view models    | **This dashboard**                 |
| Local dev harness                | `server/` (this repo, dev only)    |

The dashboard is deliberately thin: a fixed HTTP contract, a canonical
domain, a selector layer, and a React UI. Production data flows through
the upstream; nothing customer-facing goes through `server/`.

## Production vs. dev paths

| Runtime mode       | Data source                                     | Purpose                                      |
| ------------------ | ----------------------------------------------- | -------------------------------------------- |
| `upstream`         | External upstream API                           | **Production**                               |
| `local`            | `server/` (local, fixture-fed)                  | Dev harness with the full HTTP code path     |
| `mock`             | In-memory fixtures + engine                     | Offline dev, Storybook, component tests      |
| `mock-http`        | Stub fetch backed by the mock                   | Adapter-layer regression tests               |
| `upstream-fixture` | Bundled upstream JSON fixtures via translation  | Integration rehearsal against the wire shape |

Mode is selected by `VITE_RESEARCH_ADAPTER` at build / dev time. The UI
layer is identical across all four. See [`modes.md`](./modes.md) for the
decision matrix.

## Scope (org / user / token)

The dashboard does **not** authenticate anyone. Whatever product embeds
this dashboard is responsible for minting a bearer token and injecting it
via a small well-defined handshake. Details in [`scope.md`](./scope.md).

## What this repo is NOT

- Not a mailbox. `server/` parses local `.eml` fixtures only for dev.
- Not an auth service. No login UI, no token minting, no session store.
- Not a backend. `server/` is a local HTTP toy to keep the adapter layer
  honest; production data always comes from the upstream.
- Not a redesign. The refactor preserves the existing UI, domain, and
  selector layer; it only clarifies the production vs. dev boundary.

## Guardrails

Tenant isolation is the upstream's job, but the dashboard adds two
belt-and-braces guardrails:

1. **orgId cross-check** in `HttpResearchAdapter`. If the upstream ever
   returns a record whose `orgId` does not match the scope the request
   was issued under, the adapter throws `OrgScopeViolationError` before
   any view model sees the data.
2. **Scope-change flush** in `ScopeContext` + `useAdapterQuery`. On
   every host-initiated scope swap the scope is cleared, a `generation`
   counter bumps, every in-flight query drops its result, and the UI
   re-renders from an empty state under the new scope.

These cannot substitute for upstream authorization, but they close the
loop on silent cross-tenant data leaks during token refresh or org
switches.
