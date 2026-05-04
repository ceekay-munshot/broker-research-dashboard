# Server-output contract — what the dashboard expects

The dashboard does **not** ingest mail, run LLM extraction, or aggregate
research. The cofounder's server does all of that and emits a single
**`DashboardServerOutput`** envelope per snapshot. The dashboard slices that
envelope into the views every screen renders.

This file is the single source of truth for what the server must emit.
Everything below is also expressed as TypeScript types in
[`src/adapters/serverOutput/types.ts`](../src/adapters/serverOutput/types.ts).

---

## Wire shape (top level)

```ts
type DashboardServerOutput = {
  feedStatus:           FeedStatusPayload                 // always present
  generatedAt:          string | null                      // ISO-8601 UTC
  sessionScope:         { orgId: string; actingUserId: string } | null
  organization:         Organization | null
  currentUser:          User | null
  brokers:              Broker[]
  sectors:              Sector[]
  stocks:               Stock[]
  kpi:                  KpiSnapshot | null
  emails:               BrokerEmail[]
  attachments:          Attachment[]
  reports:              ResearchReport[]
  summaries:            ReportSummary[]
  evidence:             EvidenceSnippet[]
  opinions:             BrokerStockOpinion[]
  conflictClosures:     ConflictClosure[]
  sectorIntelligence:   SectorIntelligence[]
  portfolio:            PortfolioSnapshot | null
  alerts:               AlertEvent[]
  digests:              AlertDigest[]
  calibrationSnapshot:  CalibrationSnapshot | null
  brokerCalibrations:   BrokerCalibrationSummary[]
  alertEffectiveness:   AlertEffectivenessSummary[]
  coverageSignals:      CoverageSignalResult[]
  catalysts:            CatalystEvent[]
  preEventBriefs:       PreEventBrief[]
  postEventReviews:     PostEventReview[]
  deliveries:           DeliveryAttempt[]
  orgUsageSnapshot:     OrgUsageSnapshot | null
  pilotRoiSnapshot:     PilotRoiSnapshot | null
  orgSettings:          OrgSettings | null
  configAuditEntries:   ConfigAuditEntry[]
  sessionSafety:        SessionSafetySnapshot | null
}
```

The full per-resource type definitions live in [`src/domain/`](../src/domain).

**Empty contract:** every list field defaults to `[]` and every nullable
defaults to `null`. The dashboard renders its full shell with placeholder
text ("Awaiting server output", "—") under those defaults.

---

## `feedStatus` — drives the header chip

```ts
type FeedStatusPayload = {
  status:                    'live' | 'delayed' | 'error' | 'waiting'
  itemsToday:                number | null
  lastExtractionReceivedAt:  string | null   // ISO-8601 UTC
  lastSuccessfulSyncAt:      string | null   // ISO-8601 UTC
  message:                   string | null   // optional human note
}
```

| Status      | Header pill renders               | When to send                                           |
|-------------|-----------------------------------|--------------------------------------------------------|
| `waiting`   | "Waiting for feed" (slate)        | Server hasn't started or has nothing to report         |
| `live` (≥1) | "Feed live · {itemsToday} today"  | Backend is producing extractions today                 |
| `live` (0)  | "No extracted items yet" (slate)  | Backend connected, no extractions yet today            |
| `delayed`   | "Feed delayed" (amber)            | Lag, partial failures, or stale heartbeat              |
| `error`     | "Feed unavailable" (rose)         | Outright backend failure                               |

The dashboard never *infers* `live` from data alone — the server is
authoritative. `message` is shown in the chip's tooltip when set.

---

## Per-screen field usage

For every screen below, the column **Required?** describes what the screen
needs to be useful. **Missing behavior** is what the dashboard does today
when the field is null/empty.

### Header (always visible)

| Field               | Type           | Required | Missing behavior                  |
|---------------------|----------------|----------|-----------------------------------|
| `feedStatus`        | object         | yes      | "Waiting for feed" pill           |
| `organization.shortName` | string    | optional | Org chip shows "—"                |

