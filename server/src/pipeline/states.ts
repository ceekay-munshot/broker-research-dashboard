// ─────────────────────────────────────────────────────────────────────────
// Pipeline processing states.
//
// Every artifact (email, attachment, linked document) carries a
// `ProcessingState`. The pipeline advances it monotonically toward
// `materialized_ready` — or terminally to `failed` / `review_needed`.
//
// The states are explicit on purpose: a real production system can persist
// them to a queue/DB and resume from any stage, and an operator can audit
// where a stuck artifact got stuck.
// ─────────────────────────────────────────────────────────────────────────

export type ProcessingState =
  // Raw payload landed (envelope known but not yet parsed).
  | 'fetched_raw'
  // Email envelope parsed — headers, body text, attachment list available.
  | 'parsed_email'
  // Attachment text extracted (PDF / docx / inline).
  | 'extracted_attachment_text'
  // Linked artifact (URL) fetched + extracted.
  | 'extracted_linked_artifact_text'
  // Deterministic fields (broker, ticker, rating, target, type, dates) ready.
  | 'deterministic_fields_ready'
  // Optional LLM enrichment applied (or skipped with no-op provider).
  | 'llm_enriched'
  // Canonical /v1 entities produced and written to the store.
  | 'materialized_ready'
  // Terminal: pipeline failed with a typed reason.
  | 'failed'
  // Terminal-for-now: human review required (ambiguous, conflicting,
  // low-confidence). Reprocessable later.
  | 'review_needed'

export const TERMINAL_STATES: readonly ProcessingState[] = [
  'materialized_ready', 'failed', 'review_needed',
] as const

export const ADVANCING_STATES: readonly ProcessingState[] = [
  'fetched_raw',
  'parsed_email',
  'extracted_attachment_text',
  'extracted_linked_artifact_text',
  'deterministic_fields_ready',
  'llm_enriched',
  'materialized_ready',
] as const

export function isTerminal(s: ProcessingState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(s)
}
