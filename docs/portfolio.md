# Portfolio overlay & fund-aware relevance (Module 18)

This module makes the broker dashboard **portfolio-aware**. The same
research feed your team already sees on the Daily Worklog and By Stock
tabs is now ranked, filtered, and surfaced through the lens of the fund's
actual book and watchlist.

It is fully **read-only**. There are no write actions, no auth, no
client-side server logic. The entire portfolio surface degrades cleanly
when no portfolio is configured for the org.

---

## What it does

A portfolio-aware analyst can now answer, in seconds:

- What landed today that matters to my **current book**?
- What matters to my **watchlist**?
- Which **held names** had broker view changes?
- Which **positions** have unresolved divergence or conflict?
- Which important positions have **stale or thin coverage**?

Every answer is deterministic. The relevance engine is rule-based; every
ranking carries a list of `PortfolioRelevanceReason` strings explaining
*why* the item ranks where it does.

---

## Layers

```
external portfolio source
   │
   ▼
PortfolioInputProvider   ← swappable seam (fixture / HTTP / CSV / API)
   │
   ▼
ResearchAdapter.getPortfolioSnapshot(scope) → PortfolioSnapshot | null
   │
   ▼
src/engine/portfolioRelevance.ts   ← deterministic relevance
src/engine/portfolioCoverage.ts    ← deterministic coverage / staleness
   │
   ▼
src/viewModels/portfolio/overlay.ts  ← shared `PortfolioOverlay`
   │
   ├──▶ My Book tab           (src/components/views/MyBook.tsx)
   ├──▶ Daily Worklog overlay (decorate + filter + sort)
   ├──▶ By Stock book column
   └──▶ By Broker on-book section
```

`PortfolioSnapshot` is the only thing the upstream is asked to provide.
The engines compute relevance and coverage from the snapshot plus the
canonical research slice the dashboard already loads.

---

## Domain model

Defined in [src/domain/portfolio.ts](../src/domain/portfolio.ts).

| Type | Purpose |
|------|---------|
| `PortfolioSnapshot` | Top-level snapshot for one org as of `asOf`. Holds positions + watchlist. |
| `PortfolioPosition` | One held line: ticker, direction, weight, conviction, tags, owner, note. |
| `WatchlistEntry` | Tracked but not held; lighter shape (no direction or weight). |
| `PortfolioDirection` | `long` \| `short` \| `hedge` |
| `PortfolioConviction` | `high` \| `medium` \| `low` |
| `PortfolioMembership` | `held` \| `watchlist` \| `adjacent` \| `none` (engine-derived) |
| `PortfolioRelevance` | Per (report × ticker) bucket + score + reasons + book summary. |
| `PortfolioCoverageSummary` | Per-position metrics + risk flags. |
| `PositionRiskFlag` | `no_coverage` \| `single_broker_coverage` \| `stale_coverage` \| `unresolved_divergence` \| `broker_outlier` \| `recent_significant_change` |

### Required vs optional input

| Field | Required? | Notes |
|-------|-----------|-------|
| `id`, `orgId`, `asOf`, `source` | Required | |
| `positions[*].ticker`, `direction` | Required | Direction defaults to `long` only via the upstream mapper, never the engine. |
| `positions[*].weightPct` | Optional | Required for "size weight" relevance bonus. |
| `positions[*].conviction` | Optional | Drives the `high-conviction` bonus + tighter staleness threshold. |
| `positions[*].costBasis`, `openedAt`, `tags`, `ownerUserId`, `note` | Optional | Surface in detail UIs only. |
| `watchlist[*].ticker`, `addedAt` | Required | |
| `totalGrossExposurePct` | Optional | Shown in My Book header when present. |
| `isConfigured` | Optional | Defaults to `true` in the mapper. Set false to render a placeholder. |

If the snapshot is missing entirely (adapter returns `null`), every
portfolio-aware surface degrades clearly:

- The **My Book** tab renders a "No portfolio configured" empty state.
- The **Daily Worklog** hides book chips, drops the book sort, and works
  exactly as it did pre-Module 18.
- **By Stock** hides the Book column.
- **By Broker** hides the On Book section.

---

## Input seam

`src/adapters/portfolio/PortfolioInputProvider.ts` defines:

```ts
interface PortfolioInputProvider {
  getPortfolioSnapshot(scope: OrgScope): Promise<PortfolioSnapshot | null>
}
```

Bundled implementations:

- `FixturePortfolioProvider` — reads `src/mocks/portfolios.ts`. Default
  for the mock adapter.
- `EmptyPortfolioProvider` — always returns null. Use when no source is
  wired yet.

The HTTP adapter calls `GET /v1/portfolio-snapshot` and returns null when
the upstream replies `404` (the endpoint is registered as
`tolerate404: true` in `src/adapters/upstream/degraded.ts`).

To add a new source (CSV, third-party portfolio API, internal admin
service), implement `PortfolioInputProvider` and pass it to
`new MockResearchAdapter({ portfolioProvider: ... })` (or wrap the HTTP
adapter equivalently). No engine, no view-model, no UI change required.

---

## Relevance engine

[src/engine/portfolioRelevance.ts](../src/engine/portfolioRelevance.ts)

For every `(report × ticker)` pair, the engine computes a
`PortfolioRelevance` with:

