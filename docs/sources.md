# Source integrations + production health (Module 24)

> Production-shaped source layer with provider modes, health, freshness,
> watermarks, retries, and backfills. Existing modules consume the same
> internal interfaces; only the wrappers, persistence, and operator
> surface are new.

## Why this exists

The dashboard reads from four logical inputs:

| Source kind         | What it provides                          | Used by |
| ------------------- | ----------------------------------------- | --- |
| `raw_upstream`      | Raw research emails (Module 13)           | Daily Worklog, My Book, By Broker, By Stock, Alerts |
| `portfolio`         | Portfolio + watchlist snapshot (Module 18)| My Book, book overlays, Catalysts (book filter) |
| `catalyst_calendar` | Upcoming catalyst events (Module 21)      | Catalysts, Pre-event briefs |
| `market_data`       | Daily prices + benchmarks (Module 20)     | Calibration, Post-event reviews, Adaptive ranking |

Each one already has a swappable provider interface. Module 24 wraps them
all in a single registry + health/freshness/retry/backfill model so the
system behaves predictably as we move from fixture data to real APIs.

## Provider modes

Every source binds to one of four modes:

| Mode       | What it means                                            |
| ---------- | -------------------------------------------------------- |
| `http`     | Real HTTP-backed provider; uses base URL + token env.    |
| `fixture`  | Local fixture data; UI labelled `degraded` (fallback).   |
| `mock`     | Synthetic test data; same UI label as fixture.           |
| `disabled` | No provider; consumers degrade explicitly.               |

Default per env:

* `NODE_ENV=development` (or unset) → `fixture` for every source.
* `NODE_ENV=production` → `disabled` for every source.

Flip per source with one env var: `SOURCE_<KIND>_MODE=http|fixture|mock|disabled`.

## Configuration

```sh
# Real HTTP-backed catalyst calendar.
SOURCE_CATALYST_CALENDAR_MODE=http
SOURCE_CATALYST_CALENDAR_BASE_URL=https://your-calendar-host
SOURCE_CATALYST_CALENDAR_TOKEN_ENV=CALENDAR_TOKEN
CALENDAR_TOKEN=...

# Real portfolio.
SOURCE_PORTFOLIO_MODE=http
SOURCE_PORTFOLIO_BASE_URL=https://your-portfolio-host
SOURCE_PORTFOLIO_TOKEN_ENV=PORTFOLIO_TOKEN
PORTFOLIO_TOKEN=...

# Real market data.
SOURCE_MARKET_DATA_MODE=http
SOURCE_MARKET_DATA_BASE_URL=https://prices.example.com
SOURCE_MARKET_DATA_TOKEN_ENV=PRICES_TOKEN
PRICES_TOKEN=...
```

Per-source defaults (see `server/src/sources/config.ts`):

| Source              | Staleness  | Retry backoff | Poll interval | Max backfill window |
| ------------------- | ---------- | ------------- | ------------- | --- |
| `raw_upstream`      | 30 min     | 60 s          | 10 min        | 14 d |
| `portfolio`         | 24 h       | 5 min         | 60 min        | 7 d  |
| `catalyst_calendar` | 6 h        | 5 min         | 60 min        | 30 d |
| `market_data`       | 4 h        | 60 s          | 30 min        | 90 d |

## Health, freshness, and degraded state

Five status values, computed by the pure `health.ts`:

* `healthy` — last sync succeeded, freshness within threshold.
* `stale` — last sync succeeded but is past the staleness threshold.
* `degraded` — running in `fixture` / `mock` / `disabled` mode.
* `failing` — most recent sync attempt failed; retry is scheduled.
* `unknown` — no sync run on record yet.

Each `SourceIntegration` carries:

* `freshness` — `lastSyncedAt`, `ageSeconds`, `stalenessThresholdSeconds`, `isStale`.
* `degraded` — reasons (e.g. "Serving fixture data."), affected modules, `servingFallback` flag.
* `lastError` — error category + message + consecutive-failure count + `nextRetryAt`.
* `recentRuns` — last 10 sync attempts.
* `recentBackfills` — last 5 backfill jobs.
* `watermark` — opaque cursor maintained by the provider.

The org-level rollup (`SourcesHealthSnapshot.overall`) is the worst per-source
status: any `failing` → org is `failing`; any `stale` → org is `stale`;
all `healthy` → org is `healthy`; otherwise `degraded`.

## Retry + backfill

* **Retry.** A failed sync schedules a `nextRetryAt` using exponential backoff
  (capped at 30 min). `npm run ops -- sources:retry` retries any failed
  source whose backoff has elapsed.