### Sidebar (filters)

| Field        | Type        | Required | Missing behavior                       |
|--------------|-------------|----------|----------------------------------------|
| `brokers`    | Broker[]    | optional | Broker filter list is empty            |
| `sectors`    | Sector[]    | optional | Sector filter list is empty            |
| `stocks`     | Stock[]     | optional | Stock filter list is empty             |

### Dashboard tab

| Field                          | Type             | Required | Missing behavior                       |
|--------------------------------|------------------|----------|----------------------------------------|
| `kpi`                          | KpiSnapshot      | optional | KPI cards show 0 with no delta         |
| `kpi.brokersTracked`           | number           | optional | "0"                                    |
| `kpi.reportsIngested`          | number           | optional | "0"                                    |
| `kpi.stocksCovered`            | number           | optional | "0"                                    |
| `kpi.divergenceFlags`          | number           | optional | "0"                                    |
| `kpi.windowDeltas.*`           | KpiDelta         | optional | "flat"                                 |
| `reports`                      | ResearchReport[] | optional | "Rolling research feed · 0 items"      |

### My Book tab

| Field                | Type                 | Required             | Missing behavior         |
|----------------------|----------------------|----------------------|--------------------------|
| `portfolio`          | PortfolioSnapshot    | required for book UI | Empty "No portfolio data yet — awaiting server output" |
| `reports`            | ResearchReport[]     | populates "Today on the book" | Empty list  |
| `summaries`          | ReportSummary[]      | drives relevance scoring | Empty       |
| `opinions`           | BrokerStockOpinion[] | book-level coverage  | Empty                    |
| `conflictClosures`   | ConflictClosure[]    | divergence on book   | Inferred from opinions if absent |

### Alerts & Briefing tab

| Field        | Type          | Required | Missing behavior                  |
|--------------|---------------|----------|-----------------------------------|
| `digests`    | AlertDigest[] | optional | "No briefing yet — awaiting server output." |
| `alerts`     | AlertEvent[]  | optional | "No alerts in the feed."          |

### Daily Worklog tab

Same dependency set as My Book + `reports` / `summaries` / `evidence` for
the worklog cards.

### By Broker / By Stock / Divergence tabs

| Field                | Type                 | Required | Missing behavior                  |
|----------------------|----------------------|----------|-----------------------------------|
| `brokers`            | Broker[]             | required for tab to render | Empty   |
| `stocks`             | Stock[]              | required for tab to render | Empty   |
| `opinions`           | BrokerStockOpinion[] | drives all three tabs      | Empty   |
| `conflictClosures`   | ConflictClosure[]    | Divergence tab             | "0 of 0 covered names flagged"  |

### Sector Feed tab

| Field                | Type                  | Required | Missing behavior |
|----------------------|-----------------------|----------|------------------|
| `sectorIntelligence` | SectorIntelligence[]  | optional | Empty per-sector list |

### Calibration tab

| Field                  | Type                          | Required | Missing behavior |
|------------------------|-------------------------------|----------|------------------|
| `calibrationSnapshot`  | CalibrationSnapshot           | optional | "No calibration data yet — awaiting server output." |
| `brokerCalibrations`   | BrokerCalibrationSummary[]    | optional | Empty            |
| `alertEffectiveness`   | AlertEffectivenessSummary[]   | optional | Empty            |
| `coverageSignals`      | CoverageSignalResult[]        | optional | Empty            |

### Catalysts tab

| Field             | Type             | Required | Missing behavior |
|-------------------|------------------|----------|------------------|
| `catalysts`       | CatalystEvent[]  | optional | "No catalysts yet · Awaiting server output." |
| `preEventBriefs`  | PreEventBrief[]  | optional | Pre-event drawer shows nothing |
| `postEventReviews`| PostEventReview[]| optional | Completed-events row empty |

### Inbox tab

