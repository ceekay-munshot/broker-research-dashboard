# Server-side raw-artifact pipeline

> The backend stage that turns raw upstream broker research (emails,
> attachments, linked webpages, linked PDFs) into the canonical `/v1`
> entities the dashboard already consumes — without changing anything
> the frontend sees.

## Where this fits

```
raw upstream API
      ↓                              (raw payloads)
raw-upstream → /v1 normalization bridge   (frontend HTTP boundary)
      ↑
─── server-side ─────────────────────────────────────────────────
                                     (raw artifacts: email + PDFs + URLs)
      ↓                              ↓
  server/src/ingestion/  ←─ LEGACY ──┘
  server/src/pipeline/   ←─ NEW (this doc)
      ↓
  InMemoryStore (canonical store)
      ↓
  /v1 HTTP API (server/src/api/)
─────────────────────────────────────────────────────────────────
      ↓
canonical /v1 → adapter mappers → domain → view-models
      ↓
Daily Worklog · broker-memory · By Stock changes · By Broker changes ·
divergence · sector feed · report detail
```

The pipeline lives at `server/src/pipeline/`. It writes to the same
`InMemoryStore` the existing API serves, so the frontend contract stays
identical. The legacy `server/src/ingestion/` code remains as a
fixture-driven dev harness; the new pipeline reuses pieces of it
(`.eml` parsing primitives, sender allowlist, parser profiles) without
replacing it.

## Processing states

Every artifact carries a `ProcessingState`:

```
fetched_raw
   ↓ extractEmailEnvelope
parsed_email
   ↓ AttachmentTextExtractor.extract  (per attachment)
extracted_attachment_text
   ↓ LinkedArtifactExtractor.extract  (per URL — optional, soft-fails)
extracted_linked_artifact_text
   ↓ deterministic field extraction
deterministic_fields_ready
   ↓ LlmProvider.enrich  (optional; deterministic-only fallback)
llm_enriched
   ↓ materialize  →  InMemoryStore
materialized_ready  ✓

           ┌── failed                  (unrecoverable, e.g. broker not resolved)
   exits ──┤
           └── review_needed           (recoverable, e.g. ambiguous ticker)
```

Terminal states are `materialized_ready`, `failed`, and `review_needed`.
Every transition is appended to `RawEmailArtifactJob.history` so an
operator can audit where a stuck job got stuck.

## Deterministic-first extraction

Per the order of preference rules, **deterministic fields always win
over inference**. The deterministic layer at
`server/src/pipeline/deterministic/` produces:

| Field             | Source                                                    |
| ----------------- | --------------------------------------------------------- |
| `(orgId, brokerId)` | sender allowlist (`server/src/config/allowlist.ts`)      |
| `ticker`          | catalog match against `server/src/config/organizations.ts`|
| `rating`          | action phrases (`upgrade to Buy`) > standalone keyword   |
| `targetPrice`     | TP / PT / target-price patterns; raise > primary         |
| `priorTargetPrice`| explicit `prior TP` > `from ₹X`                          |
| `reportType`      | subject vocabulary                                        |
| `dates`           | `receivedAt` + `publishedAt` from envelope                |
| `digest split`    | section-heading + ticker-anchor heuristics                |

When a deterministic rule fires with an ambiguity (multiple equally
likely tickers, conflicting rating actions), the artifact is enqueued
for review **and** the candidate is still emitted. Operators can clear
the review item once they've decided the canonical interpretation.

## Linked artifacts

Linked URLs in the email body are first-class but optional inputs.
For each link:

- **Fetch** via the pluggable `LinkedArtifactExtractor` boundary.
  Tests use `CachedLinkedArtifactExtractor` (cached payload from the
  fixture). Production uses `HttpFetchLinkedArtifactExtractor` (Node's
  global fetch + an HTML→text fallback). Real PDF text extraction is a
  separate plug-in.
- **Classify** as `linked_webpage` or `linked_pdf` from `Content-Type`
  + the body's `hint`.
- **Extract text** with provenance pointing at the URL.
- **Contribute to deterministic detection** — the linked text is
  folded into the same regexes the body uses, so a PT in a linked PDF
  resolves the same way as one in the email body.
- **Become evidence** — when the linked text contributed to a field,
  the materializer writes an `EvidenceSnippet` whose `provenance.kind`
  is `linked_webpage` / `linked_pdf` and whose `id` is the URL.

When a fetch fails, the pipeline emits a `BROKEN_LINKED_ARTIFACT`
review item but **never blocks** materialization of the underlying
email.

## Source precedence rules

When more than one source provides the same field:

1. **Explicit > implicit.** A subject line "raises TP to ₹4,200" beats
   a body sentence "we have a target around 4,200."
2. **Action verbs > standalone keywords.** "Downgrade to Sell" beats
   "Sell" as a noun in another sentence.
3. **Attachment > linked artifact > body.** When the attachment PDF
   states a target, that wins over a number in the body — broker PDFs
   are the system-of-record for the formal recommendation.
4. **First-arrival wins on duplicates.** When the same `messageId` is
   re-processed, the materialized IDs are deterministic so the second
   run replaces the first byte-for-byte.

