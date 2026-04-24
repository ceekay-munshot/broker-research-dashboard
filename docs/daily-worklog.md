# Daily Worklog

> The analyst's morning triage surface for inbound broker research.

## What it's for

Every morning the worklog answers:

1. **What came in today?** One row per actionable (report × ticker), not per email.
2. **What should I read first?** Every row has a deterministic priority
   bucket (`high` / `medium` / `low`) with an explainable score.
3. **What actually changed?** Target price deltas, rating-bearing updates,
   and same-day multi-broker overlap are surfaced inline.
4. **What is digest noise vs signal?** Origin classification + duplicate
   collapsing keep the list clean.
5. **Where should I go next?** Detail panel has one-click pivots to the
   Report, Stock, and Divergence tabs.

## Where it lives

- Top-level tab: **Daily Worklog** (first tab; landing view).
- View component: [`src/components/views/DailyWorklog.tsx`](../src/components/views/DailyWorklog.tsx)
- View-model:    [`src/viewModels/worklog/`](../src/viewModels/worklog/)
- Hook:          [`src/hooks/useWorklogViewModel.ts`](../src/hooks/useWorklogViewModel.ts)

Data comes *only* through the canonical `ResearchAdapter`. No fixtures
are imported. No special-casing. Swapping the adapter mode
(`upstream` / `local` / `mock` / `mock-http` / `upstream-fixture`)
reshapes the data without touching the worklog code.

## Item model

A single `WorklogItem` represents one (report × ticker) pair:

- Single-ticker report → 1 worklog item.
- Multi-ticker report (morning brief covering MARUTI and LT) → 2 items.
  Each gets the shared summary but carries its own ticker, sector,
  divergence flag, and priority score.

Each item carries:

- Broker (id, name, brand color)
- Ticker, stock name, sector
- Received / published timestamps
- Report type (`earnings_review`, `morning_note`, `flash`, …)
- Stance, rating, target price, prior target, target Δ (abs + %)
- **Origin**: how the item was produced.
  - `direct_attachment` — single-ticker report with a PDF
  - `direct_body` — single-ticker body-only note
  - `digest_split` — one per ticker out of a multi-ticker note
- Evidence count, divergence flag, hasAttachment
- **Source**: parent email id + subject, `isSplitFromDigest`,
  `collapsedIds[]`, `duplicateCount`
- **Priority**: `bucket` + `score` + `reasons[]`

## Priority scoring

Priority is explicit, rule-based, and every rule that fires contributes a
short reason string. No LLM. The Priority tab on the detail panel
surfaces the full rule table.

### Rules

| Rule                 | Points        | When it fires                                               |
| -------------------- | ------------- | ----------------------------------------------------------- |
| `report_type`        | 25 / 20 / 15 / 5 / 0 | earnings_review = flash = initiation = 25; earnings_preview = 20; update / deep_dive = 15; sector_note = 5 |
| `tp_change_big`      | +35           | Target Δ ≥ 10% vs prior                                     |
| `tp_change_mid`      | +20           | 5% ≤ Target Δ < 10%                                         |
| `tp_change_small`    | +8            | 0 < Target Δ < 5%                                           |
| `rated`              | +6            | Rating present and not `Not Rated`                          |
| `no_rating`          | -5            | No rating attached                                          |
| `multi_broker`       | +10 per extra broker, cap 25 | ≥ 2 brokers covering this ticker today       |
| `divergence`         | +15           | ConflictClosure reports a mixed/outlier state, or a heuristic detects opposing opinions |
| `evidence_rich`      | +10           | ≥ 3 evidence snippets                                       |
| `evidence_some`      | +4            | 1–2 evidence snippets                                       |
| `evidence_none`      | -3            | No evidence                                                 |
| `recency_fresh`      | +8            | Received in last 4 hours                                    |
| `recency_today`      | +4            | Received today (≤ 12 h)                                     |
| `direct_attachment`  | +6            | `direct_attachment` origin                                  |
| `direct_body`        | +3            | `direct_body` origin                                        |
| `digest_split`       | -4            | `digest_split` origin                                       |
| `bearish_signal`     | +4            | Stance is bearish                                           |

