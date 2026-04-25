// Linked-artifact fetcher + extractor.
//
// Pluggable: tests inject a `CachedLinkedArtifactExtractor` that reads
// from `RawLinkedRef.cachedText`. Production injects a real fetch
// implementation (`undici`/global fetch) plus an HTML/PDF text
// extractor. The pipeline never blocks on a linked artifact — failures
// produce a `BROKEN_LINKED_ARTIFACT` review item, but the email +
// attachment-derived candidate still materializes.

import type { ExtractedTextArtifact, RawLinkedRef } from '../models'
import { provFromLinkedPdf, provFromLinkedWebpage } from '../provenance'
import { PipelineError } from '../errors'

export interface LinkedArtifactExtractor {
  extract(ref: RawLinkedRef): Promise<ExtractedTextArtifact>
}

/** Test / fixture extractor: serves whatever the fixture cached. If a
 *  ref has no cached payload, treat as a broken link. */
export class CachedLinkedArtifactExtractor implements LinkedArtifactExtractor {
  async extract(ref: RawLinkedRef): Promise<ExtractedTextArtifact> {
    if (!ref.cachedText) {
      throw new PipelineError(
        'BROKEN_LINKED_ARTIFACT',
        `No cached text for linked artifact: ${ref.url}`,
      )
    }
    const contentType = ref.cachedContentType
      ?? (ref.hint === 'pdf' ? 'application/pdf' : 'text/html')
    const isPdf = contentType.startsWith('application/pdf') || ref.hint === 'pdf'
    return {
      text: ref.cachedText,
      contentType,
      provenance: isPdf ? provFromLinkedPdf(ref.url) : provFromLinkedWebpage(ref.url),
    }
  }
}

/** Production-shape extractor that uses the global fetch + a simple
 *  HTML→text fallback. PDF bytes are returned as `[PDF: N bytes]`
 *  unless a real PDF extractor is composed on top. Provided as a
 *  starting point — swap for a vendor implementation in deployment. */
export class HttpFetchLinkedArtifactExtractor implements LinkedArtifactExtractor {
  constructor(private readonly opts: { readonly timeoutMs?: number; readonly maxBytes?: number } = {}) {}

  async extract(ref: RawLinkedRef): Promise<ExtractedTextArtifact> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 8000)
    try {
      const res = await fetch(ref.url, { signal: ctrl.signal })
      if (!res.ok) {
        throw new PipelineError('BROKEN_LINKED_ARTIFACT', `HTTP ${res.status} for ${ref.url}`)
      }
      const ct = res.headers.get('content-type') ?? 'text/html'
      const max = this.opts.maxBytes ?? 5 * 1024 * 1024
      const buf = await res.arrayBuffer()
      if (buf.byteLength > max) {
        throw new PipelineError('BROKEN_LINKED_ARTIFACT', `Linked artifact > ${max} bytes`)
      }
      const isPdf = ct.startsWith('application/pdf')
      const text = isPdf
        ? `[PDF: ${buf.byteLength} bytes — wire a real PDF extractor here]`
        : htmlToText(new TextDecoder('utf-8').decode(new Uint8Array(buf)))
      return {
        text,
        contentType: ct,
        provenance: isPdf ? provFromLinkedPdf(ref.url) : provFromLinkedWebpage(ref.url),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Minimal HTML → text converter. Not a full HTML parser — just enough
 *  to give the deterministic extractor + LLM a clean substrate. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}
