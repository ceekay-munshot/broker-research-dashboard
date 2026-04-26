# Catalyst calendar + expectation monitor + pre/post-event briefing (Module 21)

This module makes the dashboard **forward-looking**. A swappable
catalyst input seam feeds upcoming events (earnings, guidance, AGM,
investor day, regulatory decision, capital-markets day, etc.) into a
deterministic server-side engine that:

- Builds a portfolio-aware **catalyst calendar**.
- For each upcoming catalyst, assembles an **expectation snapshot** —
  what the org's ingested broker set is currently saying into the event
  (no invented consensus).
- Computes 7d / 30d **expectation deltas** to show how the Street has
  moved into the event.
- Generates a deterministic **pre-event brief** for analyst pre-read
  (Why it matters · Expectation snapshot · Recent changes · Unresolved
  questions · Top reads · Calibration context · Risk flags).
- Holds a **post-event review** scaffold that future modules will fill
  with realized direction + broker scoring.

The dashboard remains read-only end-to-end. Optional LLM prose lives
in `prose.ts` and is noop by default — selection / ranking is **never**
LLM-driven.

---

## Architecture

```
catalyst input source (provider seam)
   │
   ▼
server/src/catalysts/catalystProvider.ts   ← FixtureCatalystProvider | EmptyCatalystProvider | future
   │
   ▼
server/src/catalysts/calendar.ts           ← portfolio-aware calendar
server/src/catalysts/expectations.ts       ← deterministic expectation snapshot
server/src/catalysts/delta.ts              ← 7d / 30d expectation delta
server/src/catalysts/brief.ts              ← pre-event brief assembly
server/src/catalysts/review.ts             ← post-event review scaffold
server/src/catalysts/prose.ts              ← optional LLM enrichment (noop default)
server/src/catalysts/run.ts                ← orchestrator
server/src/catalysts/bootstrap.ts          ← adapt store + fan out per org
   │
   ▼
persisted: CatalystEvent / ExpectationSnapshot / PreEventBrief /
           PostEventReview (extends Repo + InMemoryStore + Hybrid +
           jsonFileRepo)
   │
   ▼
/v1/catalysts                       /v1/catalysts/:id
/v1/catalysts/:id/brief             /v1/post-event-reviews
   │
   ▼
src/components/views/Catalysts.tsx
src/components/catalysts/{CatalystCard,CatalystTypeBadge,PreEventBriefPanel}.tsx
```

---

## Domain model

[src/domain/catalysts.ts](../src/domain/catalysts.ts)

| Type | Purpose |
|------|---------|
| `CatalystEvent` | One scheduled / estimated event with type, importance, status, source, ticker, sector, expected timestamp. |
| `CatalystType` | `earnings \| guidance_update \| investor_day \| capital_markets_day \| product_launch \| agm \| regulatory_decision \| mna \| other` |
| `CatalystStatus` | `scheduled \| estimated \| overdue \| completed \| cancelled` |
| `CatalystImportance` | `critical \| high \| medium \| low` |
| `CatalystCalendarEntry` | Catalyst + portfolio-aware decoration (membership, urgency, priority, risk flags, reasons). |
| `ExpectationSnapshot` | Frozen "what brokers say into the event" snapshot — stance mix, target mean / median / spread, opinions list, divergence flag, tilt summary. |
| `EventExpectationDelta` | 7d / 30d / etc. delta — stance shift, mean target change, opinion updates, rating up/downgrades, divergence shift, against-position alerts, outlier emergence, coverage breadth Δ. |
| `EventMonitoringWindow` | `24h \| 3d \| 7d \| 14d \| 30d` |
| `PreEventBrief` | The analyst-facing artifact: snapshot + 7d/30d deltas + sections + risk flags + executive summary. |
| `PreEventBriefSection` | `event_summary \| why_it_matters \| expectation_snapshot \| recent_changes \| unresolved_questions \| top_reads \| calibration_context \| risk_flags` |
| `PostEventReview` | Scaffold for after-the-fact comparison (filled by future modules). |
| `EventRiskFlag` | `thin_coverage \| widening_divergence \| against_position_pressure \| stale_coverage \| high_calibration_brokers_silent \| outlier_active` |

