# Adaptive Ranking (Module 23)

> Calibration-aware, trust-weighted prioritization. Bounded, explainable
> nudges to existing baseline scores. Pure transform; no I/O.

This module turns the trust signals built across Modules 20–22 into a
re-ranking layer that gently nudges priority on every list the analyst
reads, with hard caps so no single noisy source can dominate. Existing
baselines remain authoritative — adjustments are visible, explainable,
and capped.

## Why this exists

The dashboard already has good per-surface baselines:

* **Daily Worklog** ranks by `priority.score` (rules-based).
* **My Book** ranks each "today on the book" row by `relevance.score`.
* **Alerts / Briefing** rank by severity then recency.
* **By Broker** ranks `latestOnBook` by relevance bucket.
* **Pre-Event briefs** publish `top_reads` in deterministic order.

But none of these baselines remember whether the broker, alert kind,
catalyst type, or per-broker post-event correctness has historically been
right. Module 23 adds a single, deterministic engine that reads:

* Module 20 broker calibration scores.
* Module 20 alert-kind effectiveness scores.
* Module 22 catalyst-type performance (directionally right vs wrong).
* Module 22 per-broker event-driven correctness.

…and produces a bounded `RankAdjustment` per item.

## Engine guarantees

* **Pure & deterministic** — no `Date.now()`, no I/O. Same inputs → same
  output. Lives at [src/engine/adaptiveRanking.ts](../src/engine/adaptiveRanking.ts).
* **Bounded by source.** Each source has its own cap (±10 / ±8 / ±5 / ±5).
* **Bounded globally.** The sum is clamped to ±15 before being applied.
* **Confidence-gated.** Sources below the gate are *suppressed*, not
  zeroed — the suppression note appears in the tooltip.
* **Explainable.** Every contribution carries a verbatim reason string
  ("Broker calibration +6.0 (high, n=18)") that surfaces in the UI.

## Feature flags

Two flags govern the layer; both default off.

| Flag | Effect |
| --- | --- |
| `VITE_CALIBRATION_AWARE_RANKING=1` | Apply adjusted scores to ordering on the high-value surfaces (Daily Worklog, My Book, Alerts, By Broker, Pre-Event top reads). When off, surfaces render with their pre-Module-23 baseline ordering bit-for-bit. |
| `VITE_SHOW_RANKING_COMPARE=1` | Render the operator/dev compare chip (`rank ▲2 · cal +5`) on adjusted items. Hover for the reason list. Independent of the apply flag — chips still appear when the apply flag is off, so you can see what *would* change. |
| `SERVER_CALIBRATION_AWARE_ALERTS=1` | Reserved for future server-side digest re-ranking. Not yet active. |

The wired surfaces are:

* `src/viewModels/worklog/builder.ts` — Daily Worklog
* `src/viewModels/portfolio/myBookBuilder.ts` — My Book "today on the book", "significant changes", "watchlist fresh"
* `src/viewModels/alerts/feedBuilder.ts` + `briefingBuilder.ts` — Alerts feed + briefing sections
* `src/viewModels/byBroker.ts` — By Broker `latestOnBook`
* `src/viewModels/catalysts/briefBuilder.ts` — Pre-Event brief `top_reads`

## Bounds + thresholds (current values)

```
Per-source caps:
  broker_calibration              ±10
  alert_kind_effectiveness         ±8
  catalyst_type_performance        ±5
  post_event_broker_correctness    ±5

Global cap:
  GLOBAL_CAP                      ±15

Confidence gates:
  broker_calibration              medium
  alert_kind_effectiveness        medium
  catalyst_type_performance       n ≥ 4 directional events
  post_event_broker_correctness   n ≥ 3 events for this broker
```

Run `npm run ops -- adaptive:flags` to print the live values.

## Reading a `RankAdjustment`

```ts
{
  baselineScore: 60,            // from the surface (e.g. relevance.score)
  adjustedScore: 64.5,          // baseline + Σ source contributions, clamped
  delta: 4.5,                   // round2(adjustedScore - baselineScore)
  applied: true,                // ≥1 source contributed and delta ≠ 0
  reasons: [
    { source: 'broker_calibration', text: 'Broker calibration +4.5 (high, n=18)', delta: 4.5, clamped: false },
  ],
  suppressed: [
    { source: 'alert_kind_effectiveness', text: 'Alert-kind effectiveness suppressed (low, n=2)' },
  ],
}
```

Each surface wraps this in an `AdaptiveAnnotation` (see
`src/viewModels/adaptiveRanking/types.ts`):

```ts
{
  adjustment: RankAdjustment,
  rankDelta: 2,                 // positions moved vs baseline order (positive = up)
  moved: true,                  // adjustment.delta !== 0 || rankDelta !== 0
}
```

## Compare mode in the UI

When `VITE_SHOW_RANKING_COMPARE=1`, every adjusted item renders a small
chip:

```
rank ▲2 · cal +5.0
```

* `▲n` — moved up by n positions vs baseline ordering.
* `▼n` — moved down.
* `▬`  — same position; only the score nudged.
* `cal +X.Y` — the signed delta applied to the baseline.

Hovering the chip reveals the full reason list and any suppressions.

## CLI workflows

All commands are read-only.

```sh
# Print engine bounds + flags.
npm run ops -- adaptive:flags

# Show what nudges would apply for one broker at three baseline anchors.
npm run ops -- adaptive:inspect --broker=brk_jpmorgan

# Top 20 movers + top-5 / top-10 ordering changes across recent reports.
npm run ops -- adaptive:compare --limit=100

# Side-by-side baseline vs adaptive ordering of recent reports.
npm run ops -- adaptive:preview --limit=50
```

`adaptive:preview` and `adaptive:compare` use a synthesized baseline
(stance + rating + target presence) so they work without depending on
any one surface. Output is deterministic given the calibration snapshot
+ post-event reviews currently in the org.

## Operator's safety checklist

When toggling the apply flag on for a real org:

1. Run `npm run ops -- calibration:snapshot` — confirm there is one.
2. Run `npm run ops -- calibration:brokers --limit=20` — confirm enough
   brokers carry `medium`/`high` confidence to be useful.
3. Run `npm run ops -- adaptive:compare` — review the top-20 movers and
   the top-5 ordering changes. If there are large unexpected swings,
   investigate the underlying broker-calibration / post-event review
   data before flipping the apply flag.
4. Flip `VITE_SHOW_RANKING_COMPARE=1` first, on a single user. Let them
   work for a day with chips visible but ordering unchanged.
5. Then flip `VITE_CALIBRATION_AWARE_RANKING=1`. Surfaces re-rank,
   chips remain.

## Failure modes and how the UI degrades

* **No calibration snapshot.** `adaptive` is `null` on every item.
  Surfaces fall back to baseline ordering. No chips render.
* **No post-event reviews.** The catalyst-type and per-broker event
  sources are suppressed; the broker-calibration and alert-kind sources
  still contribute when their own confidence gates are met.
* **Insufficient sample size.** That source is suppressed and a note
  appears in the tooltip — the global delta shrinks accordingly.

## What this module deliberately does **not** do

* It does not modify the canonical baseline scores (`priority.score`,
  `relevance.score`, severity).
* It does not write to the canonical store; the engine is a pure read.
* It does not change the `/v1` API contract.
* It does not push trust signals into the upstream provider.
* It does not move ranking into a server-side hot path. The server-side
  `SERVER_CALIBRATION_AWARE_ALERTS` flag is reserved for a future
  digest-re-ranking pipeline; today the engine runs in the dashboard's
  view-model layer.
