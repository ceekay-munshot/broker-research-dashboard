// Typed error categories produced by the pipeline. Each category maps to a
// `ReviewQueueItem.reasonCategory` so operators can filter and prioritize.

export type PipelineErrorCategory =
  | 'AMBIGUOUS_TICKER'             // multiple equally-likely tickers extracted
  | 'CONFLICTING_RATINGS'          // body and attachment disagree on rating
  | 'CONFLICTING_TARGETS'          // body and attachment disagree on target
  | 'BROKEN_LINKED_ARTIFACT'       // URL fetch failed or returned non-content
  | 'EMPTY_EXTRACTION'             // no usable text from any source
  | 'LOW_CONFIDENCE_DIGEST'        // digest split heuristics couldn't separate
  | 'LLM_FAILURE_FALLBACK'         // LLM provider failed; deterministic fallback only
  | 'BROKER_NOT_RESOLVED'          // sender allowlist match failed
  | 'EVIDENCE_MISMATCH'            // (Module 15) summary fields populated without backing evidence
  | 'LOW_QUALITY_SUMMARY'          // (Module 15) thesis too short, no key points, etc.
  | 'MISSING_TARGET_FOR_RATED'     // (Module 15) Buy/Sell rating but no target price extracted
  | 'INTERNAL'                     // unexpected exception

/** Severity hint for operator triage. Not enforced at the type level —
 *  consumers (CLI, dashboards) read it via `severityFor()`. */
export type ReviewSeverity = 'high' | 'medium' | 'low'

export function severityFor(cat: PipelineErrorCategory): ReviewSeverity {
  switch (cat) {
    case 'BROKER_NOT_RESOLVED':
    case 'CONFLICTING_RATINGS':
    case 'CONFLICTING_TARGETS':
    case 'INTERNAL':
      return 'high'
    case 'AMBIGUOUS_TICKER':
    case 'LOW_CONFIDENCE_DIGEST':
    case 'EMPTY_EXTRACTION':
    case 'EVIDENCE_MISMATCH':
    case 'MISSING_TARGET_FOR_RATED':
      return 'medium'
    case 'BROKEN_LINKED_ARTIFACT':
    case 'LLM_FAILURE_FALLBACK':
    case 'LOW_QUALITY_SUMMARY':
      return 'low'
  }
}

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
