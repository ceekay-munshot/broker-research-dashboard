# Alerts, digests & notifications (Module 19)

This module turns the dashboard from pull-only into proactive. A
deterministic server-side trigger engine reads the canonical store +
the org's portfolio overlay and emits structured `AlertEvent` records.
A digest builder rolls those alerts into a Morning Book Brief, an
Intraday Critical feed, and a Coverage Hygiene digest. Suppression
prevents repeat-spam. Optional LLM prose enriches headlines and
section blurbs without ever participating in alert *selection*.

The frontend reads alerts and digests through the canonical `/v1`
contract. There are **no write actions** in the analyst dashboard.

---

## Architecture

```
canonical store (HybridCanonicalStore + Repo)
   │
   ▼
server/src/alerts/triggers.ts        ← rule registry (deterministic)
server/src/alerts/severity.ts        ← deterministic severity scoring
server/src/alerts/suppression.ts     ← fingerprint + dedup window
server/src/alerts/digest.ts          ← deterministic digest assembly
server/src/alerts/prose.ts           ← optional LLM enrichment (no-op default)
server/src/alerts/run.ts             ← orchestrator
   │
   ▼
persisted: alertEvents / alertDigests / digestRuns / notifications
   │
   ▼
/v1/alerts                  /v1/alert-digests
/v1/alerts/:id              /v1/alert-digests/:id
                            /v1/alert-digests/latest?kind=...
   │
   ▼
src/viewModels/alerts/      ← UI view-models
src/components/views/Briefing.tsx
src/components/alerts/{AlertCard,SeverityBadge,AlertBanner}.tsx
+ AlertBanner embedded in My Book
```

---

## Domain model

[src/domain/alerts.ts](../src/domain/alerts.ts)

| Type | Purpose |
|------|---------|
| `AlertEvent` | One emitted alert. Carries severity, kind, headline/body, reasons, book context, lineage, fingerprint, suppression flag. |
| `AlertRule` | Static registry entry for a trigger. Holds `defaultSeverity`, `audience`, `suppressionWindowMinutes`, `enabled`. |
| `AlertSeverity` | `critical \| high \| medium \| low \| info` |
| `AlertTriggerKind` | Closed taxonomy of rules. Adding a new rule = append a new value. |
| `AlertReason` | `{ code, text, severityDelta? }` — explainable contribution to score + UI. |
| `DeliveryChannel` | `in_app \| cli \| webhook \| email \| slack` |
| `AlertAudience` | `pm \| analyst \| team \| all` |
| `AlertDigest` | Deterministic roll-up: title, subtitle, generatedAt, window, sections, alertCount, topSeverity, executiveSummary. |
| `DigestSection` | `{ key, title, subtitle, alertIds, prose, proseFromLlm }` |
| `DigestKind` | `morning_brief \| intraday_critical \| coverage_hygiene` |
| `DigestRun` | One generation pass. Audit row: status, alertsEmitted, alertsSuppressed, llmCallCount, llmCostUsd, source. |
| `NotificationRecord` | One delivery attempt: channel, status, attemptedAt, deliveredAt, error. |

---

## Trigger registry

`server/src/alerts/triggers.ts` exports `RULES`, a static list of
`(AlertRule, TriggerFn)` entries. Each `TriggerFn` is **pure** — given
the same canonical inputs and portfolio snapshot, it returns the same
candidate alerts.

| Trigger kind | Fires when |
|--------------|-----------|
| `new_research_held` | A held name has a fresh report in the window. |
| `new_research_watchlist` | A watchlist name has a fresh report. |
| `significant_change_held` | Target moves ≥ 7% (or ≥ 15% for `target_major`) on a held name. |
| `against_position` | Broker stance opposes the position direction (long/short). |
| `unresolved_divergence_held` | Conflict closure on a held name in `mixed_*`, `unresolved`, or `outlier_driven` state. |
| `broker_outlier_held` | A broker is an outlier (vs Street consensus) on a held name. |
| `pile_in_book` | ≥ 3 brokers cover a book name in 7 days. |
| `stale_coverage_high_conviction` | High-conviction held name without a broker note in 7 days. |
| `stale_coverage_held` | Held name without a broker note in 14 days. |
| `stale_coverage_watchlist` | Watchlist name without a broker note in 30 days. |
| `watchlist_fresh_candidate` | Watchlist name with ≥ 2 fresh notes in 3 days — promotion signal. |
| `correction_replay_change` | (Reserved — fires when a correction replay materially changes a held-name conclusion.) |

Rules are pluggable. Adding a new kind = appending a `TriggerFn` and
one `RULES` entry. Engine code never branches on kind elsewhere.

---

## Severity rules

[server/src/alerts/severity.ts](../server/src/alerts/severity.ts)

Severity is computed deterministically:

1. Each kind has a baseline (`KIND_BASE`).
2. Each `AlertReason.severityDelta` adds to the score.
3. Position size weight bonus (≥ 7% : +15, ≥ 5% : +8, ≥ 3% : +3).
4. High conviction always +8.
5. Score → bucket via fixed thresholds: `critical ≥ 80, high ≥ 50, medium ≥ 25, low ≥ 1, else info`.

Same inputs ↦ same severity.

---

## Suppression / dedup

[server/src/alerts/suppression.ts](../server/src/alerts/suppression.ts)

