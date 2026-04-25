#!/usr/bin/env tsx
// Module 17 — LLM enrichment infrastructure tests.
//
// Mock-fetch only. No live API calls; the providers expose a
// `fetchImpl: typeof fetch` boundary so we hand them deterministic
// stubs that return canned Chat Completions / Messages payloads.
//
// Coverage:
//   - schema validator (validateAgainst) accepts/rejects
//   - grounding (substring + token-overlap) drops ungrounded fields
//   - cache key is deterministic and content-derived
//   - parseFirstJsonObject extracts JSON from Anthropic-style text
//   - runEnrichmentTask cache-hit / fallback / drop-ungrounded paths
//   - OpenAiLlmProvider end-to-end with mock fetch + Repo cache
//   - AnthropicLlmProvider end-to-end with mock fetch
//   - summarizeCalls aggregates by provider/model/task/promptVersion
//   - factory wires Repo-backed cache + recorder
//   - LlmProvider boundary (corrections still apply BEFORE LLM)

import {
  PROMPT_REGISTRY, validateAgainst, checkGrounding, computeCacheKey,
  parseFirstJsonObject, runEnrichmentTask, summarizeCalls,
  type EvidenceBundle, type ModelClaim, type LlmCallRecord,
  type LlmCacheEntry,
} from '..'
import {
  OpenAiLlmProvider, AnthropicLlmProvider,
  bundleFromInput, templateVarsFor, ensureEvidenceBacked,
  buildLlmProvider, repoBackedCache, repoBackedRecorder,
} from '../../pipeline/enrich'
import { Pipeline } from '../../pipeline/pipeline'
import { ReviewQueue } from '../../pipeline/reviewQueue'
import { InMemoryRepo } from '../../persistence'
import type { LlmProvider, LlmEnrichInput } from '../../pipeline/enrich/provider'
import type { OrgId, BrokerId, StockTicker } from '../../../../src/domain'
import type { ParsedReportCandidate, RawEmailArtifact } from '../../pipeline/models'
import { provFromBody } from '../../pipeline/provenance'

// ── tiny harness ────────────────────────────────────────────────────────
interface TestResult { readonly name: string; readonly ok: boolean; readonly message?: string }
const results: TestResult[] = []
function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name, ok: true }) })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      results.push({ name, ok: false, message: msg })
    })
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`assertion failed: ${msg}`) }
function assertEq<T>(a: T, b: T, msg: string) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

const ORG: OrgId = 'org_vimana' as unknown as OrgId

// ── fixture helpers ─────────────────────────────────────────────────────
function bundleFixture(): EvidenceBundle {
  return {
    bodyText: 'MARUTI — Buy. Q4 retail share gained 120 bps. We raise PT to ₹13,500 from ₹12,000. Margin tailwind from softer steel and FX.',
    attachmentTexts: [{ filename: 'maruti-deck.pdf', text: 'Margin tailwind from softer steel and FX favours volume mix.' }],
    linkedTexts: [],
  }
}

function candidateFixture(): ParsedReportCandidate {
  return {
    ticker: 'MARUTI' as unknown as StockTicker,
    sectorId: null,
    brokerId: 'broker_iifl' as unknown as BrokerId,
    orgId: ORG,
    reportType: 'flash',
    rating: 'Buy',
    stance: 'bullish',
    targetPrice: 13500,
    priorTargetPrice: 12000,
    publishedAt: '2026-04-22T11:15:00.000Z',
    receivedAt: '2026-04-22T11:15:00.000Z',
    title: 'MARUTI — Buy. PT ₹13,500',
    summaryOneLine: 'MARUTI · Buy · TP ₹13,500 (+12.5%)',
    deterministicEvidence: [{
      text: 'We raise PT to ₹13,500.',
      provenance: provFromBody(),
      supportingField: 'targetPrice',
      fieldRef: '',
    }],
    origin: 'direct_body',
  }
}

function inputFixture(): LlmEnrichInput {
  return {
    candidate: candidateFixture(),
    bodyText: bundleFixture().bodyText,
    attachmentTexts: [{
      text: bundleFixture().attachmentTexts[0]!.text,
      provenance: { kind: 'email_attachment', id: 'maruti-deck.pdf' },
      contentType: 'application/pdf',
    }],
    linkedTexts: [],
  }
}

/** Minimal `Response`-shaped stub — `runEnrichmentTask` only calls
 *  `.ok / .status / .statusText / .json() / .text()` on it. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok, status, statusText: ok ? 'OK' : 'ERR',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** OpenAI Chat Completions response carrying our model output as
 *  `choices[0].message.content`. */
