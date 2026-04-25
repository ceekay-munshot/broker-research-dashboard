# Real LLM enrichment · prompts · grounding · cost/quality controls

> Module 17. Server-side, deterministic-by-default, evidence-grounded
> LLM enrichment behind the existing `LlmProvider` boundary. The
> frontend `/v1` contract, Daily Worklog, broker-memory, change
> detection, By Stock / By Broker change rails, divergence / sector /
> report-detail surfaces, and every consumer of canonical entities
> render byte-for-byte unchanged. The dashboard remains read-only.

## What it gives you

| Question                                                              | Answered by                                       |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| Wire a real OpenAI or Anthropic provider behind the existing boundary | `OPENAI_API_KEY=… npm run ops -- sync`            |
| Force the deterministic-only path (no LLM)                            | `LLM_DISABLED=1 npm run ops -- sync`              |
| What prompts + versions are registered, with which models?            | `npm run ops -- prompt-list`                      |
| What did the LLM cost / how often did the cache hit / fallback fire?  | `npm run ops -- llm-stats [--actor=all-orgs]`     |
| Did the LLM run actually beat deterministic-only on the gold suite?   | `npm run ops -- eval-with-llm`                    |
| Re-run the full gold suite with LLM enabled                           | `npm run ops -- eval-with-llm`                    |
| Run the LLM unit suite (mock fetch, no network)                       | `npm run test:llm`                                |

## Where the code lives

| File                                                  | Purpose                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `server/src/llm/types.ts`                             | `PromptDefinition`, `EvidenceBundle`, `LlmCallRecord`, `LlmCacheEntry`, `RealProviderOptions` |
| `server/src/llm/registry.ts`                          | `PROMPT_REGISTRY`, `listPrompts`, `renderUserPrompt`                                      |
| `server/src/llm/schema.ts`                            | `validateAgainst` — zod-lite structured-output validator                                  |
| `server/src/llm/grounding.ts`                         | `checkGrounding` — substring + token-overlap evidence check                               |
| `server/src/llm/cache.ts`                             | `computeCacheKey`, `buildCacheEntry` — sha256 over (task / version / model / bundle)      |
| `server/src/llm/openaiHttp.ts`                        | `callOpenAi` — Chat Completions w/ JSON mode                                              |
| `server/src/llm/anthropicHttp.ts`                     | `callAnthropic` + `parseFirstJsonObject`                                                  |
| `server/src/llm/fallback.ts`                          | `runEnrichmentTask` — primary/fallback orchestrator + per-attempt accounting              |
| `server/src/llm/accounting.ts`                        | `summarizeCalls` — overall + per-provider/model/task/version buckets                      |
| `server/src/pipeline/enrich/openaiProvider.ts`        | `OpenAiLlmProvider` — boundary impl using the LLM layer                                   |
| `server/src/pipeline/enrich/anthropicProvider.ts`     | `AnthropicLlmProvider` — same shape, Anthropic-primary                                    |
| `server/src/pipeline/enrich/factory.ts`               | `buildLlmProvider({repo,env,forceNoOp})`, `repoBackedCache`, `repoBackedRecorder`         |
| `server/src/persistence/types.ts` (extended)          | `Repo` extended with `appendLlmCallRecord`, `listLlmCallRecords`, `listAllLlmCallRecords`, `upsertLlmCacheEntry`, `getLlmCacheEntry`, `findLlmCacheEntryByKey` |
| `server/src/llm/__tests__/llm.ts`                     | 26 mock-fetch tests covering schema / grounding / cache / fallback / providers / factory  |

## The provider boundary is unchanged

The pipeline still calls one method:

```ts
interface LlmProvider {
  readonly id: string
  enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null>
}
```

What changed: the `OpenAiLlmProvider` / `AnthropicLlmProvider`
implementations now delegate to a shared `runEnrichmentTask(...)` that
composes a real Chat Completions / Messages call from the prompt
registry, validates the structured output against a schema, enforces
grounding against the supplied evidence bundle, looks up / writes the
deterministic cache, persists per-attempt accounting via a callback,
and falls back to the configured secondary model when the primary
fails. The `NoOpLlmProvider` still ships and is the default when no
API key is configured.

## Decision tree

```
buildLlmProvider({ repo, env, forceNoOp })

  forceNoOp || env.LLM_DISABLED ────────────────► NoOpLlmProvider
  env.OPENAI_API_KEY ───────────────────────────► OpenAiLlmProvider (cache + onCallRecord wired)
  env.ANTHROPIC_API_KEY ────────────────────────► AnthropicLlmProvider (cache + onCallRecord wired)
  (none)  ──────────────────────────────────────► NoOpLlmProvider
```