## LLM enrichment boundary

`server/src/pipeline/enrich/` defines `LlmProvider` plus three
implementations:

| Provider              | Use it when                                 |
| --------------------- | ------------------------------------------- |
| `NoOpLlmProvider`     | Default. Used by every test. Deterministic-only path. |
| `OpenAiLlmProvider`   | Stub. Wires a real implementation by passing a `fetcher` that calls the OpenAI API. |
| `AnthropicLlmProvider`| Stub. Same shape, swap the upstream model.  |

Three rules every provider must respect:

1. **Deterministic fields are immutable.** Broker, ticker, rating,
   target prices, dates, report type are passed in on the candidate;
   the provider may use them as context, never replace them.
2. **Every enrichment field is evidence-backed.** The provider returns
   `evidence: EvidenceSpan[]` covering each contributed field. The
   materializer drops un-grounded fields. `ensureEvidenceBacked()` is
   the helper that enforces this — provider implementations call it
   on raw model output before returning.
3. **Failures degrade.** A provider that errors throws
   `PipelineError('LLM_FAILURE_FALLBACK', detail)`. The orchestrator
   catches it, enqueues a review entry, and continues with the
   deterministic-only candidate. The pipeline always produces *some*
   canonical record.

LLM is only used for: thesis / themes / risks / catalysts / harder
digest splitting / change-vs-prior synthesis. It is never used to
extract a number, a rating, or a ticker.

## Review / failure path

The `ReviewQueue` is a module-level store keyed by `(messageId,
reasonCategory)`. Categories:

| Category                  | Trigger                                                 |
| ------------------------- | ------------------------------------------------------- |
| `AMBIGUOUS_TICKER`        | Multiple equally-likely tickers, no primary             |
| `CONFLICTING_RATINGS`     | Distinct rating actions on the same candidate           |
| `CONFLICTING_TARGETS`     | Distinct numeric targets on the same candidate          |
| `BROKEN_LINKED_ARTIFACT`  | URL fetch returned non-content / errored                |
| `EMPTY_EXTRACTION`        | No usable text from any source                          |
| `LOW_CONFIDENCE_DIGEST`   | Multi-ticker without strong section anchors             |
| `LLM_FAILURE_FALLBACK`    | Provider errored — deterministic-only record kept       |
| `BROKER_NOT_RESOLVED`     | Sender not in any org's allowlist (terminal `failed`)   |
| `INTERNAL`                | Unexpected exception (terminal `failed`)                |

Items are idempotent — re-enqueuing the same `(messageId,
reasonCategory)` replaces the prior entry. `clear()` is exposed for
operators who have addressed an issue and want to reprocess.

Reprocessing the same artifact after a fix:

```ts
const pipeline = new Pipeline({ store, reviewQueue })
const job = await pipeline.run(rawArtifact)   // first pass
// ...operator reviews, fixes upstream, re-emits same artifact:
const job2 = await pipeline.run(rawArtifact)  // identical IDs; replaces
```

## What the frontend sees (unchanged)

Nothing changes for the frontend. The materializer writes:

- `BrokerEmail`
- `Attachment[]`
- `ResearchReport[]` (one per ticker)
- `ReportSummary[]`
- `EvidenceSnippet[]` with provenance back to the originating source
- `BrokerStockOpinion[]` (when both rating + target resolve)

…into the same `InMemoryStore` the `/v1` API already serves. The
frontend never learns whether a report came from a body, an
attachment, a linked webpage, a linked PDF, or any combination — that
is all in the `provenance` field on each evidence snippet.

The Daily Worklog, broker-memory, change detection, By Stock and By
Broker change rails, the divergence tab, the sector feed, the report
drawer, the stock drawer — all consume the same canonical entities
they did before. Module 13 is purely additive underneath.

## Where to look

- Pipeline core: [`server/src/pipeline/pipeline.ts`](../server/src/pipeline/pipeline.ts)
- Models + states: [`server/src/pipeline/models.ts`](../server/src/pipeline/models.ts) · [`server/src/pipeline/states.ts`](../server/src/pipeline/states.ts)
- Deterministic extractors: [`server/src/pipeline/deterministic/`](../server/src/pipeline/deterministic/)
- Extract boundary: [`server/src/pipeline/extract/`](../server/src/pipeline/extract/)
- LLM provider boundary: [`server/src/pipeline/enrich/`](../server/src/pipeline/enrich/)
- Materializer: [`server/src/pipeline/materialize/`](../server/src/pipeline/materialize/)
- Review queue: [`server/src/pipeline/reviewQueue.ts`](../server/src/pipeline/reviewQueue.ts)
- Provenance: [`server/src/pipeline/provenance.ts`](../server/src/pipeline/provenance.ts)
- Tests: [`server/src/pipeline/__tests__/pipeline.ts`](../server/src/pipeline/__tests__/pipeline.ts) — `npm run test:pipeline`
- Reused legacy primitives: [`server/src/eml/parse.ts`](../server/src/eml/parse.ts), [`server/src/config/allowlist.ts`](../server/src/config/allowlist.ts), [`server/src/config/organizations.ts`](../server/src/config/organizations.ts)