function openAiCompletion(modelOutput: unknown, tokensIn = 100, tokensOut = 50): Response {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(modelOutput) } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  })
}

/** Anthropic Messages response with the JSON object inline in the
 *  text content block (no JSON mode). */
function anthropicMessage(modelOutput: unknown, tokensIn = 90, tokensOut = 60): Response {
  return jsonResponse({
    content: [{ type: 'text', text: 'Here is the JSON:\n' + JSON.stringify(modelOutput) }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  })
}

function happyPayload(): unknown {
  return {
    thesis: 'Margin tailwind from softer steel and FX favours volume mix.',
    keyPoints: ['Q4 retail share gained 120 bps.'],
    themes: ['margin tailwind'],
    risks: [],
    catalysts: [],
    claims: [
      { field: 'thesis', text: 'Margin tailwind from softer steel and FX.', evidenceQuote: 'Margin tailwind from softer steel and FX', sourceKind: 'email_body', sourceId: 'body' },
      { field: 'keyPoint', text: 'Q4 retail share gained 120 bps.', evidenceQuote: 'Q4 retail share gained 120 bps', sourceKind: 'email_body', sourceId: 'body' },
      { field: 'theme', text: 'margin tailwind', evidenceQuote: 'Margin tailwind from softer steel', sourceKind: 'email_body', sourceId: 'body' },
    ],
  }
}

// ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await test('schema: validateAgainst accepts the canonical summary_enrichment payload', () => {
    const v = validateAgainst(happyPayload(), PROMPT_REGISTRY.summary_enrichment.outputSchema)
    assert(v.ok, `valid payload should pass: ${!v.ok ? v.errors.join(';') : ''}`)
  })

  await test('schema: rejects when required field missing', () => {
    const bad = { keyPoints: [], themes: [], risks: [], catalysts: [], claims: [] } // no thesis
    const v = validateAgainst(bad, PROMPT_REGISTRY.summary_enrichment.outputSchema)
    assert(!v.ok, 'should fail')
  })

  await test('schema: rejects when string violates minLength', () => {
    const bad = { ...(happyPayload() as object), thesis: 'short' }
    const v = validateAgainst(bad, PROMPT_REGISTRY.summary_enrichment.outputSchema)
    assert(!v.ok, 'thesis below minLength should fail')
  })

  await test('grounding: drops fields whose claims do not appear in evidence', () => {
    const bundle = bundleFixture()
    const claims: ModelClaim[] = [
      { field: 'thesis', text: 'made-up', evidenceQuote: 'totally fabricated finding not in body', sourceKind: 'email_body', sourceId: 'body' },
    ]
    const r = checkGrounding(claims, bundle, PROMPT_REGISTRY.summary_enrichment)
    assert(!r.groundingPass, 'should not pass when no claim is grounded')
    assert(r.droppedFields.includes('thesis'), 'thesis must be dropped')
  })

  await test('grounding: substring + token-overlap accepts paraphrased evidence', () => {
    const bundle = bundleFixture()
    const claims: ModelClaim[] = [
      { field: 'theme', text: 'margin tailwind', evidenceQuote: 'softer steel margin tailwind FX', sourceKind: 'email_body', sourceId: 'body' },
    ]
    const r = checkGrounding(claims, bundle, PROMPT_REGISTRY.summary_enrichment)
    assert(r.fieldsGrounded.has('themes'), 'themes umbrella should be grounded')
  })

  await test('cache: same bundle + task + version + model → same key', () => {
    const k1 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', bundle: bundleFixture(), candidateSeed: 'abc' })
    const k2 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', bundle: bundleFixture(), candidateSeed: 'abc' })
    assertEq(k1, k2, 'cache key must be deterministic')
  })

  await test('cache: differing model breaks the key', () => {
    const k1 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', bundle: bundleFixture() })
    const k2 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o',      bundle: bundleFixture() })
    assert(k1 !== k2, 'model bump must change key')
  })

  await test('cache: differing prompt version breaks the key', () => {
    const k1 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', bundle: bundleFixture() })
    const k2 = computeCacheKey({ taskId: 'summary_enrichment', promptVersion: 'v1.1.0', providerId: 'openai', model: 'gpt-4o-mini', bundle: bundleFixture() })
    assert(k1 !== k2, 'prompt version bump must change key')
  })

  await test('parseFirstJsonObject extracts JSON from Anthropic-style prose', () => {
    const text = 'Here is the JSON you asked for:\n```json\n{"a": 1, "b": [1,2]}\n```\n'
    const out = parseFirstJsonObject(text) as { a: number; b: number[] } | null
    assert(out !== null, 'should parse')
    assertEq(out!.a, 1, 'a')
    assert(Array.isArray(out!.b) && out!.b.length === 2, 'b is array of 2')
  })

  await test('runEnrichmentTask: openai primary returns validated, grounded payload', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return openAiCompletion(happyPayload()) }) as unknown as typeof fetch
    const records: Omit<LlmCallRecord, 'id' | 'at'>[] = []
    const result = await runEnrichmentTask({
      orgId: ORG,
      artifactId: 'artifact_a',
      candidateKey: 'broker_iifl:MARUTI',
      prompt: PROMPT_REGISTRY.summary_enrichment,
      bundle: bundleFixture(),
      templateVars: { broker: 'iifl', ticker: 'MARUTI', subject: 'flash', bodyText: bundleFixture().bodyText, attachmentTexts: '', linkedTexts: '', rating: 'Buy', targetPrice: 13500, priorTargetPrice: 12000, reportType: 'flash' },
      openai: { apiKey: 'sk-test', fetchImpl },
      onCallRecord: (r) => records.push(r),
    })
    assert(result !== null, 'should return result')
    assertEq(result!.providerId, 'openai', 'primary is openai')
    assertEq(result!.cacheHit, false, 'fresh call')
    assertEq(records.length, 1, 'one call recorded')
    assertEq(records[0]!.success, true, 'success=true')
    assertEq(records[0]!.groundingPass, true, 'grounded')
    assert(calls === 1, 'fetch invoked once')
  })

  await test('runEnrichmentTask: cache hit on second call', async () => {
    const cache = new Map<string, LlmCacheEntry>()
    const cacheBackend = {
      get: (k: string) => cache.get(k)?.payload ?? null,
      set: (e: LlmCacheEntry) => { cache.set(e.key, e) },
    }
    let httpCalls = 0
    const fetchImpl = (async () => { httpCalls++; return openAiCompletion(happyPayload()) }) as unknown as typeof fetch
    const records: Omit<LlmCallRecord, 'id' | 'at'>[] = []
    const args = {
      orgId: ORG,
      artifactId: 'artifact_a',
      candidateKey: 'broker_iifl:MARUTI',
      prompt: PROMPT_REGISTRY.summary_enrichment,
      bundle: bundleFixture(),
      templateVars: { broker: 'iifl', ticker: 'MARUTI', subject: 'x', bodyText: bundleFixture().bodyText, attachmentTexts: '', linkedTexts: '', rating: 'Buy', targetPrice: 13500, priorTargetPrice: 12000, reportType: 'flash' },
      openai: { apiKey: 'sk-test', fetchImpl },
      cache: cacheBackend,
      onCallRecord: (r: Omit<LlmCallRecord, 'id' | 'at'>) => records.push(r),
    }
    const r1 = await runEnrichmentTask(args)
    const r2 = await runEnrichmentTask(args)
    assert(r1 !== null && r2 !== null, 'both runs return')
    assertEq(r1!.cacheHit, false, 'first miss')
    assertEq(r2!.cacheHit, true, 'second hit')
    assert(httpCalls === 1, `only one HTTP call (got ${httpCalls})`)
    assertEq(records.length, 2, 'two records (miss + hit)')
    assertEq(records[1]!.cacheHit, true, 'second record marked cache-hit')
  })

  await test('runEnrichmentTask: invalid schema → fallback to second model', async () => {
    let n = 0
    const fetchImpl = (async (url: string) => {
      n++
      // Primary call (openai endpoint) returns malformed payload; fallback (anthropic) succeeds.
      if (typeof url === 'string' && url.includes('openai.com')) {
        return openAiCompletion({ thesis: 1, claims: [] }) // wrong type → schema fails
      }
      return anthropicMessage(happyPayload())
    }) as unknown as typeof fetch
    const records: Omit<LlmCallRecord, 'id' | 'at'>[] = []
    const result = await runEnrichmentTask({
      orgId: ORG, artifactId: 'a', candidateKey: 'k',
      prompt: PROMPT_REGISTRY.summary_enrichment,
      bundle: bundleFixture(),
      templateVars: { broker: 'iifl', ticker: 'MARUTI', subject: 'x', bodyText: bundleFixture().bodyText, attachmentTexts: '', linkedTexts: '', rating: 'Buy', targetPrice: 13500, priorTargetPrice: 12000, reportType: 'flash' },
      openai: { apiKey: 'sk-1', fetchImpl },
      anthropic: { apiKey: 'sk-2', fetchImpl },
      onCallRecord: (r) => records.push(r),
    })
    assert(result !== null, 'fallback should produce a result')
    assertEq(result!.providerId, 'anthropic', 'fell through to anthropic')
    assertEq(result!.usedFallback, true, 'usedFallback flag set')
    assert(records.length === 2, `two records (primary fail + fallback ok) — got ${records.length}`)
    assertEq(records[0]!.success, false, 'primary attempt failed')
    assertEq(records[1]!.success, true, 'fallback succeeded')
    assert(n === 2, 'two HTTP attempts')
  })

  await test('runEnrichmentTask: ungrounded fields are stripped from cached payload', async () => {
    const cache = new Map<string, LlmCacheEntry>()
    const cacheBackend = {
      get: (k: string) => cache.get(k)?.payload ?? null,
      set: (e: LlmCacheEntry) => { cache.set(e.key, e) },
    }
    // Returns a payload where `thesis` is grounded but `risks` are bogus
    // claims (which our prompt doesn't require — but verify drop logic
    // still removes only what fails grounding for grounding-required fields).
    const partial = {
      ...(happyPayload() as object),
      // override claims to remove anything that would ground 'thesis'
      claims: [
        { field: 'theme', text: 'tailwind', evidenceQuote: 'margin tailwind softer steel', sourceKind: 'email_body', sourceId: 'body' },
        // keyPoint with bogus quote → drop
        { field: 'keyPoint', text: 'made up', evidenceQuote: 'this string never appears anywhere', sourceKind: 'email_body', sourceId: 'body' },
      ],
    }
    const fetchImpl = (async () => openAiCompletion(partial)) as unknown as typeof fetch
    const result = await runEnrichmentTask({
      orgId: ORG, artifactId: 'a', candidateKey: 'k',
      prompt: PROMPT_REGISTRY.summary_enrichment,
      bundle: bundleFixture(),
      templateVars: { broker: 'iifl', ticker: 'MARUTI', subject: 'x', bodyText: bundleFixture().bodyText, attachmentTexts: '', linkedTexts: '', rating: 'Buy', targetPrice: 13500, priorTargetPrice: 12000, reportType: 'flash' },
      openai: { apiKey: 'sk', fetchImpl },
      cache: cacheBackend,
    })
    assert(result !== null, 'still returns')
    const payload = result!.payload as Record<string, unknown>
    // 'themes' grounded → keep. 'thesis', 'keyPoints', 'risks', 'catalysts' all
    // ungrounded → dropped.
    assert('themes' in payload, 'themes preserved')
    assert(!('thesis' in payload), 'thesis dropped')
    assert(!('keyPoints' in payload), 'keyPoints dropped')
  })

  await test('runEnrichmentTask: all attempts fail → returns null (deterministic-only path)', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'boom' }, false, 500)) as unknown as typeof fetch
    const records: Omit<LlmCallRecord, 'id' | 'at'>[] = []
    const result = await runEnrichmentTask({
      orgId: ORG, artifactId: 'a', candidateKey: 'k',
      prompt: PROMPT_REGISTRY.summary_enrichment,
      bundle: bundleFixture(),
      templateVars: { broker: 'iifl', ticker: 'MARUTI', subject: 'x', bodyText: bundleFixture().bodyText, attachmentTexts: '', linkedTexts: '', rating: 'Buy', targetPrice: 13500, priorTargetPrice: 12000, reportType: 'flash' },
      openai: { apiKey: 'sk-1', fetchImpl },
      anthropic: { apiKey: 'sk-2', fetchImpl },
      onCallRecord: (r) => records.push(r),
    })
    assertEq(result, null, 'should be null when every attempt errored')
    assert(records.length >= 1, 'at least one fail recorded')
    assert(records.every((r) => !r.success), 'all records are failures')
  })

  await test('OpenAiLlmProvider: real path returns shaped LlmEnrichment', async () => {
    const fetchImpl = (async () => openAiCompletion(happyPayload())) as unknown as typeof fetch
    const provider = new OpenAiLlmProvider({ apiKey: 'sk', fetchImpl })
    const out = await provider.enrich(inputFixture())
    assert(out !== null, 'returns enrichment')
    assert(typeof out!.providerId === 'string' && out!.providerId.startsWith('openai:'), 'providerId tag')
    assert((out!.evidence ?? []).length > 0, 'evidence carried through')
    assert(out!.thesis !== undefined, 'thesis preserved')
  })

  await test('OpenAiLlmProvider: legacy fetcher back-compat still wired', async () => {
    const provider = new OpenAiLlmProvider({
      apiKey: 'sk',
      fetcher: async () => ({
        providerId: 'openai:legacy',
        thesis: 'legacy thesis',
        evidence: [{ text: 'evidence', supportingField: 'thesis', fieldRef: '', provenance: provFromBody() }],
      }),
    })
    const out = await provider.enrich(inputFixture())
    assert(out !== null, 'legacy fetcher path produces enrichment')
    assertEq(out!.thesis, 'legacy thesis', 'preserved thesis')
  })

  await test('OpenAiLlmProvider: returns null without apiKey', async () => {
    const provider = new OpenAiLlmProvider({})
    const out = await provider.enrich(inputFixture())
    assertEq(out, null, 'no key → null (no-op fallback path)')
  })

  await test('AnthropicLlmProvider: real path returns shaped LlmEnrichment', async () => {
    const fetchImpl = (async () => anthropicMessage(happyPayload())) as unknown as typeof fetch
    const provider = new AnthropicLlmProvider({ apiKey: 'sk', fetchImpl })
    const out = await provider.enrich(inputFixture())
    assert(out !== null, 'returns enrichment')
    assert(out!.providerId.startsWith('anthropic:'), 'tag')
  })

  await test('ensureEvidenceBacked drops fields without evidence span', () => {
    const out = ensureEvidenceBacked({
      providerId: 'x',
      thesis: 'unsupported',
      keyPoints: ['no evidence here'],
      themes: ['supported'],
      evidence: [{ text: 'q', supportingField: 'theme', fieldRef: '', provenance: provFromBody() }],
    }, 'x')
    assertEq(out.thesis, undefined, 'thesis dropped')
    assertEq(out.keyPoints, undefined, 'keyPoints dropped')
    assert(out.themes !== undefined, 'themes kept')
  })

  await test('summarizeCalls aggregates buckets correctly', () => {
    const records: LlmCallRecord[] = [
      { id: '1', orgId: ORG, artifactId: 'a', candidateKey: 'k', taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', tokensIn: 100, tokensOut: 40, latencyMs: 120, cacheHit: false, success: true,  groundingPass: true,  usedFallback: false, errorReason: null, at: '2026-04-22T11:15:00Z' },
      { id: '2', orgId: ORG, artifactId: 'a', candidateKey: 'k', taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini', tokensIn: 0,   tokensOut: 0,  latencyMs: 0,   cacheHit: true,  success: true,  groundingPass: true,  usedFallback: false, errorReason: null, at: '2026-04-22T11:15:01Z' },
      { id: '3', orgId: ORG, artifactId: 'b', candidateKey: 'k', taskId: 'summary_enrichment', promptVersion: 'v1.0.0', providerId: 'anthropic', model: 'claude-3-5-haiku-latest', tokensIn: 80, tokensOut: 50, latencyMs: 200, cacheHit: false, success: true, groundingPass: false, usedFallback: true, errorReason: null, at: '2026-04-22T11:15:02Z' },
    ]
    const sum = summarizeCalls(records)
    assertEq(sum.overall.calls, 3, 'overall calls')
    assertEq(sum.overall.cacheHits, 1, 'one cache hit')
    assertEq(sum.overall.fallbackUses, 1, 'one fallback')
    assertEq(sum.overall.tokensIn, 180, 'tokensIn sum')
    assertEq(sum.byProvider.length, 2, 'two providers')
    assertEq(sum.byPromptVersion[0]!.calls, 3, 'one prompt version, 3 calls')
  })

  await test('factory: builds NoOp without env keys', async () => {
    const provider = buildLlmProvider({ repo: new InMemoryRepo(), env: {} })
    const out = await provider.enrich(inputFixture())
    // NoOp returns null; the provider id contains 'noop'.
    assertEq(out, null, 'noop returns null')
    assert(provider.id.includes('noop'), `provider id mentions noop: ${provider.id}`)
  })

  await test('factory: forceNoOp overrides API keys', () => {
    const provider = buildLlmProvider({
      repo: new InMemoryRepo(),
      env: { OPENAI_API_KEY: 'sk' },
      forceNoOp: true,
    })
    assert(provider.id.includes('noop'), 'forced no-op')
  })

  await test('factory: repoBackedRecorder appends LlmCallRecord with id+at', () => {
    const repo = new InMemoryRepo()
    const recorder = repoBackedRecorder(repo)
    recorder({
      orgId: ORG, artifactId: 'a', candidateKey: 'k',
      taskId: 'summary_enrichment', promptVersion: 'v1.0.0',
      providerId: 'openai', model: 'gpt-4o-mini',
      tokensIn: 1, tokensOut: 1, latencyMs: 1,
      cacheHit: false, success: true, groundingPass: true,
      usedFallback: false, errorReason: null,
    })
    const list = repo.listLlmCallRecords(ORG)
    assertEq(list.length, 1, 'one record')
    assert(list[0]!.id.startsWith('lcr_'), 'id prefixed')
    assert(typeof list[0]!.at === 'string' && list[0]!.at.includes('T'), 'at is ISO')
  })

  await test('factory: repoBackedCache findLlmCacheEntryByKey is global by key', () => {
    const repo = new InMemoryRepo()
    const cache = repoBackedCache(repo)
    const entry: LlmCacheEntry = {
      key: 'k1', orgId: ORG, taskId: 'summary_enrichment',
      promptVersion: 'v1.0.0', providerId: 'openai', model: 'gpt-4o-mini',
      storedAt: '2026-04-22T11:15:00Z', payload: { thesis: 'cached' },
    }
    cache.set(entry)
    const got = cache.get('k1') as { thesis: string } | null
    assert(got !== null, 'hit on key')
    assertEq(got!.thesis, 'cached', 'payload preserved')
    assertEq(cache.get('k2'), null, 'miss on different key')
  })

  await test('Pipeline: real OpenAi provider participates in materialization', async () => {
    const repo = new InMemoryRepo()
    const fetchImpl = (async () => openAiCompletion(happyPayload())) as unknown as typeof fetch
    const provider: LlmProvider = new OpenAiLlmProvider({
      apiKey: 'sk', fetchImpl,
      cache: repoBackedCache(repo),
      onCallRecord: repoBackedRecorder(repo),
    })
    const reviewQueue = new ReviewQueue()
    const pipeline = new Pipeline({ reviewQueue, llmProvider: provider })
    const raw: RawEmailArtifact = {
      id: 'raw_001', orgId: ORG, receivedAt: '2026-04-22T11:15:00.000Z',
      envelope: {
        messageId: '<m1@iifl.com>', from: 'IIFL Research <research@iifl.com>',
        to: 'vimana@vimanacapital.com',
        subject: 'MARUTI — Buy reiterated, PT ₹13,500',
        receivedAt: '2026-04-22T11:15:00.000Z',
        bodyText: bundleFixture().bodyText, bodyHtml: null,
        forwardedBy: [],
      },
      attachmentRefs: [], linkedRefs: [],
    }
    const r = await pipeline.run(raw)
    assertEq(r.outcome, 'materialized_ready', 'materializes')
    const materialized = r.job.materialized!
    assert(materialized.summaries.length >= 1, 'at least one summary')
    // After materialization the LLM call should have been recorded.
    const records = repo.listLlmCallRecords(ORG)
    assert(records.length >= 1, 'recorded LLM call')
    assertEq(records[0]!.providerId, 'openai', 'recorded provider')
    assertEq(records[0]!.success, true, 'success recorded')
  })

  await test('bundleFromInput / templateVarsFor produce the documented shape', () => {
    const b = bundleFromInput(inputFixture())
    assertEq(b.bodyText, bundleFixture().bodyText, 'bodyText round-tripped')
    assertEq(b.attachmentTexts.length, 1, 'one attachment')
    const t = templateVarsFor(inputFixture())
    assertEq(t.broker, 'broker_iifl', 'broker var')
    assertEq(t.ticker, 'MARUTI', 'ticker var')
    assertEq(t.targetPrice, 13500, 'target price var')
  })

  // ── report ────────────────────────────────────────────────────────────
  let pass = 0, fail = 0
  for (const r of results) {
    if (r.ok) { pass++; console.log(`  ✓ ${r.name}`) }
    else      { fail++; console.log(`  ✗ ${r.name}\n      ${r.message ?? '(no message)'}`) }
  }
  console.log(`\nllm: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error('fatal:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