| Field         | Type               | Required | Missing behavior |
|---------------|--------------------|----------|------------------|
| `deliveries`  | DeliveryAttempt[]  | optional | "Nothing delivered yet · Awaiting server output." |

### Pilot Analytics tab (operator/admin only)

| Field                | Type              | Required | Missing behavior |
|----------------------|-------------------|----------|------------------|
| `orgUsageSnapshot`   | OrgUsageSnapshot  | optional | "No usage data yet · Awaiting server output." |
| `pilotRoiSnapshot`   | PilotRoiSnapshot  | optional | ROI panel hidden |

### Control Plane tab (operator/admin only)

| Field                  | Type                | Required | Missing behavior |
|------------------------|---------------------|----------|------------------|
| `orgSettings`          | OrgSettings         | optional | "No org settings yet · Awaiting server output." |
| `configAuditEntries`   | ConfigAuditEntry[]  | optional | Empty audit list |
| `sessionSafety`        | SessionSafetySnapshot | optional | Hidden          |

---

## What the dashboard does NOT consume

These are server-side concerns. **Do not send them.**

- Email account credentials, IMAP/Gmail/Outlook tokens
- Source integration config (provider URLs, retry/backfill knobs)
- LLM prompts, model names, temperatures
- Raw email bodies for an "email viewer" UI
- Ingestion job control (queue depths beyond the simple `feedStatus` headline)
- Source-mode toggles (`http` / `fixture` / `mock`)

The dashboard previously had UI for these and the surfaces have been
deliberately removed.

---

## What the dashboard DERIVES (do NOT send)

These are computed client-side from other fields. The server can ignore them.

- **Stance from rating** — `Buy`/`Overweight` → bullish, `Hold`/`Not Rated`
  → neutral, `Underweight`/`Sell` → bearish. The server may also send
  `stance` directly (the dashboard uses whichever is present).
- **Implied upside %** — `targetPrice / lastPrice − 1`. Computed from
  `BrokerStockOpinion.targetPrice` and `Stock.lastPrice`.
- **Sector roll-ups, divergence, conflict closures** — pure functions over
  `opinions[]` and `closures[]`. The server may send
  `sectorIntelligence` / `conflictClosures` if it has them; otherwise the
  dashboard computes lighter versions on demand.

---

## Adapter implementation

The dashboard's runtime adapter that consumes this contract is
[`src/adapters/serverOutput/ServerOutputAdapter.ts`](../src/adapters/serverOutput/ServerOutputAdapter.ts).

Until the cofounder wires server fetching, the adapter holds an in-memory
payload and exposes:

- `setPayload(payload: DashboardServerOutput | null)` — replace the active
  payload (call from integration code or browser console).
- `getPayload(): DashboardServerOutput | null` — read the current payload.
- `getFeedStatus(): FeedStatusPayload` — the header chip's read path.
- `subscribe(listener)` — notified on `setPayload()`.

To wire HTTP fetching later, the integration layer can:

```ts
import { getServerOutputAdapter } from './adapters'

async function pollServer() {
  const res = await fetch('/api/dashboard-output')
  const payload = await res.json()
  getServerOutputAdapter()?.setPayload(payload)
}
setInterval(pollServer, 30_000)
```

That's the only integration the dashboard needs.

---

## Adapter mode

Set via `VITE_RESEARCH_ADAPTER`:

| Value              | Adapter                  | Use                                        |
|--------------------|--------------------------|--------------------------------------------|
| `server` (default) | `ServerOutputAdapter`    | Production runtime — consumes this contract |
| `mock`             | `MockResearchAdapter`    | Dev only — fixture-backed, never in prod   |
| `upstream`         | `HttpResearchAdapter`    | Legacy per-resource HTTP contract          |
| `upstream-fixture` | `FixtureUpstreamAdapter` | Wire-shape rehearsal                       |

When `VITE_RESEARCH_ADAPTER` is unset, the dashboard boots into `server`
mode with no payload — the empty/placeholder state described above.