The CLI uses `buildLlmProvider({ repo })` so production sync picks up
the real provider when keys are present without any other code edits.
Tests inject a `LlmProvider` directly (or set `forceNoOp: true`) so
they never touch the network.

## Prompt registry

Every enrichment task carries a `PromptDefinition`:

```ts
interface PromptDefinition {
  id: EnrichmentTaskId
  version: string                  // semver-ish; bump on prompt/schema changes
  description: string
  systemPrompt: string
  userPromptTemplate: string       // {{placeholders}} substituted at request time
  outputSchema: StructuredOutputSchema
  recommended: ModelChoice
  fallback?: ModelChoice
  temperature: number
  maxTokens: number
  groundingFields: readonly string[]  // fields that MUST cite evidence when populated
}
```

The four shipped tasks:

| Task ID                | Version | Recommended                         | Fallback                            | Notes                                |
| ---------------------- | ------- | ----------------------------------- | ----------------------------------- | ------------------------------------ |
| `summary_enrichment`   | v1.0.0  | openai/gpt-4o-mini                  | anthropic/claude-3-5-haiku-latest   | thesis + keyPoints + themes + risks + catalysts |
| `change_narrative`     | v1.0.0  | anthropic/claude-3-5-haiku-latest   | openai/gpt-4o-mini                  | what-changed-vs-prior synthesis      |
| `digest_split_assist`  | v1.0.0  | openai/gpt-4o-mini                  | anthropic/claude-3-5-haiku-latest   | per-ticker offsets when deterministic split is weak |
| `linked_synthesis`     | v1.0.0  | openai/gpt-4o-mini                  | anthropic/claude-3-5-haiku-latest   | when linked artifacts dominate       |

Bumping a prompt's `version` automatically invalidates its cache (the
version flows into the cache key) and shows up as a new bucket in
`llm-stats --actor=all-orgs`. That's the unit of A/B-style prompt
experiments — register `summary_enrichment_v1.1.0`, route specific
brokers/profiles to it, watch the bucket-level deltas.

## Structured output validation

`validateAgainst(value, schema)` is a hand-rolled zod-lite walker over
a tagged-union `FieldSchema` (string / number / boolean / array /
object). Validation failure short-circuits the attempt; the
orchestrator records `success=false, errorReason="schema: …"` and
falls through to the secondary model. This is intentionally smaller
than zod — the prompts ship a fixed handful of shapes, and we don't
want a runtime dep on this hot path.

## Grounding

`checkGrounding(claims, bundle, prompt, rawOutput?)` enforces that
every populated grounding-required output field has at least one
supporting `claim` whose `evidenceQuote` actually appears in one of
the supplied evidence sources. Two-step matcher:

1. Normalised substring match (`lower-case + collapse-whitespace`).
2. Token-overlap fallback: ≥ 70% of the quote's ≥3-character tokens
   appear in the source text. Catches paraphrases like "$12.1bn TCV"
   vs "TCV at $12.1bn".

Fields the model didn't emit (or emitted as empty) are NOT treated as
ungrounded — they have no content to drop. The orchestrator strips
ungrounded fields from the payload before persisting to cache; the
filtered shape is what the materializer sees. The result of every
attempt records `groundingPass` so operators can see when the model is
fabricating without hard-failing the pipeline.

## Caching + idempotency

```
cacheKey = sha256(taskId | promptVersion | provider | model | sha256(evidenceBundle) | candidateSeed)
```

The cache stores the post-validation, post-grounding payload. On a
cache hit the orchestrator records a record with
`cacheHit=true, latencyMs=0, tokens=0`, returns the cached payload,
and never touches the network. The Repo-backed cache uses a global
`findLlmCacheEntryByKey(key)` lookup since the key is collision-
resistant; orgId is recorded for attribution but isn't a partition key.

Corrections (Module 16) apply BEFORE LLM enrichment, which mutates the
evidence bundle the LLM sees — so a correction-driven replay produces
a fresh cache key automatically. No special invalidation hook is
needed.

## Primary / fallback chain

`runEnrichmentTask` walks: cache → primary attempt → fallback attempt.
On HTTP / parse / schema / grounding failure on the primary, it
records the failure (`success=false, usedFallback=false, errorReason="…"`)
and re-attempts with the prompt's `fallback` model
(`usedFallback=true`). Both attempts share a single cache namespace
keyed by `(provider, model)`, so a successful fallback doesn't poison
the primary's cache slot.

When all attempts fail, the orchestrator returns `null` — the
provider then throws `PipelineError('LLM_FAILURE_FALLBACK', …)`, the
pipeline catches it, enqueues a review item, and the candidate
materializes deterministic-only. The "always produces some canonical
record" invariant from Module 9 is preserved.