---

## Catalyst input seam

`server/src/catalysts/catalystProvider.ts`

```ts
interface CatalystInputProvider {
  listCatalysts(orgId: OrgId): readonly CatalystEvent[]
  hasAnyCoverage(): boolean
}
```

Bundled implementations:
- **FixtureCatalystProvider** — backed by `src/mocks/catalysts.ts`. Default for the mock adapter and dev.
- **EmptyCatalystProvider** — returns empty list. Engine produces an empty calendar gracefully.

Future integrations (no engine changes required):
- `HttpCatalystProvider` — fetch upcoming events from an external calendar API.
- `CsvCatalystProvider` — local file-backed dev fixture.

---

## Calendar engine

`server/src/catalysts/calendar.ts`

Per catalyst we compute:

- **`daysUntil`** — `(expectedAt − now) / day_ms`. Negative = overdue.
- **Urgency** — 110 if within 12h, scaling down to 10 beyond 30 days. 80 for overdue.
- **Importance rank** — `critical=100, high=70, medium=40, low=15`.
- **Position weight factor** — held adds up to +50% for ~10% weight, watchlist 0.7×, adjacent 0.4×, none 0.2×.
- **Priority score** — `urgency × (importance / 100) × weightFactor`.
- **Risk flags** — derived from canonical state:
  - `thin_coverage` — ≤ 2 distinct brokers in last 14d on a held / watchlist name.
  - `widening_divergence` — closure on the ticker is in `mixed_*`, `unresolved`, or `outlier_driven`.
  - `against_position_pressure` — ≥ 1 against-position alert in last 14d.
  - `stale_coverage` — last broker note older than the staleness threshold (7d high-conviction held, 14d normal held, 30d watchlist).
  - `high_calibration_brokers_silent` — within 7 days of event, top-calibrated brokers haven't published.
  - `outlier_active` — a high-calibration broker is currently an outlier.

The calendar is sorted by priority desc, then daysUntil asc.

---

## Expectation snapshot

`server/src/catalysts/expectations.ts`

For each non-completed catalyst, we read the canonical opinion + closure + calibration state for the ticker and assemble:

- `distinctBrokers`, `stanceMix` (bull / neutral / bear counts).
- `avgTargetPrice`, `medianTargetPrice`, `targetSpreadPct`, `avgImpliedUpsidePct`.
- `hasDivergence` (from conflict closure).
- `opinions[]` ranked by **calibration score** (when available) then last-updated.
- A one-line `tiltSummary` ("3/5 brokers bullish into the event.").

Nothing invented; deterministic from canonical state.

---

## Expectation delta

`server/src/catalysts/delta.ts`

For each (catalyst, window), we compare the current snapshot to the prior snapshot of the same catalyst at-or-before `(now − windowDays)`:

- `stanceShift`: `more_bullish | more_cautious | flat | mixed`. Computed by comparing bullish-pct and bearish-pct shifts (≥ 8 / ≤ −3 thresholds).
- `meanTargetChangePct`: average target Δ% across opinion updates in the window.
- `opinionUpdates`, `ratingUpgrades`, `ratingDowngrades`.
- `divergenceShift`: `widened | narrowed | unchanged`.
- `againstPositionAlerts`: count of against-position alerts in window.
- `outlierEmergence`: number of newly-active outliers vs prior closure.
- `coverageIntensityDelta`: distinct brokers in window minus prior snapshot's distinct broker count.

A one-line `reasons[]` list explains every non-zero contribution.

---

## Pre-event brief

`server/src/catalysts/brief.ts`

Sections (deterministic; LLM may rewrite `prose` per section but never changes `bullets` / `reportIds` / `alertIds`):

1. **Event summary** — type, importance, source, status notes.
2. **Why it matters to the book** — held / watchlist context, PM note, risk flags.
3. **Latest broker expectation snapshot** — tiltSummary + avg/median/spread + top opinions.
4. **Recent changes into the event** — 7d + 30d delta highlights.
5. **Unresolved questions / divergence** — recent against-position alerts + closure-driven notes.
6. **Top reports to read before the event** — ticker reports ranked by broker calibration then recency.
7. **Calibration context on covering brokers** — top brokers by calibration score on this org's book.
8. **Risk flags** — auto-detected concerns from the canonical state.