- `bucket`: `critical` \| `high` \| `medium` \| `low` \| `none`
- `score`: total points
- `reasons`: every fired rule, with a short text + point delta
- `membership`, `direction`, `conviction`, `weightPct`
- `bookSummary`: a one-line "why this matters to the book" string

### Rules (additive, all deterministic)

| Code | Rule | Points |
|------|------|--------|
| `pf_held` | Ticker is held | +40 |
| `pf_watchlist` | Ticker is on watchlist | +20 |
| `pf_adjacent` | Ticker is in same sector as a held name | +5 |
| `pf_size` | Held position with weight ≥ 5% / ≥ 7% | +15 / +25 |
| `pf_conviction` | Held position marked high-conviction | +10 |
| `pf_against` | Broker stance opposes position direction | +22 |
| `pf_with` | Broker stance supports position direction | +4 |
| `pf_divergence` | Unresolved street state on held/watchlist name | +14 |
| `pf_outlier` | This broker is an outlier on a held/watchlist name | +8 |
| `pf_pile_in` | ≥ 3 brokers covering the name in last 7 days | +10 |
| `sig_target` | Target change ≥ 7% (≥ 15% for `+18`, else `+10`) | +10 / +18 |
| `sig_type` | `rating_change` / `initiation` (+8); `flash` / `earnings_review` (+4) | +4 / +8 |
| `recency_fresh` | Received within 36 hours | +8 |
| `recency_week` | Received within 7 days | +3 |

### Bucket thresholds

```
critical  ≥ 90
high      ≥ 55
medium    ≥ 25
low       ≥ 1
none      = 0
```

---

## Coverage / staleness engine

[src/engine/portfolioCoverage.ts](../src/engine/portfolioCoverage.ts)

For every held + watchlist ticker, computes:

- `reportsLast24h`, `reportsLast3d`, `reportsLast7d`
- `distinctBrokersLast7d`, `distinctBrokersAllTime`
- `daysSinceLastReport`, `lastReportAt`
- `hasUnresolvedDivergence` (drawn from `ConflictClosure`)
- `hasOutlier` (any broker flagged as outlier)
- `recentChangeBucket` (`major` ≥ 15% target Δ, `moderate` ≥ 7%, else `minor`)
- `riskFlags` — surfaced as chips in My Book and By Stock

### Staleness thresholds

| Position class | Days since last note before "stale" |
|----------------|-------------------------------------|
| Held, high-conviction | 7 |
| Held, normal | 14 |
| Watchlist | 30 |

---

## Morning workflow

The recommended way for a PM/analyst to use the dashboard each morning:

1. **Open My Book.** It is the new first tab.
   - Skim the headline: held / watchlist counts, gross exposure, today's
     report count on book, critical-relevance count, stale & divergent
     counts.
   - Read the **"Today on the book"** section first — these are
     deterministically the most book-relevant items in the last 24 h.
   - Read the **"Significant broker changes (7d)"** section — material
     rating/target moves, including when a broker view opposes your
     position direction.
   - Scan **"Unresolved divergence on the book"** — held names where the
     Street disagrees. Click "Open in Divergence" if you need the full
     conflict closure.
   - Scan **"Watchlist with fresh research"** — names worth promoting
     to the book if the thesis confirms.
   - Scan **"Stale or thin coverage"** — risk surface: positions that
     deserve a chase or independent diligence.
   - Optional: skim the **All positions** grid for any single position
     you want to dive into.

2. **Switch to Daily Worklog**. Use the **Book filter** chip set to
   focus on what's left to triage:
   - `Book` — held + watchlist only
   - `Held` — only held names
   - `Watchlist` — only watchlist names
   - `Against position` — broker views that oppose your direction
   - `Uncovered` — items NOT in the book (sector reads, broad notes)
   - Toggle **`Book first`** to dominate the priority sort with the
     book relevance score, not the generic priority score.

3. **By Stock** is now portfolio-sorted: held names float to the top,
   then watchlist. The Book column shows direction / weight / 7-day
   broker count / staleness flags inline.

4. **By Broker** ranks brokers by how many of your book names they
   touched recently. Each broker card shows the latest items on book +
   an outlier flag.

The non-portfolio paths (Dashboard, Sector Feed, Divergence) remain
intact — they continue to work whether or not a portfolio is configured.

---

## Required vs optional portfolio data

Minimum to enable Module 18:

- `PortfolioSnapshot` with at least one `PortfolioPosition` whose
  `ticker` and `direction` are set, **or** at least one
  `WatchlistEntry`.

Recommended for full fidelity:

- `weightPct` on positions (size-aware ranking)
- `conviction` on positions (high-conviction stale threshold)
- `note` on positions / watchlist (shows on My Book cards)
- `ownerUserId` (future use — per-owner filtering)

The engines never require any of the optional fields; rules that depend
on them simply don't fire.

---

## Tests / verification

- The `mock` adapter ships with realistic Aranya / Sahyadri / Vimana
  snapshots in [src/mocks/portfolios.ts](../src/mocks/portfolios.ts).
- The HTTP adapter resolves `/v1/portfolio-snapshot` against the same
  fixtures via `server/src/api/routes.ts`. Switching `VITE_RESEARCH_ADAPTER`
  between `mock`, `mock-http`, and `local` produces identical book
  surfaces — validating the contract end-to-end.
- The `upstream-fixture` adapter returns `null` for the snapshot,
  exercising the degraded path.
