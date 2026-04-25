// LLM provider boundary.
//
// The pipeline calls a single `LlmProvider.enrich(...)` method per
// candidate. Every implementation must respect three rules:
//
//   1. Deterministic fields (broker, ticker, rating, target prices,
//      dates, report type) are NEVER produced or overridden by the LLM.
//      The candidate handed in already carries them; the provider may
//      ignore them or use them as context, but never replace them.
//
//   2. Every enrichment field returned must be evidence-backed. The
//      provider must populate `evidence: EvidenceSpan[]` covering the
//      thesis / key points / themes / risks it contributes. The
//      materializer drops any enrichment field that lacks evidence.
//
//   3. The provider must succeed even when degraded. If a model is
//      unavailable, throw a `LLM_FAILURE_FALLBACK` PipelineError; the
//      orchestrator catches it and proceeds with deterministic-only
//      fields. The pipeline must always produce *some* canonical record.

import type { LlmEnrichment, ParsedReportCandidate, ExtractedTextArtifact } from '../models'

export interface LlmEnrichInput {
  readonly candidate: ParsedReportCandidate
  readonly bodyText: string
  readonly attachmentTexts: readonly ExtractedTextArtifact[]
  readonly linkedTexts: readonly ExtractedTextArtifact[]
}

export interface LlmProvider {
  readonly id: string
  /** Returns enrichment, or null when this provider deliberately does
   *  not enrich. Throws `PipelineError` with `LLM_FAILURE_FALLBACK` when
   *  the model call failed. */
  enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null>
}
