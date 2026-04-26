# Post-event review + realized outcome attribution + calibration feedback (Module 22)

This module closes the catalyst loop. For every just-completed
catalyst, a deterministic server-side engine takes the pre-event
expectation snapshot from Module 21, pulls realized 1d/3d/5d/10d
returns from the market provider (Module 20), and produces a fully
populated `PostEventReview` with broker right/wrong attribution,
divergence resolution, expectation-error decomposition, and
calibration-feedback metadata for the calibration absorber.

The dashboard remains read-only end-to-end. Calibration scores **do
not silently change** — feedback metadata is exposed only and gated
behind the existing `VITE_CALIBRATION_AWARE_RANKING=1` /
`SERVER_CALIBRATION_AWARE_ALERTS=1` flags from Module 20.

---

## Architecture

```
catalyst engine produces ExpectationSnapshot (Module 21)
   │
   ▼
catalyst expectedAt passes
   │
   ▼
server/src/postEventReview/realizedOutcome.ts   ← market windows
server/src/postEventReview/brokerVerdicts.ts    ← right / wrong / inconclusive
server/src/postEventReview/divergenceResolution.ts ← resolved / persisted / widened / outlier_*
server/src/postEventReview/expectationErrors.ts ← decomposition rules
server/src/postEventReview/calibrationFeedback.ts ← per-broker / per-type / per-alert
server/src/postEventReview/prose.ts             ← optional LLM enrichment (noop default)
server/src/postEventReview/run.ts               ← orchestrator
server/src/postEventReview/bootstrap.ts         ← walk catalysts in grace window
   │
   ▼
persisted PostEventReview (extends Repo + InMemoryStore + Hybrid)
   │
   ▼
/v1/post-event-reviews
/v1/post-event-reviews/:id
/v1/catalysts/:id/post-event-review
   │
   ▼
src/components/catalysts/{CompletedEventsSection,PostEventReviewPanel,BrokerVerdictRow}.tsx
src/components/views/Catalysts.tsx (right-rail swaps Pre-Event ↔ Post-Event)
```

---

## What counts as "post-event"

A catalyst becomes reviewable when:
- `expectedAt` is in the past, AND
- `now − expectedAt ≤ 14 days` (the **post-event grace window**), AND
- `status !== 'cancelled'`.

Outside that window the catalyst is "stale" — the review may still
exist in history but isn't generated fresh on bootstrap.

---

## Methodology

### Realized outcome

[server/src/postEventReview/realizedOutcome.ts](../server/src/postEventReview/realizedOutcome.ts)

For each `(catalyst, window ∈ {1d, 3d, 5d, 10d})`:

1. Anchor = the close on (or first close after) `expectedDate`.
2. Terminal = anchor + N trading days.
3. `rawReturnPct` = `(terminal − anchor) / anchor × 100`.
4. `benchmarkRelReturnPct` = `rawReturn − benchmarkReturn` over the
   same window when a benchmark is wired.
5. `direction`:
   - `'flat'` if `|rawReturnPct| ≤ 25 bps × N` (flat-noise threshold).
   - `'up'` if positive, `'down'` if negative, else `'unknown'`.
6. `headlineDirection` aggregates per-window directions:
   - ≥ 2 ups & 0 downs → `'up'`.
   - ≥ 2 downs & 0 ups → `'down'`.
   - majority flat → `'flat'`.
   - any mix of ups + downs → `'mixed'`.

### Broker verdicts

[server/src/postEventReview/brokerVerdicts.ts](../server/src/postEventReview/brokerVerdicts.ts)

