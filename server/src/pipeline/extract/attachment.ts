// Attachment text extraction.
//
// In production this is a real PDF parser (pdfjs / pdf-parse / Tika /
// AWS Textract for OCR fallback). In this repo we ship a pluggable
// boundary so:
//   - tests pass `text` directly via the fixture;
//   - production code injects a real extractor;
//   - intermediate dev paths can use the existing
//     `weakPdfToText` from `server/src/ingestion/extractText.ts`.
//
// The boundary returns `ExtractedTextArtifact` with provenance pointing
// at the originating attachment.

import type { ExtractedTextArtifact, RawAttachmentRef } from '../models'
import { provFromAttachment } from '../provenance'

export interface AttachmentTextExtractor {
  extract(ref: RawAttachmentRef): Promise<ExtractedTextArtifact>
}

/** Default extractor: returns the pre-extracted `ref.text` when present.
 *  Used by tests and integration rehearsal. Production swaps this for a
 *  real PDF-bytes-to-text implementation. */
export class CachedTextAttachmentExtractor implements AttachmentTextExtractor {
  async extract(ref: RawAttachmentRef): Promise<ExtractedTextArtifact> {
    const text = ref.text ?? ''
    return {
      text,
      contentType: ref.mimeType,
      provenance: provFromAttachment(ref.filename, /* page */ undefined),
      tokenCountEstimate: estimateTokens(text),
    }
  }
}

export function estimateTokens(text: string): number {
  // Rough proxy for budgeting LLM calls: ~4 chars per token on English.
  return Math.ceil(text.length / 4)
}