## Cost / quality / latency accounting

Every attempt produces an `LlmCallRecord` (id, orgId, artifactId,
candidateKey, taskId, promptVersion, providerId, model, tokensIn,
tokensOut, latencyMs, cacheHit, success, groundingPass, usedFallback,
errorReason, at). The CLI `llm-stats` aggregates these into:

- **overall**: calls, successes, cache-hit rate, grounding-pass rate,
  fallback frequency, avg latency, token totals.
- **by provider** / **by model** / **by task** / **by prompt
  version** buckets — same metrics each, sorted by call volume.

Operators read these to spot prompts whose fallback rate is climbing
(usually a sign the schema or grounding changed under them), prompts
whose grounding-pass rate is dropping (the model is fabricating), or
prompts whose token cost has crept up after a `userPromptTemplate`
edit.

## Eval integration

`npm run ops -- eval-with-llm` runs the gold suite twice — once with
`forceNoOp: true` (deterministic-only baseline) and once with the
configured provider — and prints the side-by-side scorecards plus a
Δscore / Δpassed / Δllm-fields summary. If the LLM run regresses, the
exit message points operators at `llm-stats` so they can audit the
call trail.

The existing `npm run test:eval` continues to run the deterministic
baseline; LLM-enabled eval is opt-in (it depends on whether the env
has API keys). This keeps the CI gate stable regardless of provider
availability.

## Corrections still apply BEFORE enrichment

The pipeline orchestration order is unchanged:

```
parsed_email
  → applyArtifactCorrections (Module 16)
  → attachmentTexts / linkedTexts extracted
  → deterministic candidates
  → applyCandidateCorrections (Module 16)
  → llmProvider.enrich(...)        ← LLM sees CORRECTED facts
  → materialize → canonical /v1
```

The LLM never sees pre-correction inputs. Corrections to broker /
ticker / rating / target / report-type all flow into the
`LlmEnrichInput.candidate` and the `EvidenceBundle.bodyText` /
`attachmentTexts` / `linkedTexts` before the prompt is composed. The
cache key derives from the post-correction bundle, so a corrected
replay reads from a different cache slot than the original run.

## Tests

`npm run test:llm` (26 cases, mock fetch only, no network) covers:

- Schema validator: accepts the canonical payload shape; rejects on
  missing required fields, wrong types, minLength violations.
- Grounding: drops ungrounded fields, accepts paraphrased evidence,
  doesn't penalise empty optional fields.
- Cache key: deterministic; bumps on (model, prompt version, bundle).
- `parseFirstJsonObject`: extracts JSON out of prose / code fences.
- `runEnrichmentTask`: cache miss → hit, schema fail → fallback,
  ungrounded fields stripped from cached payload, all-fail → null.
- `OpenAiLlmProvider` / `AnthropicLlmProvider`: real path with mock
  fetch, legacy `fetcher` back-compat, no-key returns null.
- `summarizeCalls`: per-bucket aggregates (provider / model / task /
  prompt version).
- `buildLlmProvider` factory + `repoBackedCache` + `repoBackedRecorder`.
- Pipeline integration: a real provider participates in
  materialization and persists a call record.

Plus the existing 6 suites — `bridge`, `contract`, `pipeline`,
`sync`, `eval`, `corrections` — keep passing untouched.

## Invariants this module preserves

1. The dashboard is read-only. Nothing here mutates host state, no
   browser-side LLM calls, no auth changes.
2. The pipeline always produces some canonical record. When LLM
   enrichment fails for any reason, the candidate materializes
   deterministic-only and a review item is enqueued.
3. The frontend bundle is unchanged. Module 17 is server-only.
4. Deterministic fields (broker / ticker / rating / target prices /
   dates / report type) are NEVER produced or overridden by the LLM.
5. Every populated enrichment field is evidence-grounded. Ungrounded
   fields are dropped before the materializer sees them.
6. Cache keys derive from prompt version + evidence — there is no
   "invalidate this cache" button, because the right answer is
   always to bump the prompt version or change the bundle.
7. Corrections still apply BEFORE LLM enrichment.

## Operator workflow

```
# 1. Preview the registered prompts.
npm run ops -- prompt-list

# 2. Wire keys + run a sync.
OPENAI_API_KEY=sk-… npm run ops -- sync

# 3. Inspect the call trail.
npm run ops -- llm-stats

# 4. Compare the LLM run to the deterministic baseline on gold.
npm run ops -- eval-with-llm

# 5. If the LLM regressed a fixture, look at the offending records.
npm run ops -- llm-stats --actor=all-orgs
```

Set `LLM_DISABLED=1` (or pass `forceNoOp: true` from a programmatic
caller) to force deterministic-only without removing keys.
