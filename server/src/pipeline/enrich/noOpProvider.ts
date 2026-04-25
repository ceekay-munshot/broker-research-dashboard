import type { LlmEnrichInput, LlmProvider } from './provider'

/** Default LLM provider — does no enrichment.
 *
 *  This is the baseline the rest of the pipeline must work against:
 *  every test runs with this provider so the deterministic path is
 *  self-sufficient. Real providers (OpenAI / Anthropic) compose on top
 *  of, never replace, the deterministic candidate. */
export class NoOpLlmProvider implements LlmProvider {
  readonly id = 'noop'
  async enrich(_input: LlmEnrichInput): Promise<null> {
    return null
  }
}
