// Stable fingerprints used everywhere we need to dedupe.
//
// Three keys exist for raw emails — any of them is sufficient evidence
// that we've already seen this email:
//
//   1. upstream id           (e.g. "raw_28391")  — when the upstream
//                              assigns its own row id we trust it.
//   2. RFC 5322 Message-ID    — survives forwarding chains.
//   3. envelope fingerprint   — sha256 of (from + subject + receivedAt)
//                              for the rare case where neither id is
//                              present or trustworthy.
//
// Linked artifacts dedupe by (URL + content-hash); attachments dedupe
// by (filename + sha256 of bytes/text). The pipeline already produces
// deterministic canonical IDs from the message-id, so once we've
// admitted a raw email past these checks the rest is automatic.

import { createHash } from 'node:crypto'
import type { OrgId } from '../../../src/domain'
import type { RawEmailArtifact } from '../pipeline/models'

/** Stable, content-derived fingerprint for a raw email. */
export function rawEmailFingerprint(orgId: OrgId, raw: RawEmailArtifact, upstreamId?: string): string {
  const parts = [
    `org:${orgId as unknown as string}`,
    `up:${upstreamId ?? ''}`,
    `msg:${raw.envelope.messageId ?? ''}`,
    `env:${sha256(`${raw.envelope.from}|${raw.envelope.subject}|${raw.envelope.receivedAt}`)}`,
  ]
  return sha256(parts.join('||'))
}

/** Linked-artifact dedupe key: URL + a hash of the cached/fetched text. */
export function linkedArtifactFingerprint(url: string, text: string): string {
  return sha256(`${url}|${text.length}|${sha256(text).slice(0, 16)}`)
}

/** Attachment dedupe key: filename + sha256 of bytes/text. */
export function attachmentFingerprint(filename: string, content: string): string {
  return sha256(`${filename}|${sha256(content)}`)
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
