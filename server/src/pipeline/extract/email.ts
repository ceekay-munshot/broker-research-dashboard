// Email-envelope extraction.
//
// Reuses the production `RawEmailArtifact` shape. We intentionally do NOT
// re-parse `.eml` bytes here — the upstream / MTA has already done that
// and handed us text + headers in `RawEmailArtifact.envelope`. The
// existing `server/src/eml/parse.ts` is still used by the legacy
// `server/src/ingestion/` harness to load fixtures from disk; the new
// pipeline accepts the post-MTA envelope shape.

import type { ParsedEmailArtifact, RawEmailArtifact } from '../models'
import { extractAddress } from '../../eml/parse'

/** Extract URL references from email body text. Permissive but bounded —
 *  we want links to broker sites, sell-side PDFs, news pages, and so on. */
const URL_REGEX = /https?:\/\/[^\s<>"')]+/gi

export function extractEmailEnvelope(raw: RawEmailArtifact): ParsedEmailArtifact {
  const env = raw.envelope
  const senderAddress = extractAddress(env.from) ?? env.from
  // Linked URLs we'll later try to fetch + extract.
  const linkedUrls = uniq(matchAll(env.bodyText, URL_REGEX))
    .concat(uniq(matchAll(env.bodyHtml ?? '', URL_REGEX)))
  return {
    orgId: raw.orgId,
    messageId: env.messageId,
    subject: env.subject,
    bodyText: env.bodyText,
    bodyHtml: env.bodyHtml,
    senderAddress: senderAddress.toLowerCase(),
    senderName: env.from,
    recipientAddress: env.to.toLowerCase(),
    forwardedBy: env.forwardedBy,
    receivedAt: env.receivedAt,
    attachmentNames: raw.attachmentRefs.map((a) => a.filename),
    linkedUrls: uniq(linkedUrls),
  }
}

function matchAll(s: string, re: RegExp): string[] {
  const out: string[] = []
  for (const m of s.matchAll(re)) out.push(m[0])
  return out
}

function uniq<T>(arr: readonly T[]): T[] {
  return [...new Set(arr)]
}
