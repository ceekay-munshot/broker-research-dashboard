# upstream-samples/ — drop-zone for real upstream payloads

This folder is the single place to drop sample JSON payloads received from
the external upstream API team. The dashboard's compatibility tooling
reads from here.

## How to use it

1. **Drop the file.** Name it exactly after the endpoint key (same names
   the reference fixtures use under
   [`src/adapters/upstream/fixtures/`](../src/adapters/upstream/fixtures)):

   | Endpoint                                  | Filename                  |
   | ----------------------------------------- | ------------------------- |
   | `GET /v1/session/scope`                   | `session-scope.json`      |
   | `GET /v1/organization`                    | `organization.json`       |
   | `GET /v1/me`                              | `me.json`                 |
   | `GET /v1/brokers`                         | `brokers.json`            |
   | `GET /v1/sectors`                         | `sectors.json`            |
   | `GET /v1/stocks`                          | `stocks.json`             |
   | `GET /v1/broker-emails`                   | `broker-emails.json`      |
   | `GET /v1/broker-emails/:id/attachments`   | `attachments.json`        |
   | `GET /v1/research-reports`                | `research-reports.json`   |
   | `GET /v1/research-reports/:id/summary`    | `report-summary.json`     |
   | `GET /v1/research-reports/:id/evidence`   | `evidence.json`           |
   | `GET /v1/opinions`                        | `opinions.json`           |
   | `GET /v1/conflict-closures`               | `conflict-closures.json`  |
   | `GET /v1/conflict-closures/:ticker`       | `conflict-closure.json`   |
   | `GET /v1/sector-intelligence`             | `sector-intelligence.json`|
   | `GET /v1/kpi-snapshot`                    | `kpi-snapshot.json`       |
   | `GET /v1/ingestion-status`                | `ingestion-status.json`   |

   Only the files you have are needed — the tooling silently skips missing
   ones and summarizes gaps.

2. **Check compatibility.**

   ```bash
   npm run upstream:ready
   ```

   Prints a single verdict: `READY`, `NEEDS MAPPER WORK`, or `BLOCKED`.

3. **See the field-level diff** against our reference fixtures:

   ```bash
   npm run upstream:compare
   ```

   Table of matches / missing / extra / renames / type mismatches per endpoint.

4. **Adapt if needed.** If `upstream:compare` reports drift:
   - Harmless drift (envelope wrapping, snake_case, partial pagination,
     numeric strings, nullable optionals) is handled automatically by
     [`src/adapters/upstream/normalize.ts`](../src/adapters/upstream/normalize.ts).
   - Structural drift (renamed semantic fields) requires a one-line edit in
     [`src/adapters/upstream/mappers.ts`](../src/adapters/upstream/mappers.ts)
     using the `aliasField` helper. See
     [`docs/upstream-onboarding.md`](../docs/upstream-onboarding.md#handling-drift).

5. **Promote to fixtures.** Once `upstream:ready` prints `READY`, copy each
   sample into `src/adapters/upstream/fixtures/` to replace the reference
   fixtures and run `npm run test:contract` one more time.

## What not to drop here

- Tokens, credentials, secrets. Samples are committed to the repo.
- Multi-tenant leaks. Samples must be single-org (all `orgId` values the
  same).
- Real customer data. Use anonymized or synthetic examples.

## Conventions

- One JSON file per endpoint.
- UTF-8, pretty-printed (indent 2) preferred.
- ISO-8601 UTC timestamps.
- Tolerated inbound quirks (all absorbed by `normalize.ts`):
  snake_case keys; `{ data: … }` / `{ response: … }` / `{ result: … }`
  envelope wrappers; `Page<T>` sent as a bare array; numeric values
  sent as strings at known sites; absent optional fields.
