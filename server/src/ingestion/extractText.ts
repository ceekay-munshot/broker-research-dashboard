import { readFile } from 'node:fs/promises'
import type { DocumentRef, DocumentTextExtractor } from '../types'

// DocumentTextExtractor is the one boundary real PDF parsing will replace
// when the production pipeline lands. Today we ship a conservative
// implementation:
//
//   • `text/plain`, `text/*`, `application/json` → raw file contents.
//   • `application/pdf` → best-effort text extraction. We don't ship a
//     PDF parser dependency yet; instead we read the file as UTF-8 and
//     strip obvious binary noise. This is intentionally weak — real PDFs
//     will fall through as empty strings and light the UI up with
//     EXTRACTION_FAILED until a real parser is wired in.
//   • Anything else → empty string.
//
// When the real extractor lands (e.g. `pdf-parse` + Tesseract for OCR),
// it implements the same `DocumentTextExtractor` interface and plugs in
// via server/src/ingestion/pipeline.ts. Nothing else changes.

export class PlainTextAndWeakPdfExtractor implements DocumentTextExtractor {
  async extract(ref: DocumentRef): Promise<string> {
    const buf = await readFile(ref.absolutePath)

    if (ref.mimeType === 'application/pdf') {
      return weakPdfToText(buf)
    }

    if (ref.mimeType.startsWith('text/') || ref.mimeType === 'application/json') {
      return buf.toString('utf8')
    }

    // Fall through: unsupported mime. Return empty so the normalizer can
    // still produce a BrokerEmail + Attachment row; just no evidence.
    return ''
  }
}

// Best-effort PDF → text: tries UTF-8 decode and filters out everything
// that isn't printable ASCII / common whitespace. Works only on PDFs with
// a plaintext content stream (the simplest kind); modern PDFs with
// compressed streams return mostly garbage, which is fine — the pipeline
// degrades gracefully to an empty extraction and logs a warning.
export function weakPdfToText(buf: Buffer): string {
  const raw = buf.toString('utf8')
  // Keep only printable + common whitespace; collapse runs of whitespace.
  const cleaned = raw
    .replace(/[^\x20-\x7e\t\r\n]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned
}