* **Backfill.** `npm run ops -- sources:backfill --kind=<kind> --from=<iso> --to=<iso>`
  queues a `BackfillJob`, runs it immediately, and persists both a backfill
  record and a `SourceSyncRun` so the run history is unified.
* **Watermark.** Each sync writes its `watermarkAfter` to the
  `SourceWatermark` table when the sync succeeded. Failed runs leave the
  watermark untouched, so the next attempt resumes from the same point.
  Watermarks are opaque to the manager — providers choose the shape
  (cursor, ISO date, sequence number).
* **Idempotency.** The HTTP-shape providers count `newCount` based on
  what the upstream tells them. The downstream pipeline (where it
  exists) deduplicates again on its own keys; running a sync twice
  produces no double-writes.

## Operator workflows

### Day-to-day

```sh
npm run ops -- sources:list                  # what's registered + provider mode
npm run ops -- sources:health                # full per-source health, freshness, errors
npm run ops -- sources:sync-all              # incremental sync everything
npm run ops -- sources:retry                 # retry only the failed ones
npm run ops -- sources:inspect --kind=portfolio   # full detail + run history
```

### After an upstream incident

```sh
npm run ops -- sources:health                                    # confirm what's failing
npm run ops -- sources:backfill --kind=catalyst_calendar --from=2026-04-15 --to=2026-04-26
npm run ops -- sources:health                                    # confirm freshness restored
```

### Switching a source from fixture to real

```sh
# 1. Set env vars in your secrets manager / .env
export SOURCE_PORTFOLIO_MODE=http
export SOURCE_PORTFOLIO_BASE_URL=https://your-portfolio-host
export SOURCE_PORTFOLIO_TOKEN_ENV=PORTFOLIO_TOKEN

# 2. Inspect what mode is loaded
npm run ops -- sources:list

# 3. Compare what each mode would do
npm run ops -- sources:compare-modes --kind=portfolio

# 4. Run a real sync and confirm health
npm run ops -- sources:sync --kind=portfolio
npm run ops -- sources:inspect --kind=portfolio
```

### Recommended rollout order

1. `raw_upstream` — already production-shape; just confirm health is `healthy`.
2. `portfolio` — flip to `http`. Stale tolerance is 24h, so a slow ramp is safe.
3. `catalyst_calendar` — flip to `http`. Verify backfill works.
4. `market_data` — flip last; calibration / post-event flows depend on it.

After each flip, watch the **Sources** tab (or `sources:health`) for the
first 24h. Failures fan out into the relevant module's degraded banner —
e.g. a portfolio failure shows up in the My Book "Degraded" stripe.

## How modules degrade

Every relevant view-model hook now consults the source-health snapshot
and prepends explicit notes to its existing `degradations` array:

* **My Book** — `portfolio`, `raw_upstream`.
* **Daily Worklog** — `raw_upstream`, `portfolio`.
* **Catalysts** — `catalyst_calendar`, `portfolio`.
* **Calibration** — `market_data`.

Notes look like:

> *Source "Portfolio snapshot" is failing — last error: HTTP 503 fetching .../portfolio-snapshot.*
>
> *Source "Catalyst calendar" is stale — last sync 9h ago.*

The header chip (`sources ok 4/4`) gives the rollup at a glance and
opens the full **Sources** tab in one click.

## Server-side wiring

* `SourceManager` is constructed at server boot from the `Repo` + a
  `SourceRegistry` built by `buildRegistryForOrgs(orgIds, { repo })`.
* The HTTP API serves `GET /v1/sources/health` when the manager is
  passed to `startApiServer({ ..., sourceManager })`.
* The dashboard reads it via `adapter.getSourcesHealth(scope)`. The
  mock adapter synthesises a fixture-mode snapshot so the UI is
  exercised end-to-end without a live server.
* Persistence: `Repo` gains `appendSourceSyncRun`, `getSourceWatermark`,
  `upsertSourceWatermark`, `upsertBackfillJob`, `listBackfillJobs`,
  `loadSourcesForOrg`. Implemented in the in-memory + JSON-file repos;
  SQLite repo unchanged (it's a future-stage option).

## What this module deliberately does NOT do

* It does not move ranking, alerts, or calibration off the existing
  modules — those layers consume the same interfaces.
* It does not introduce auth. The HTTP providers use a single bearer
  token from a configurable env var; the app's own auth model is out
  of scope.
* It does not auto-trigger syncs. The CLI is the trigger today; a
  scheduler (Module 25 candidate) plugs into the same `SourceManager`
  later.
* It does not modify the `/v1` contract — only adds `/v1/sources/health`,
  which adapters already tolerate as missing.