For each broker who held a stance going into the event (from the
pre-event snapshot's `opinions[]`):

| Pre-event stance | Realized headline | Verdict |
|------------------|-------------------|---------|
| `bullish`        | `up`              | `right` |
| `bearish`        | `down`            | `right` |
| `bullish`        | `down`            | `wrong` |
| `bearish`        | `up`              | `wrong` |
| `bullish` / `bearish` | `flat` / `mixed` / `unknown` | `inconclusive` |
| `neutral`        | any               | `no_view` (not penalized) |

Each verdict carries the broker's calibration score at review time
(when available) for the UI to show.

### Divergence resolution

[server/src/postEventReview/divergenceResolution.ts](../server/src/postEventReview/divergenceResolution.ts)

Decided by comparing pre-event closure state, post-event closure
state, and outlier verdicts:

| Result | Condition |
|--------|-----------|
| `outlier_vindicated`  | Pre-event outliers were directionally right (and no invalidations). |
| `outlier_invalidated` | Pre-event outliers were directionally wrong (and no vindications). |
| `no_divergence_pre`   | Pre-event closure showed no material divergence. |
| `resolved`            | Pre-divergent → post-consensus. |
| `widened`             | Pre-divergent + post-divergent + state changed; or pre-consensus + post-divergent. |
| `persisted`           | Pre-divergent + post-divergent + same state. |

Outlier vindication / invalidation takes precedence — it's the most
product-relevant signal.

### Expectation errors

[server/src/postEventReview/expectationErrors.ts](../server/src/postEventReview/expectationErrors.ts)

Deterministic decomposition. Each `ExpectationError` has a
`magnitude ∈ [0, 100]` and is sorted desc:

- `overly_bullish` — Street ≥ 60% bullish but realized down.
- `overly_cautious` — Street ≥ 40% bearish but realized up.
- `target_dispersion_too_wide` — pre-event spread ≥ 25%.
- `target_dispersion_too_narrow` — pre-event spread < 5% but realized direction was decisive.
- `high_calibration_brokers_wrong` — ≥ 1 broker with calibration score ≥ 25 was wrong.
- `outlier_was_right` — pre-event outliers were vindicated.
- `thin_coverage_pre_event` — only 1–2 brokers covered the name pre-event.
- `against_position_useful` — against-position alert lined up with realized direction.
- `against_position_not_useful` — against-position alert opposed realized direction.

If none of the above triggers, a single `no_significant_error` row
with magnitude 0 is emitted.

### Calibration feedback metadata

[server/src/postEventReview/calibrationFeedback.ts](../server/src/postEventReview/calibrationFeedback.ts)

The review emits a `CalibrationFeedback` block:

- `brokerCorrectness[]` — `(brokerId, correct, wrong, inconclusive)` 0/1 per row.
- `catalystTypePerformance` — rolled-up per-catalyst-type counters.
- `preEventAlertUsefulness[]` — `(alertId, useful, note)` for every alert that fired pre-event on the ticker.
- `eventDriven: true` — distinguishes from non-event calibration rows.
- `methodologyVersion` — bumped when scoring rules change.

This is **metadata only**. The calibration absorber consumes it in a
controlled way (gated by feature flags). Until that wiring lights up
in calibration's `run.ts`, the data is exposed and viewable; rankings
are not affected.

### Confidence band

| Band       | Condition |
|------------|-----------|
| `very_low` | No market coverage. |
| `low`      | ≤ 2 distinct brokers pre-event, OR no post-event reports. |
| `medium`   | 3–4 distinct brokers pre-event. |
| `high`     | ≥ 5 distinct brokers pre-event AND ≥ 3 post-event reports. |

---

## Caveats

- **Overlapping events**: post-event windows can be polluted by
  unrelated market moves. Benchmark-relative return mitigates this
  but doesn't remove it. Treat single-event verdicts as one
  observation, not a study.
- **Coverage gaps**: tickers without market coverage produce a
  `very_low` review with `coverageNote` set. Verdicts default to
  `inconclusive`.
- **Time anchoring**: anchor close is the close on `expectedDate` (or
  next available trading day). Intraday timing is not modeled.
- **Pre-event snapshot freshness**: reviews use the latest snapshot
  before the event. If the pre-event brief layer didn't run, no
  review can be produced (the bootstrap reports this as `skipped`).

---

## API

| Method | Path | Returns |
|--------|------|---------|
| GET | `/v1/post-event-reviews` | `PostEventReview[]` |
| GET | `/v1/post-event-reviews/:reviewId` | `PostEventReview` or 404 |
| GET | `/v1/catalysts/:catalystId/post-event-review` | `PostEventReview` or 404 |

All scope-enforced via `X-Org-Id`. Marked `tolerate404: true` in
`degraded.ts`.

---

## CLI

```
npm run ops -- postevent:review     --catalyst=<id>
npm run ops -- postevent:run-due    [--org=<orgId>]
npm run ops -- postevent:list       [--org=<orgId>] [--limit=<n>]
npm run ops -- postevent:compare    --catalyst=<id>     # pre-brief vs review
npm run ops -- postevent:brokers    [--org=<orgId>]      # right/wrong leaderboard
npm run ops -- postevent:weak       [--org=<orgId>]      # low-confidence reviews
npm run ops -- postevent:replay     [--org=<orgId>]      # rebuild after parser/correction changes
```

`postevent:replay` is the key one: after a parser / correction /
calibration methodology change, replay re-runs every review against
the canonical state so feedback metadata is consistent across the
new methodology.

---

## Calibration feedback wiring (gated)

When `VITE_CALIBRATION_AWARE_RANKING=1` (frontend) and / or
`SERVER_CALIBRATION_AWARE_ALERTS=1` (server) are flipped on, the
calibration absorber should:

1. Read the `brokerCorrectness[]` rows on each review and increment
   per-broker event-driven correctness counts.
2. Update per-broker calibration score with a small additive nudge
   per event (capped at e.g. ±2 points / event so a single bad event
   can't dominate).
3. Read `catalystTypePerformance` to specialize broker calibration
   per catalyst type when sample size justifies it.
4. Read `preEventAlertUsefulness` to bump alert-effectiveness scores
   on the alert kinds that matched realized direction.

The absorber lives in the calibration module's run path; this
feedback file produces the inputs.

---

## Optional LLM prose

`server/src/postEventReview/prose.ts`

Same rules as Modules 19 / 21 prose layers. The LLM may write a
compact executive summary grounded in the review's deterministic
bullets. `LLM_DISABLED=1` → noop. The UI shows `[LLM]` next to any
LLM-written prose.

---

## Workflow (pre + post-event loop)

**Each Monday morning (pre-event prep)**
1. Open Catalysts → **Next 7 days** section.
2. Click held catalysts → read the pre-event brief (Module 21).
3. Note which brokers' stances you're trusting going in.

**Wednesday / Thursday post-event**
4. Open Catalysts → scroll to **Recently completed events** (new section).
5. Click the most recent completed event → the right-rail swaps to the **Post-Event Review Panel**.
6. Skim:
   - Realized outcome (1d / 3d / 5d / 10d windows + benchmark-relative).
   - Broker verdicts table — who was right, who was wrong.
   - Divergence resolution — was the Street's split fight productive?
   - Where expectations missed — the decomposed error rows.
   - Top post-event reads — the next things to read on the name.
   - "What the system learned" — a plain-language note on the calibration implications.

**End of week (operator)**
7. `npm run ops -- postevent:run-due --org=<orgId>` to materialize all due reviews.
8. `npm run ops -- postevent:brokers --org=<orgId>` for a broker right/wrong leaderboard across recent events.
9. `npm run ops -- postevent:weak --org=<orgId>` to find reviews that don't have enough coverage to act on.

**Improvement loop over time**
10. As reviews accumulate, the calibration feedback metadata builds up under each broker / alert kind / catalyst type.
11. When the team is ready to act on calibration-aware ranking, flip `VITE_CALIBRATION_AWARE_RANKING=1` (and / or `SERVER_CALIBRATION_AWARE_ALERTS=1`) — the calibration absorber will start nudging scores from event-driven feedback.
12. Existing flows (My Book, Briefing, Worklog, By Stock, By Broker, Divergence, Sector, Calibration, Catalysts pre-event view) remain unchanged.
