# Pilot instrumentation + usage analytics + ROI (Module 26)

> Lightweight, privacy-conscious telemetry that lets the operator
> measure adoption, engagement, ROI, and the directional effect of
> adaptive ranking — without changing UX or breaking read-only.

## What's tracked vs not tracked

**Tracked (structured, scoped):**

| Event type                   | When it fires                                       |
| ---------------------------- | --- |
| `view_tab`                   | User switches tabs in the dashboard chrome.         |
| `open_report`                | User opens a research report detail.                |
| `open_alert`                 | User opens an alert card in the Briefing tab.       |
| `open_catalyst`              | User opens a catalyst card in the Catalysts tab.    |
| `open_brief`                 | User opens a pre-event brief.                       |
| `open_post_event_review`     | User opens a post-event review.                     |
| `open_delivery`              | User opens a delivery row in the Inbox.             |
| `click_through_delivery`     | User uses the inbox click-through to a deeper tab.  |
| `compare_toggle`             | User toggles the adaptive-ranking compare chip.     |
| `filter_change` / `sort_change` | Reserved — currently emitted by future surfaces. |

Each event carries:
- `orgId`, `userId`, `sessionId` (client-generated session bookend)
- `surface` + `fromSurface` (which dashboard tab)
- `contentKind` + `entityId` (report id, alert id, catalyst id, delivery attempt id)
- `rankingMode` (`baseline` / `adaptive` / `compare`)
- `sourceHealth` — coarse rollup at event time so usage is interpretable in light of degraded periods
- `meta` — small structured extras (severity, channel, rank index)

**Not tracked:**
- No PII. No keystrokes. No mouse positions. No raw URLs.
- No free-text user input. No clipboard data.
- No tracking of micro-interactions (hover, scroll, focus changes).
- The `meta` map is bounded to a handful of structured keys per event type.

## Engagement methodology

* **Open-rate** = (opens of a delivery) / (deliveries sent). One open per attempt is counted, regardless of repeat opens.
* **Click-through rate (CTR)** = (`click_through_delivery` events) / (deliveries sent). The user clicked the inbox row to a deeper tab.
* **Time-to-first-open** = first `open_delivery` event for the attempt − the attempt's `sentAt`. Median across all attempts in the window.
* **Time-to-first-important-open** = first `open_report` or `open_alert` on the same UTC day − morning brief `sentAt`. Captures whether a brief led anywhere.
* **Held-name critical alert open rate** = opens of held + critical alerts / count of those alerts. Proxy for "did the analyst look at the things that matter most?"
* **Coverage of held names reviewed before catalysts** = upcoming catalysts on held names where any `open_report` or `open_brief` on that ticker was emitted before `expectedAt`.

## Ranking experiment interpretation

Module 23's adaptive ranking can be active at any time. Module 26 buckets `open_*` events by the `rankingMode` flag the client emits. The aggregator reports:

* baseline / adaptive / compare-mode opens (counts)
* top-5 and top-10 opens per mode (where the open's `meta.rank ≤ 5` / `≤ 10`)
* median time-to-first-open per mode (per session, from `view_tab` on worklog/briefing → first `open_report`)

It then writes a hedged note: *"Median time-to-first-open is 29% faster under adaptive ranking. Directional positive. Sample n=12."* If `n < 20` the note explicitly says the result is directional. **We do not claim causality.**

## ROI snapshot methodology

`PilotRoiSnapshot` packages the metrics most useful for a pilot review:

* `morningBriefOpenRate`, `intradayCriticalOpenRate`, `clickThroughRate`
* `avgOpensPerActiveDay`, `medianTimeToFirstImportantOpenSeconds`
* `heldNameCriticalAlertOpenRate`, `heldNameReviewedBeforeCatalystRate`, `postEventReviewUsageRate`
* `channelEngagement[]` — per-channel delivered + opened + open-rate + CTR
* `readDepth[]` — sessions × opens per source surface (median, p90)

It also includes:
- `headlines[]` — short prose suitable for a review deck, automatically hedged
- `caveats[]` — sample-size warnings, missing review periods, low event volume

## Source-context attached

Every event records the org's overall source-health rollup at event time. This is critical: if usage looks weak during a window when sources were `failing`, that's not a product problem — it's an upstream problem. The Usage tab shows the source-health mix during the recorded window with an explicit "X% under degraded sources — interpret with care" chip when more than half the events occurred under degraded conditions.

## Operator workflows

```sh
# Adoption
npm run ops -- usage:summary            # last 7d, top surfaces, source-health mix
npm run ops -- usage:summary --days=30

# Delivery engagement
npm run ops -- usage:deliveries         # open rate + median t-to-open per kind × channel

# Ranking experiment
npm run ops -- usage:compare-ranking    # baseline vs adaptive opens + hedged note

# Engaged content
npm run ops -- usage:engaged-kinds      # top content kinds by opens
npm run ops -- usage:least-used         # least-touched surfaces

# Pilot ROI export
npm run ops -- usage:roi                # console summary
npm run ops -- usage:roi --out=pilot-roi-2026-04-26.json   # JSON for the deck

# Inspection
npm run ops -- usage:inspect --event=open_alert --days=7
npm run ops -- usage:inspect --catalyst=cat_tcs_q4fy26
npm run ops -- usage:inspect --id=att_abc123                # one delivery's events
```

## Privacy / minimalism principles

* **Fire-and-forget.** Telemetry calls never throw at the call site. If the network fails, events are dropped — silently — so the dashboard never breaks.
* **Aggregate-first.** All UI surfaces operate on snapshots, not raw event streams. Per-user trails are read-only and only visible to operators (CLI).
* **Bounded meta.** The `meta` field is a small `Record<string, string|number|boolean>`; no objects, no arrays, no secrets.
* **No silent claim of causality.** All ranking-experiment notes use words like "directional" and explicitly cite sample size.
* **Source context first.** Every snapshot reports the source-health mix during the window, so the operator can dismiss weak-usage windows that happened when upstream was down.

## How an operator decides whether the product is actually working in a live fund

Open the **Pilot Analytics** tab (or run `npm run ops -- usage:roi`). Read the **headlines** in order; they are deterministic. The first two headlines are the foundation:

1. **"Morning brief opened on X% of sent days"** — anything under ~50% means the morning workflow is not being adopted; investigate channel routing + delivery time.
2. **"X% of held-name critical alerts were opened"** — if this is below 80%, the pilot is missing the most consequential events on the book; revisit subscriptions and intraday cadence.

Then look at:

3. **`heldNameReviewedBeforeCatalystRate`** — if held-name catalysts are landing without prior reading, the system isn't yet replacing manual prep work.
4. **Median time-to-first-important-open** — under ~5 minutes after morning brief means the analyst is engaging immediately; over an hour means the brief is a nice-to-have rather than a workflow trigger.
5. **`avgOpensPerActiveDay`** + read-depth — depth signals genuine engagement; one-and-done sessions don't.
6. **`rankingExperiment`** — only flip adaptive ranking on permanently if the directional note is positive AND the sample is at least n=20.

Finally, check `caveats[]` and the source-health mix. If half the window was under `degraded` sources, most numbers are unreliable — re-run the snapshot after sources recover before drawing conclusions. The deterministic CLI export (`usage:roi --out=pilot-roi.json`) gives you a reproducible artifact for the pilot review meeting.
