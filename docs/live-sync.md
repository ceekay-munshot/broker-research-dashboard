# Live raw-upstream sync + durable persistence + replay

> The operational layer that turns the server-side pipeline into a live
> system: pulls from a real upstream raw API, persists state across
> process restarts, materializes canonical entities incrementally, and
> supports safe replay.

The frontend `/v1` contract is unchanged. Daily Worklog, broker-memory,
change detection, By Stock / By Broker change rails, divergence,
sector feed, and every other consumer surface render the same data
they did before. Module 14 is purely additive on the server side.

## Where it fits

```
external raw upstream API
        │  HTTPS GET /v1/raw/emails?since=…&cursor=…
        ▼
RawUpstreamClient                       (server/src/sync/client.ts)
        ▼
sync runner — dedupes by fingerprint    (server/src/sync/runner.ts)
        ▼
pipeline                                (server/src/pipeline/, Module 13)
        ▼
HybridCanonicalStore — dual write       (server/src/persistence/HybridCanonicalStore.ts)
        ├──→ in-memory mirror (fast reads for /v1)
        └──→ Repo (durable: JsonFileRepo / SqliteRepo / InMemoryRepo)
        ▼
/v1 HTTP API (server/src/api/)          ← unchanged
        ▼
canonical /v1 → adapter mappers → domain → view-models → UI
```

## Persistence model

The `Repo` interface (`server/src/persistence/types.ts`) is the seam.
Three implementations ship:

| Implementation   | When to use                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `InMemoryRepo`   | Tests. Volatile.                                                 |
| `JsonFileRepo`   | **Default.** Durable across restarts; atomic writes via tmp+rename; one file per logical table; no native deps. Sized for ~thousands of records per org. |
| `SqliteRepo`     | Documented upgrade path. Install `better-sqlite3`, set `SERVER_PERSISTENCE=sqlite`. Same `Repo` interface; one-file swap. |

What's persisted:

- **Raw artifacts** — every `RawEmailArtifact` we ever fetched, with
  state, fingerprint, error, and timing.
- **Jobs** — one row per pipeline run (initial + each replay), with the
  full state-history.
- **Review queue** — every review item with its category, detail, and
  resolution status.
- **Sync checkpoints** — per-org cursor + last-run counters; powers
  incremental sync and `/v1/ingestion-status`.
- **Canonical entities** — `BrokerEmail`, `Attachment`,
  `ResearchReport`, `ReportSummary`, `EvidenceSnippet`,
  `BrokerStockOpinion`. The `/v1` API serves these directly via the
  hybrid in-memory mirror.

The `HybridCanonicalStore` extends `InMemoryStore`. On every upsert it
also writes to the `Repo`. On startup it calls
`hydrateFrom(organizations.map(o => o.id))` and the API serves
instantly from cache.

## Idempotency model

Three keys protect against duplicates — checked in this order:

1. **Stable fingerprint** = sha256 of
   `org | upstreamId | messageId | sha256(from|subject|receivedAt)`.
   The runner rejects any artifact whose fingerprint already exists in
   `state = materialized_ready`. See `rawEmailFingerprint(...)`.
2. **Deterministic canonical IDs.** The pipeline materializer derives
   `BrokerEmail.id`, `ResearchReport.id`, `ReportSummary.id`,
   `EvidenceSnippet.id`, `Attachment.id` as
   `{prefix}_{sha256(stableInputs).slice(0,12)}`. Re-running on the
   same input produces byte-identical IDs and writes are upserts.
3. **Per-(broker, ticker) opinion key.** Opinions upsert by
   `(orgId, brokerId, ticker)`, so a re-emitted opinion replaces in
   place.

Linked artifacts get their own fingerprint (`url + content-hash`) so
the same blog post linked from three different emails extracts once.

## Sync runner

```ts
syncOnce({ orgId, client, repo, pipeline, cursorOverride?, sinceOverride?, maxPages? })
```

Loop:

1. Read the per-org checkpoint to get the last cursor.
2. Page through `client.fetchSince(...)` until empty or `maxPages`.
3. For each row:
   - Compute fingerprint.
   - If already materialized — skip.
   - Else: persist `RawEmailArtifact` with `state = fetched_raw`, run
     pipeline, persist final state + job + any review-queue items.
4. Update the checkpoint with the new cursor + counters.
5. `repo.flush()`.

