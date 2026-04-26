# Broker calibration & signal effectiveness (Module 20)

This module closes the feedback loop between research/alerts and
**market outcomes**. The server-side calibration engine maps canonical
artifacts into `SignalEvent`s, computes forward `SignalOutcome`s over
fixed windows, and rolls them into per-broker, per-alert-kind, and
per-ticker scorecards. The UI exposes a read-only "Calibration" tab.

Calibration metadata is **exposed but does NOT silently change ranking**.
Any wiring back into the existing portfolio-relevance / alert-severity /
digest-ordering layers must be explicitly enabled (see "Calibration-
aware ranking" below). Methodology is below; methodology version is
stamped on every snapshot for stable before/after comparisons.

---

## Architecture

```
canonical store (HybridCanonicalStore + Repo)
   │
   ▼
server/src/calibration/marketProvider.ts   ← swappable input seam
server/src/calibration/events.ts           ← derive SignalEvent[]
server/src/calibration/outcomes.ts         ← compute SignalOutcome[] per (event × window)
server/src/calibration/eventStudy.ts       ← aggregate window stats + score + bands
server/src/calibration/brokerCalibration.ts ← per-broker scorecards
server/src/calibration/alertEffectiveness.ts ← per-alert-kind scorecards
server/src/calibration/run.ts              ← orchestrator
server/src/calibration/bootstrap.ts        ← adapt store + run for every org
   │
   ▼
persisted: CalibrationSnapshot per org (with brokers, alerts, coverage)
   │
   ▼
/v1/calibration/snapshot
/v1/calibration/brokers              /v1/calibration/brokers/:id
/v1/calibration/alerts               /v1/calibration/alerts/:kind
/v1/calibration/coverage/:ticker
   │
   ▼
src/components/views/Calibration.tsx
src/components/calibration/{BrokerCalibrationCard,AlertEffectivenessCard,SampleSizeBadge}.tsx
```

---

## Methodology

**Methodology version**: `v1.0`. Bumps when the engine, window set, or
score formula changes in a way that would invalidate before/after
comparisons. The version is stamped on every `CalibrationSnapshot`.

### What counts as an event

A `SignalEvent` is one of the following, derived from canonical
artifacts:

| Kind | Source | Expected direction |
|------|--------|--------------------|
| `broker_report` | One per (report × ticker). | None. |
| `rating_change` | When a new report's `rating` differs from the prior recorded broker opinion. | `up` if rating rank rose, `down` if fell. |
| `target_change` | When current vs prior target differs by ≥ 1%. | Sign of the delta. |
| `against_position_alert` | One per emitted `against_position` alert. | `down` for `held_long`, `up` for `held_short`. |
| `significant_change_alert` | One per `significant_change_held` alert. | None (the underlying `target_change` event captures direction). |
| `unresolved_divergence_alert` | One per `unresolved_divergence_held` alert. | None. |
| `broker_outlier_alert` | One per `broker_outlier_held` alert. | None. |
| `pile_in_alert` | One per `pile_in_book` alert. | None. |
| `watchlist_fresh_alert` | One per `watchlist_fresh_candidate` alert. | None. |
| `stale_coverage_alert` | One per `stale_coverage_*` alert. | None. |
| `digest_inclusion` | Reserved (not currently emitted). | — |

The engine is pure: same inputs → same events, same outcomes. Replays
are stable.

### Return windows

We measure forward returns at five trading-day offsets:
`{1d, 3d, 5d, 10d, 20d}`.

`5d` is the **primary window** for headline scores. Windows are computed
by stepping forward through the available daily series — gaps (weekends,
holidays) are absorbed by the price-series calendar, so `5d` is "five
trading days" not "five calendar days".

### Raw vs benchmark-relative

For each `SignalOutcome` we compute:

- `rawReturnPct` — `(close[t+window] / close[t]) − 1`, in %.
- `benchmarkRelReturnPct` — `rawReturn − benchmarkReturn` over the same
  window, when a benchmark is wired for the ticker's currency.
- `benchmarkId` — the benchmark series used.

Raw return is always present when price data covers the window;
benchmark-relative is null when no benchmark is configured for the
ticker.

### Hit rate & directional correctness

`directionallyCorrect` is computed per outcome:

- `expectedDirection === 'up'`   → `rawReturnPct > 0`
- `expectedDirection === 'down'` → `rawReturnPct < 0`
- `expectedDirection === 'flat'` → `flatNoise === true`
- `expectedDirection === null`   → `directionallyCorrect = null`
- If the absolute return is below the **flat-noise threshold**
  (`25 bps × window-days`), `directionallyCorrect = null` regardless
  of expectedDirection (the move is too small to credit either way).

`hitRate` over a sample = `correct / (correct + incorrect)`. Outcomes
with `directionallyCorrect = null` are excluded from the denominator.

### Calibration score (`-100..+100`)

Computed in `eventStudy.calibrationScore()`:

```
score = ((hitRate − 0.5) × 100) × 0.6
      + clamp(meanRel or meanRaw, ±8) × 4 × 0.4
score *= 0.5 + 0.5 × min(1, n / 30)     // sample-size discount
score = clamp(round2(score), −100, +100)
```

- Hit rate vs 50% drives the directional component.
- Benchmark-relative magnitude (or raw if no benchmark) drives the magnitude component, capped at ±8% mean.
- Sample-size discount: at `n=30` the score is undamped, at `n=5` it's halved.

### Confidence bands

Sample-size driven, applied to the primary window:

| Band | Sample size |
|------|-------------|
| `very_low` | `< 5` |
| `low`      | `≥ 5`  |
| `medium`   | `≥ 15` |
| `high`     | `≥ 30` |

A `SampleSizeBadge` ships in the UI to make confidence visually obvious;
the CLI prints it inline. **Do not act on `very_low` confidence scores.**

### Caveats

- **Survivorship**: tickers without price coverage are skipped (`counters.skippedNoPrice`). Newly listed names won't have history; delisted ones won't have forward windows.
- **Timing precision**: events are anchored to the close on the report's `receivedAt` date — intraday fills aren't modeled. Same-day events get the same anchor.
- **Overlapping events**: `pile_in` events fire alongside underlying `broker_report` events, so the same forward return is counted in multiple aggregates. This is by design (each lens measures a different rule), not a leak.
- **Benchmark availability**: when no benchmark is wired for a ticker's currency, `meanRelReturnPct` is null and the score falls back to raw return for the magnitude component.
- **Mock data**: dev/CI uses deterministic seeded price series + a synthetic NIFTY50 benchmark. Numbers won't match prod.

---

## Domain model

[src/domain/calibration.ts](../src/domain/calibration.ts)

| Type | Purpose |
|------|---------|
| `DailyPricePoint` | One daily close `{ ticker, date, close, currency }`. |
| `BenchmarkSeries` | A daily benchmark series with id + name + currency + points. |
| `ReturnWindow` | `1d \| 3d \| 5d \| 10d \| 20d` |
| `SignalEvent` | Canonical event row (see "What counts as an event"). Frozen `bookContext`. |
| `SignalOutcome` | One forward return per (event × window): raw, rel, hit, flat-noise. |
| `OutcomeWindowResult` | Aggregate window stats: sample, hit rate, mean / median, p25/p75, stddev, upside/downside avg. |
| `BrokerCalibrationSummary` | Per-broker scorecard with `score`, `confidence`, `byWindow`, `heldByWindow`, `bySector`, long/short hit rates, against-position track record, reasons. |
| `AlertEffectivenessSummary` | Per-alert-kind scorecard with `score`, `confidence`, `byWindow`, `byMembership`, reasons. |
| `CoverageSignalResult` | Per-ticker scorecard with `score`, `confidence`, top brokers (sample-size gated), reasons. |
| `CalibrationSnapshot` | Top-level snapshot with all scorecards + counters + methodology version + source. |

---

## API

| Method | Path | Returns |
|--------|------|---------|
| GET | `/v1/calibration/snapshot` | `CalibrationSnapshot` or 404 |
| GET | `/v1/calibration/brokers` | `BrokerCalibrationSummary[]` |
| GET | `/v1/calibration/brokers/:brokerId` | `BrokerCalibrationSummary` or 404 |
| GET | `/v1/calibration/alerts` | `AlertEffectivenessSummary[]` |
| GET | `/v1/calibration/alerts/:kind` | `AlertEffectivenessSummary` or 404 |
| GET | `/v1/calibration/coverage/:ticker` | `CoverageSignalResult` or 404 |

All endpoints scope-enforced via `X-Org-Id`. Marked `tolerate404: true`
in `degraded.ts` — a fresh tenant without snapshots renders an empty
calibration surface gracefully.

---

## CLI

```
npm run ops -- calibration:snapshot     [--org=<orgId>]
npm run ops -- calibration:recompute    [--org=<orgId>]
npm run ops -- calibration:brokers      [--org=<orgId>] [--limit=<n>] [--bottom]
npm run ops -- calibration:alerts       [--org=<orgId>]
npm run ops -- calibration:coverage     [--org=<orgId>] --ticker=<ticker>
npm run ops -- calibration:compare      [--org=<orgId>] --before=<snapshotId> --after=<snapshotId>
npm run ops -- calibration:low-sample   [--org=<orgId>]
```

`calibration:compare` prints per-broker and per-alert-kind score deltas
between two snapshots. Use it after a methodology change or after new
market data lands to confirm the change moved the right things.

`calibration:low-sample` lists every broker / alert kind below the
`medium` confidence band. **Do not act on these scores in production.**

---

## Calibration-aware ranking (feature flag)

By default, calibration scores are **exposed only**. They do not feed
back into:
- portfolio relevance ranking (`src/engine/portfolioRelevance.ts`)
- alert severity (`server/src/alerts/severity.ts`)
- digest ordering (`server/src/alerts/digest.ts`)
- broker prioritization in By Broker / My Book

To opt in, set `VITE_CALIBRATION_AWARE_RANKING=1` (frontend) and / or
`SERVER_CALIBRATION_AWARE_ALERTS=1` (server). Wiring the flag through
the engines is left for a follow-up — the metadata on the wire is
already there.

---

## Workflow

**Each morning** (after server boot or ingest):

1. Open the **Calibration** tab. Skim:
   - **Top brokers** — who's been adding info to your book.
   - Toggle to **Weakest brokers** — fade signal candidates.
   - **Alert kinds** — which alert types are worth paying attention to.
   - **Per-ticker coverage** — sample-size-warned per-name scorecards.
2. Cross-reference back into **My Book** / **Briefing** for any held
   name where coverage looks thin or noisy.

**After methodology / pipeline changes**:

1. `npm run ops -- calibration:recompute --org=<orgId>` to seed a fresh
   snapshot.
2. `npm run ops -- calibration:compare --before=<id> --after=<id>` to
   verify the change moved the right things.

**Operational**:

- `calibration:snapshot` for a quick "what's the latest" summary.
- `calibration:low-sample` weekly to gauge how much real signal exists
  in the calibration layer yet.