Each candidate computes a SHA-256 fingerprint over `(orgId, kind,
ticker, brokerId, reportId, bucket)`. The orchestrator checks the
prior persisted alert feed for a matching fingerprint within the
rule's `suppressionWindowMinutes`. If matched, the candidate is
written with `suppressed: true` (so an operator can inspect what was
collapsed) but never re-delivered.

Default windows:
- `new_research_held`: 30 min
- `new_research_watchlist`: 60 min
- `significant_change_held`, `against_position`: 120 min
- `unresolved_divergence_held`, `broker_outlier_held`, `pile_in_book`: 12 h
- `stale_coverage_*`: 24–48 h
- `watchlist_fresh_candidate`: 12 h

---

## Digest builders

[server/src/alerts/digest.ts](../server/src/alerts/digest.ts)

| DigestKind | Window | Sections |
|-----------|--------|----------|
| `morning_brief` | 36 h | Today on the book · Significant broker changes · Unresolved divergence on the book · Watchlist with fresh research · Stale or thin coverage |
| `intraday_critical` | 4 h | Critical (last 4h) · High priority (last 4h) |
| `coverage_hygiene` | 30 d | High-conviction stale · Held stale · Watchlist stale · Broker outliers |

Section assembly is deterministic — `filterAndRank()` uses severity
rank + `generatedAt` desc. The set of alertIds in each section is
stable for the same input.

---

## Optional LLM prose

[server/src/alerts/prose.ts](../server/src/alerts/prose.ts)

`enrichDigestProse(digest, alerts, provider)` rewrites
`section.prose` and `executiveSummary`. Rules:

1. Trigger selection / ranking is **never** touched.
2. Prose must be grounded — only the deterministic headlines + reasons
   of the already-selected alerts are passed to the LLM.
3. If the LLM is unavailable (`LLM_DISABLED=1` or no API key), returns
   the digest unchanged.
4. The UI shows a small `[LLM]` badge on any prose that came from the
   LLM, so the path is auditable.

The default provider is `noopProseProvider` — opt-in only.

---

## Persistence

`server/src/persistence/types.ts` extends the `Repo` interface with:

```ts
upsertAlertEvent(rec)            getAlertEvent(orgId, id)         listAlertEvents(orgId, filter?)
upsertAlertDigest(rec)           getAlertDigest(orgId, id)        listAlertDigests(orgId, filter?)
upsertDigestRun(rec)             getDigestRun(orgId, id)          listDigestRuns(orgId, limit?)
upsertNotification(rec)                                            listNotifications(orgId, limit?)
loadAlertsForOrg(orgId)
```

Implemented in `InMemoryRepo` and `JsonFileRepo`. The `SqliteRepo`
stub remains a documented upgrade path. `HybridCanonicalStore`
dual-writes alert/digest/run/notification records to the configured
`Repo` so digests survive process restarts.

---

## API contract

| Method | Path | Returns |
|--------|------|---------|
| GET | `/v1/alerts?sinceMs=&includeSuppressed=&limit=` | `AlertEvent[]` |
| GET | `/v1/alerts/:alertId` | `AlertEvent` or 404 |
| GET | `/v1/alert-digests?kind=&limit=` | `AlertDigest[]` |
| GET | `/v1/alert-digests/latest?kind=` | `AlertDigest` or 404 |
| GET | `/v1/alert-digests/:digestId` | `AlertDigest` or 404 |

All endpoints are scope-enforced via `X-Org-Id`. Marked
`tolerate404: true` in `degraded.ts` — a fresh tenant with no alerts
yet renders an empty briefing surface.

---

## CLI

```
npm run ops -- alerts:morning            [--org=<orgId>]
npm run ops -- alerts:intraday           [--org=<orgId>]
npm run ops -- alerts:hygiene            [--org=<orgId>]
npm run ops -- alerts:list               [--org=<orgId>] [--severity=critical|high|medium|low|info] [--limit=<n>]
npm run ops -- alerts:digest:preview     [--id=<digestId>] [--kind=morning_brief|intraday_critical|coverage_hygiene]
npm run ops -- alerts:replay             [--org=<orgId>] [--window=<7d|24h>]
npm run ops -- alerts:digest:compare     --before=<digestId> --after=<digestId>
npm run ops -- alerts:suppressed         [--org=<orgId>]
```

`alerts:digest:compare` prints the alertId-level diff between two
digests so you can verify whether a parser/prompt/correction change
materially altered the morning briefing.

---

## Morning workflow

1. Open the dashboard. **My Book** is the default tab; if there are
   any `critical` or `high` alerts on the book, an `AlertBanner`
   appears at the top — click it to open the Briefing.
2. **Briefing** opens on the **Morning Book Brief** by default.
   - Read the executive summary one-liner.
   - Skim **Today on the book** — fresh research on positions in the
     last 36h, ranked by severity.
   - Skim **Significant broker changes** — material target moves +
     against-position broker views.
   - Skim **Unresolved divergence on the book** — conflicting
     coverage that may need a closer read.
   - Skim **Watchlist with fresh research** — promotion candidates.
   - Skim **Stale or thin coverage** — risk surface on the book.
3. Switch to **Intraday Critical** mid-day to see what fired in the
   past 4 hours.
4. Run **Coverage Hygiene** at end of day to catch staleness.

If you want a fresh read on demand, the analyst (or operator) can run
`npm run ops -- alerts:morning --org=<orgId>` from the command line.
The same path runs on server boot, so a daily cron is a one-line wrapper.
