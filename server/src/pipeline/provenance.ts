// Provenance tracking — every materialized field can be traced back to the
// raw input that produced it. The frontend never sees this directly, but
// it's what makes "evidence-backed" claim — the materializer writes
// EvidenceSnippet records that point to the originating source span.

export type ProvenanceSourceKind =
  | 'email_body'
  | 'email_attachment'
  | 'linked_webpage'
  | 'linked_pdf'
  | 'llm_enrichment'   // Tracked but never stands alone as ground-truth
                        // for deterministic fields.

export interface ProvenanceRef {
  readonly kind: ProvenanceSourceKind
  /** Identifier within the artifact set (filename / URL / "body"). */
  readonly id: string
  /** Optional 1-based page or section number. */
  readonly page?: number
  /** Optional character offsets into the extracted text. */
  readonly charStart?: number
  readonly charEnd?: number
}

/** Convenience constructors so call sites are short and stable. */
export const provFromBody = (charStart?: number, charEnd?: number): ProvenanceRef =>
  ({ kind: 'email_body', id: 'body', charStart, charEnd })
export const provFromAttachment = (filename: string, page?: number, charStart?: number, charEnd?: number): ProvenanceRef =>
  ({ kind: 'email_attachment', id: filename, page, charStart, charEnd })
export const provFromLinkedWebpage = (url: string, charStart?: number, charEnd?: number): ProvenanceRef =>
  ({ kind: 'linked_webpage', id: url, charStart, charEnd })
export const provFromLinkedPdf = (url: string, page?: number, charStart?: number, charEnd?: number): ProvenanceRef =>
  ({ kind: 'linked_pdf', id: url, page, charStart, charEnd })
export const provFromLlm = (model: string): ProvenanceRef =>
  ({ kind: 'llm_enrichment', id: model })