Briefs are persisted per (orgId, catalystId). Latest is what the UI shows.

---

## Post-event review (scaffold)

`server/src/catalysts/review.ts`

Module 21 ships only the **scaffold**: the `PostEventReview` domain
shape, the persistence path, the API endpoint, and a stub builder
that captures the pre-event snapshot. Future modules will:

1. Take a fresh post-event snapshot once new research arrives.
2. Score brokers' pre-event direction against the realized return
   (using the calibration / market layer from Module 20).
3. Mark divergence as resolved / lingering.

This keeps the seam stable so the UI doesn't break when the post-event
flow lights up.

---

## Optional LLM prose

`server/src/catalysts/prose.ts`

Same rules as alerts/digest prose (Module 19):

1. Section / bullet / report selection is deterministic — never touched.
2. Prose is grounded — only deterministic bullets + section context fed to the LLM.
3. `LLM_DISABLED=1` → noop.
4. Default provider is `noopProseProvider` — opt-in only.

The UI shows a small `[LLM]` badge wherever LLM-written prose appears.

---

## API

| Method | Path | Returns |
|--------|------|---------|
| GET | `/v1/catalysts` | `CatalystEvent[]` |
| GET | `/v1/catalysts/:catalystId` | `CatalystEvent` or 404 |
| GET | `/v1/catalysts/:catalystId/brief` | `PreEventBrief` or 404 |
| GET | `/v1/catalysts/:catalystId/snapshots` | `ExpectationSnapshot[]` |
| GET | `/v1/post-event-reviews` | `PostEventReview[]` |

All endpoints scope-enforced via `X-Org-Id`. Marked `tolerate404: true`
in `degraded.ts` — a fresh tenant with no calendar yet renders a
graceful empty state.

---

## CLI

```
npm run ops -- catalysts:upcoming      [--org=<orgId>] [--days=<n>]
npm run ops -- catalysts:brief         --catalyst=<id>
npm run ops -- catalysts:weekly-briefs [--org=<orgId>]
npm run ops -- catalysts:delta         --catalyst=<id> --window=<7d|30d>
npm run ops -- catalysts:weak-coverage [--org=<orgId>]
npm run ops -- catalysts:replay        [--org=<orgId>]
```

`catalysts:replay` re-runs the engine end-to-end against the canonical
state so calendar, snapshots, briefs, and reviews are fresh.
`catalysts:weak-coverage` lists briefs where coverage breadth is too
thin to act on confidently.

---

## Workflow

**Each Monday morning + ad-hoc**

1. Open the **Catalysts** tab. The default filter is *Held + watchlist*.
2. Skim **Next 7 days** — the most urgent catalysts on the book, sorted by priority.
3. Click any catalyst → the **Pre-Event Brief Panel** opens on the right with executive summary, snapshot header, and all sections.
4. From the brief, jump to:
   - The report drawer for any **Top read**.
   - The **Briefing** tab for any referenced alert (e.g. against-position).
   - The stock drawer for the ticker.
5. Toggle to **Has risk flag** to filter only catalysts with auto-detected concerns (thin coverage, widening divergence, etc.).
6. Use **Next 30 days** for plan-ahead reading lists.
7. End-of-week: skim **Beyond 30 days** for prep on AGMs / capital-markets days.

**Operator (out-of-band)**
- `npm run ops -- catalysts:weekly-briefs --org=org_aranya` to print every brief due in the next 7 days.
- `npm run ops -- catalysts:delta --catalyst=cat_aranya_tcs_q4 --window=7d` to compare 7d vs current expectation state.
- `npm run ops -- catalysts:weak-coverage --org=org_aranya` to find briefs where the read may be unreliable.

**Post-event (later modules)**
- `PostEventReview` records compare pre-event snapshots to realized post-event research.
- The scaffold is in place; the next module will fill `directionallyRightBrokerIds` and feed back into the calibration layer.
