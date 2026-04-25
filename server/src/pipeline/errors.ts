// Typed error categories produced by the pipeline. Each category maps to a
// `ReviewQueueItem.reasonCategory` so operators can filter and prioritize.

export type PipelineErrorCategory =
  | 'AMBIGUOUS_TICKER'           // multiple equally-likely tickers extracted
  | 'CONFLICTING_RATINGS'        // body and attachment disagree on rating
  | 'CONFLICTING_TARGETS'        // body and attachment disagree on target
  | 'BROKEN_LINKED_ARTIFACT'     // URL fetch failed or returned non-content
  | 'EMPTY_EXTRACTION'           // no usable text from any source
  | 'LOW_CONFIDENCE_DIGEST'      // digest split heuristics couldn't separate
  | 'LLM_FAILURE_FALLBACK'       // LLM provider failed; deterministic fallback only
  | 'BROKER_NOT_RESOLVED'        // sender allowlist match failed
  | 'INTERNAL'                   // unexpected exception

export class PipelineError extends Error {
  readonly category: PipelineErrorCategory
  readonly recoverable: boolean
  readonly detail: string

  constructor(category: PipelineErrorCategory, detail: string, recoverable = true) {
    super(`[${category}] ${detail}`)
    this.name = 'PipelineError'
    this.category = category
    this.detail = detail
    this.recoverable = recoverable
  }
}