### Buckets

- `score ≥ 60` → **high**
- `score ≥ 25` → **medium**
- else → **low**

Tied scores are broken by recency (newer first).

Rules are tunable; every change lives in
[`src/viewModels/worklog/priority.ts`](../src/viewModels/worklog/priority.ts).

## Duplicate / noise suppression

Broker research is inherently duplicative — morning briefs repeat the
same ticker across sections, flash notes get re-forwarded, analysts
subscribe to multiple distribution lists. We never drop data; we pick a
**canonical** item per `(brokerId, ticker, utc-day)` tuple and collapse
the rest into its `source.duplicateCount` + `source.collapsedIds[]`.

Canonical-selection rule (deterministic):

1. Higher priority bucket wins.
2. Higher raw score wins.
3. `direct_attachment` > `direct_body` > `digest_split`.
4. Earliest `receivedAt` wins (first-arrival anchors the timeline).
5. Lexicographic id tie-break.

Collapsed items show as `+N dup` on the canonical card; the detail
panel's Lineage tab lists each collapsed id.

## Digest-derived items

When a report has more than one ticker, each ticker gets its own
worklog item with:

- `origin = 'digest_split'`
- `source.isSplitFromDigest = true`
- Headline prefixed with the ticker (e.g. `MARUTI — JMFL Morning Brief`)
  so the row is actionable at a glance even though the parent title is
  generic.
- The same underlying summary + evidence (they all came from the same
  report and carry the same thesis).

Priority's `digest_split` rule nudges these items *down* relative to
direct single-stock notes, which matches analyst intuition: a direct
earnings review is more actionable than a paragraph in a morning brief.

## Filters + grouping

- **Date window**: Today (default) / 3d / 7d / All
- **Grouping**: chronological (default), priority, broker, stock
- **Priority bucket**: high / medium / low
- **Origin**: PDF / Body / Digest
- **Signal flags**: has target Δ · has divergence · has evidence

Filters combine via AND. Buckets + origins within a group combine via OR.

## Required vs optional data

The worklog renders meaningfully with only the catalogs and the report
list. Everything else degrades gracefully:

| Resource                        | Required? | Degrades to                                     |
| ------------------------------- | --------- | ----------------------------------------------- |
| `organization`, `me`, `brokers`, `sectors`, `stocks` | required | bootstrap fails upstream of the tab  |
| `researchReports`               | required  | — (empty list → empty state)                    |
| `reportSummary` (per item)      | optional  | `summaryShort` falls back to report-type label  |
| `reportEvidence` (per item)     | optional  | evidence count is 0; priority penalty applied   |
| `opinions`                      | optional  | multi-broker + opinion-based divergence off     |
| `conflictClosures`              | optional  | divergence inferred from opinions if present    |
| `brokerEmails`                  | optional  | parent-email subject hidden in Lineage tab      |

All missing optional resources surface as a small amber banner under the
filters so the analyst knows the tab is running on reduced signal.

## How to use it each morning

Short version:

1. Open the dashboard. The Daily Worklog tab is the landing view.
2. Read the **header strip**: items today, high priority, active brokers,
   stocks touched, target changes, divergence.
3. Scan the **High** bucket first. Each card shows broker, ticker,
   rating, target change, and the top three priority reasons.
4. Click a card to open the **detail panel**. Tabs: Summary → Evidence
   → Priority rationale → Lineage.
5. Use the one-click pivots at the bottom of the detail panel:
   **Open report** → full report drawer; **Open stock** → By-Stock view;
   **View divergence** → Divergence tab when street disagreement is flagged.
6. If the top is clean, switch grouping to **Broker** or **Stock** to
   audit coverage.
7. To widen beyond today, flip Window to **3d** / **7d**.

The worklog is designed to replace "refreshing email in the morning" for
broker research — the analyst's first 15 minutes of the day.
