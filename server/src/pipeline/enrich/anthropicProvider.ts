import type { LlmEnrichInput, LlmProvider } from './provider'
import type { LlmEnrichment } from '../models'
import { ensureEvidenceBacked } from './openaiProvider'
import { PipelineError } from '../errors'

/**
 * Anthropic provider — stub at the boundary. Same contract as the
 * OpenAI provider; no live API calls in this repo.
 *
 * To wire a real implementation:
 *   1. Read `ANTHROPIC_API_KEY` from env.
 *   2. Build a single Claude messages call per candidate, requesting
 *      structured JSON output covering thesis / keyPoints / themes /
 *      risks / catalysts / evidence[].
 *   3. Reject any field that lacks an `evidence[]` entry.
 *   4. On error throw PipelineError('LLM_FAILURE_FALLBACK', detail).
 */
export interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  readonly fetcher?: (req: unknown) => Promise<unknown>
}

export class AnthropicLlmProvider implements LlmProvider {
  readonly id: string
  constructor(private readonly opts: AnthropicProviderOptions = {}) {
    this.id = `anthropic:${opts.model ?? 'claude-stub'}`
  }

  async enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null> {
    if (!this.opts.apiKey) return null
    if (!this.opts.fetcher) {
      throw new PipelineError(
        'LLM_FAILURE_FALLBACK',
        'AnthropicLlmProvider configured with apiKey but no fetcher; cannot make real call from this repo.',
      )
    }
    try {
      const result = await this.opts.fetcher({ input, model: this.opts.model }) as LlmEnrichment | null
      if (!result) return null
      return ensureEvidenceBacked(result, this.id)
    } catch (e) {
      throw new PipelineError(
        'LLM_FAILURE_FALLBACK',
        e instanceof Error ? e.message : String(e),
      )
    }
  }
}
