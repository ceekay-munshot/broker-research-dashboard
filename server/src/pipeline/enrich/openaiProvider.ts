import type { LlmEnrichInput, LlmProvider } from './provider'
import type { EvidenceSpan, LlmEnrichment } from '../models'
import { provFromLlm } from '../provenance'
import { PipelineError } from '../errors'

/**
 * OpenAI provider — stubbed at the boundary. This file documents the
 * contract a real implementation must satisfy. It does NOT call the
 * OpenAI API in this repo (the dashboard is a read-only analytics
 * client; live model calls happen inside the upstream's ingestion
 * service).
 *
 * To wire a real implementation:
 *   1. Read `OPENAI_API_KEY` from env.
 *   2. Build a single chat-completion call per candidate with a
 *      structured output schema covering thesis / keyPoints / themes /
 *      risks / catalysts / evidence[].
 *   3. Reject any returned field that lacks an `evidence[]` entry —
 *      the materializer drops un-grounded fields anyway, but failing
 *      fast keeps the model honest.
 *   4. On error throw PipelineError('LLM_FAILURE_FALLBACK', detail).
 *
 * The skeleton below produces a deterministic, low-effort enrichment
 * that the test harness uses to prove the wiring without external
 * network calls.
 */
export interface OpenAiProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  /** Pluggable client; only used when not in stub mode. */
  readonly fetcher?: (req: unknown) => Promise<unknown>
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly id: string
  constructor(private readonly opts: OpenAiProviderOptions = {}) {
    this.id = `openai:${opts.model ?? 'gpt-stub'}`
  }

  async enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null> {
    if (!this.opts.apiKey) {
      // No key configured — behave like the no-op provider. We do NOT
      // throw, because "key absent" is a deployment choice, not a
      // failure.
      return null
    }
    // The `fetcher` boundary lets tests inject a fake response. Real
    // production wires `https://api.openai.com/v1/chat/completions`.
    if (!this.opts.fetcher) {
      throw new PipelineError(
        'LLM_FAILURE_FALLBACK',
        'OpenAiLlmProvider configured with apiKey but no fetcher; cannot make real call from this repo.',
      )
    }
    try {
      const result = await this.opts.fetcher({ input, model: this.opts.model }) as LlmEnrichment | null
      if (!result) return null
      return ensureEvidenceBacked(result, this.id)
    } catch (e: unknown) {
      throw new PipelineError(
        'LLM_FAILURE_FALLBACK',
        e instanceof Error ? e.message : String(e),
      )
    }
  }
}

/** Drop any field that doesn't have at least one supporting evidence
 *  span. Pure function — easy to unit-test in isolation. */
export function ensureEvidenceBacked(raw: LlmEnrichment, providerId: string): LlmEnrichment {
  const ev = raw.evidence ?? []
  const has = (field: EvidenceSpan['supportingField']) => ev.some((e) => e.supportingField === field)
  return {
    providerId,
    thesis:    has('thesis')    ? raw.thesis    : undefined,
    keyPoints: has('keyPoint')  ? raw.keyPoints : undefined,
    themes:    has('theme')     ? raw.themes    : undefined,
    risks:     has('risk')      ? raw.risks     : undefined,
    catalysts: has('catalyst')  ? raw.catalysts : undefined,
    evidence: ev.map((e) => ({
      ...e,
      provenance: e.provenance.kind === 'llm_enrichment' ? provFromLlm(providerId) : e.provenance,
    })),
  }
}