The runner returns a `SyncRunResult` with `fetchedCount`, `newCount`,
`materializedCount`, `failedCount`, `reviewCount`,
`enrichmentDisabledCount`, `enrichmentFailedCount`, and
`durationMs` — exactly what `/v1/ingestion-status` surfaces.

## Replay / reprocess

```ts
replayOne({ orgId, artifactId, repo, pipeline })
replayAllFailed({ orgId, repo, pipeline })
```

`replayOne` re-fetches the persisted `RawEmailArtifact` from the repo
(never the upstream — the raw record is canonical here), re-runs the
pipeline, and upserts the canonical entities. Because IDs are
deterministic, the re-run is byte-identical when nothing has changed,
or atomic-replaces the prior records when the pipeline has been
updated.

`replayAllFailed` is a convenience: replays every artifact currently
in `failed` or `review_needed` state. Useful after fixing a parser
bug or after the LLM provider comes back online.

## CLI

```bash
npm run ops -- sync [--org=org_vimana] [--reset]
npm run ops -- replay --id=<rawId> [--org=org_vimana]
npm run ops -- replay-failed [--org=org_vimana]
npm run ops -- list-failures [--org=org_vimana]
npm run ops -- list-review   [--org=org_vimana]
npm run ops -- clear-review --id=<reviewId> [--note="..."]
npm run ops -- status        [--org=org_vimana]
```

`SERVER_PERSISTENCE` selects the repo (`file` default | `memory` |
`sqlite`). `SERVER_DATA_DIR` controls the JSON-file location (default
`./data/server`).

## What happens when LLM is off

The pipeline runs with `NoOpLlmProvider` by default. Every test in
`npm run test:sync` proves the no-LLM path produces complete canonical
records. The runner counts:

- `enrichmentDisabledCount` — candidates that returned `null`
  (provider intentionally didn't enrich).
- `enrichmentFailedCount` — provider threw `LLM_FAILURE_FALLBACK`;
  pipeline continued with deterministic-only fields.

Both are surfaced via the sync checkpoint and `/v1/ingestion-status`.

## Raw upstream id → canonical id mapping

There is **no** synthetic mapping table. The chain is:

1. Upstream gives us `(upstreamId, RawEmailArtifact)`.
2. Pipeline computes `RawEmailArtifact.id = sha(messageId)`.
3. Materializer derives canonical IDs from `messageId` (and ticker
   index for multi-ticker reports).

So:

```
upstreamId        →  raw_email.id (pipeline-internal)
                     ↓
RawEmailArtifact     ↓
                     ↓
BrokerEmail.id       (sha of messageId)
                     ↓
ResearchReport.id    (sha of `${messageId}:${i}:${ticker}`)
ReportSummary.id     (sha of same)
EvidenceSnippet.id   (sha of `${reportId}:${field}:${i}`)
```

Provenance from the upstream is preserved in three places:

- `PersistedRawEmail.upstreamId` — the upstream's row id.
- `BrokerEmail.sourceMessageId` — RFC 5322 Message-ID.
- `EvidenceSnippet.provenance.id` — for `email_attachment` evidence,
  the attachment filename; for `linked_*`, the URL.

## What's dev-only vs production-shaped

| Component                                 | Status                                          |
| ----------------------------------------- | ----------------------------------------------- |
| `Repo` interface                          | Production-shaped                               |
| `JsonFileRepo`                            | Production-shaped (small-volume tenants)        |
| `SqliteRepo`                              | Documented upgrade path; install `better-sqlite3` |
| `HybridCanonicalStore`                    | Production-shaped                               |
| `Pipeline`                                | Production-shaped (Module 13)                   |
| `HttpRawUpstreamClient`                   | Production-shaped                               |
| `MockRawUpstreamClient`                   | Dev / test only                                 |
| `npm run ops -- sync`                     | CLI; runs against the configured client         |
| `OpenAi/AnthropicLlmProvider`             | Stubbed at the boundary; install + wire as needed |
| Browser-side raw parsing                  | **Never.** All raw processing is server-side.   |

## Verifying

```bash
npm run typecheck      # frontend + server
npm run test:contract  # canonical /v1 mappers (33/33)
npm run test:bridge    # raw-upstream → /v1 bridge (21/21)
npm run test:pipeline  # server pipeline (10/10)
npm run test:sync      # live-sync end-to-end (7/7)
npm run build          # frontend bundle
```

All five must stay green for any change to module 14.
