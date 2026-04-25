// ─────────────────────────────────────────────────────────────────────────
// Anthropic provider — real implementation behind the LlmProvider boundary.
//
// Mirrors `openaiProvider.ts`: composes a Messages-API request from the
// prompt registry, validates structured output, enforces grounding,
// caches by deterministic key, and records cost/latency. The HTTP
// boundary (`fetchImpl`) is injectable so tests run without network.
//
// Without an `apiKey` the provider returns `null` — preserving the
// no-op fallback behaviour. Without a `fetchImpl` (and with an
// `apiKey` set) the provider uses Node's global `fetch`.
//
// Back-compat: the legacy `fetcher` option (a high-level
// `(req) => LlmEnrichment | null` shape) is still honoured. Existing
// tests that inject a high-level fetcher continue to pass; the real
// path is taken only when `apiKey` is set without `fetcher`.
// ─────────────────────────────────────────────────────────────────────────

import type { LlmEnrichInput, LlmProvider } from './provider'
import type { LlmEnrichment } from '../models'
import {
  ensureEvidenceBacked, bundleFromInput, templateVarsFor, shapeEnrichment,
} from './openaiProvider'
import { PipelineError } from '../errors'
import {
  PROMPT_REGISTRY, runEnrichmentTask, type LlmCallRecord,
} from '../../llm'

export interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  /** Cache backend; the runner typically wires a Repo-backed one. */
  readonly cache?: {
    readonly get: (key: string) => unknown | null
    readonly set: (entry: import('../../llm').LlmCacheEntry) => void
  }
  /** Hook to persist call accounting records. */
  readonly onCallRecord?: (rec: Omit<LlmCallRecord, 'id' | 'at'>) => void
  /**
   * Legacy back-compat hook. When present the provider routes through
   * it instead of the real HTTP path — used by Module-13 tests that
   * inject a high-level fetcher returning a pre-built LlmEnrichment.
   */
  readonly fetcher?: (req: unknown) => Promise<unknown>
}

export class AnthropicLlmProvider implements LlmProvider {
  readonly id: string
  constructor(private readonly opts: AnthropicProviderOptions = {}) {
    // We use the recommended model from `change_narrative` as the
    // default-display id since Anthropic is the registry's preferred
    // primary for that task. The actual model used per call is still
    // selected by `runEnrichmentTask` from the prompt registry.
    this.id = `anthropic:${opts.model ?? PROMPT_REGISTRY.change_narrative.recommended.model}`
  }

  async enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null> {
    if (!this.opts.apiKey) return null

    // Legacy back-compat path: a high-level `fetcher` short-circuits
    // the real HTTP path so Module-13 tests keep working.
    if (this.opts.fetcher) {
      try {
        const result = await this.opts.fetcher({ input, model: this.opts.model }) as LlmEnrichment | null
        if (!result) return null
        return ensureEvidenceBacked(result, this.id)
      } catch (e: unknown) {
        throw new PipelineError('LLM_FAILURE_FALLBACK',
          e instanceof Error ? e.message : String(e))
      }
    }

    // Real path: prompt registry → orchestrator → validated payload.
    // We use `summary_enrichment` so the provider produces the same
    // `LlmEnrichment` shape the materializer consumes; the prompt's
    // fallback chain still routes here when Anthropic is the
    // configured primary.
    const prompt = PROMPT_REGISTRY.summary_enrichment
    const bundle = bundleFromInput(input)
    const candidateKey = `${input.candidate.brokerId as unknown as string}:${(input.candidate.ticker as unknown as string) ?? '_'}`
    const result = await runEnrichmentTask({
      orgId: input.candidate.orgId,
      artifactId: candidateKey,
      candidateKey,
      prompt,
      bundle,
      templateVars: templateVarsFor(input),
      // Force the orchestrator to attempt Anthropic first. Without
      // this the registry recommends OpenAI for summary_enrichment;
      // when the operator has explicitly wired the Anthropic provider
      // we want Anthropic to be the primary attempt.
      modelOverride: {
        provider: 'anthropic',
        model: this.opts.model ?? PROMPT_REGISTRY.summary_enrichment.fallback?.model
          ?? PROMPT_REGISTRY.change_narrative.recommended.model,
      },
      anthropic: {
        apiKey: this.opts.apiKey, baseUrl: this.opts.baseUrl,
        fetchImpl: this.opts.fetchImpl, timeoutMs: this.opts.timeoutMs,
      },
      cache: this.opts.cache,
      onCallRecord: this.opts.onCallRecord,
    })
    if (!result) {
      throw new PipelineError('LLM_FAILURE_FALLBACK',
        'AnthropicLlmProvider: all enrichment attempts failed (see LlmCallRecord trail).')
    }
    return shapeEnrichment(result.payload, `anthropic:${result.model}`, bundle)
  }
}
