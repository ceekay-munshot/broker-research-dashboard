import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OrgId } from '../../../src/domain'
import { parseEml, type ParsedEmail, type ParsedAttachment } from '../eml/parse'
import { weakPdfToText } from './extractText'
import { findAllowlistByRecipient } from '../config/allowlist'
import { pickProfile } from './profiles'
import type { ProfileMatch, ProfileOutputs } from './profiles'
import type { IngestionRejection, IngestionRejectionReason } from '../types'

// Entry point for .eml ingestion. For each file we:
//
//   1. Parse bytes → ParsedEmail (eml/parse.ts).
//   2. Validate the delivered-to address resolves to an org.
//   3. Pick a parser profile based on From + Subject + attachment shape.
//   4. Decode each attachment's text (plain or weak PDF). We never OCR.
//   5. Invoke the profile's extractor → ProfileOutputs.
//
// The outputs are then handed to the store by the pipeline caller.

export interface EmlLoadedAccepted {
  readonly kind: 'accepted'
  readonly filename: string
  readonly orgId: OrgId
  readonly match: ProfileMatch
  readonly outputs: ProfileOutputs
  readonly parsed: ParsedEmail
}

export interface EmlLoadedRejected {
  readonly kind: 'rejected'
  readonly filename: string
  readonly rejection: IngestionRejection
}

export type EmlLoadedResult = EmlLoadedAccepted | EmlLoadedRejected

export async function loadAndProfileEml(absPath: string): Promise<EmlLoadedResult> {
  const filename = absPath.split('/').pop() ?? absPath
  const buf = await readFile(absPath)
  const parsed = parseEml(buf)

  const recipient = extractPrimaryRecipient(parsed)
  const allowlist = recipient ? findAllowlistByRecipient(recipient) : null
  if (!allowlist) {
    return rejected(filename, parsed, recipient, null, 'UNKNOWN_RECIPIENT',
      recipient
        ? `recipient ${recipient} does not match any org forwarding address`
        : 'no deliverable recipient resolvable from headers')
  }

  const match = pickProfile(parsed, parsed.attachments)
  if (!match) {
    return rejected(filename, parsed, recipient, allowlist.orgId, 'SENDER_NOT_ALLOWLISTED',
      `no parser profile matched (from=${parsed.from ?? '?'}, subject="${parsed.subject.slice(0, 80)}")`)
  }

  // Confirm the detected broker is actually enabled for this org. The
  // allowlist.brokerBySender map is keyed on the sender's domain or exact
  // address — we already know it resolves to *some* broker, but the picker
  // may have chosen a different profile-level broker for an unexpected
  // sender. In practice the two agree on all our samples; bail out if not.
  const resolvedBroker = allowlist.brokerBySender
    .get((parsed.from ?? '').toLowerCase()) ?? null
  const domainBroker = allowlist.brokerBySender.get(domainOf(parsed.from)) ?? null
  const allowedBrokerForSender = resolvedBroker ?? domainBroker
  if (!allowedBrokerForSender || allowedBrokerForSender !== match.brokerId) {
    return rejected(filename, parsed, recipient, allowlist.orgId, 'SENDER_NOT_ALLOWLISTED',
      `profile picked broker ${match.brokerId} but allowlist resolves sender to ${allowedBrokerForSender ?? 'none'}`)
  }

  // Decode every attachment's text. For PDFs the weak extractor does its
  // best; anything else (images) returns empty. Profiles are expected to
  // degrade gracefully.
  const attachmentTexts = new Map<string, string>()
  for (const att of parsed.attachments) {
    attachmentTexts.set(att.filename, extractAttachmentText(att))
  }

  const profile = pickProfile(parsed, parsed.attachments)
  if (!profile) {
    return rejected(filename, parsed, recipient, allowlist.orgId, 'SENDER_NOT_ALLOWLISTED',
      'profile disappeared between selection and extraction (race)')
  }

  // Re-fetch the profile object (pickProfile returns the match record; we
  // need the actual profile to call .extract()).
  const profileObject = (await import('./profiles')).PROFILES.find((p) => p.id === match.profileId)
  if (!profileObject) {
    return rejected(filename, parsed, recipient, allowlist.orgId, 'SENDER_NOT_ALLOWLISTED',
      `profile ${match.profileId} not found in registry`)
  }

  const receivedAt = parsed.date ? isoify(parsed.date) : new Date().toISOString()
  const outputs = profileObject.extract({
    orgId: allowlist.orgId,
    brokerId: match.brokerId,
    email: parsed,
    attachmentTexts,
    receivedAt,
  })

  return {
    kind: 'accepted',
    filename,
    orgId: allowlist.orgId,
    match,
    outputs,
    parsed,
  }
}

export async function listEmlFixtures(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    return entries.filter((f) => f.toLowerCase().endsWith('.eml')).sort().map((f) => join(dir, f))
  } catch {
    return []
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function extractAttachmentText(att: ParsedAttachment): string {
  if (att.mimeType === 'application/pdf') return weakPdfToText(att.data)
  if (att.mimeType.startsWith('text/')) return att.data.toString('utf8')
  return ''
}

function extractPrimaryRecipient(email: ParsedEmail): string | null {
  // Prefer Delivered-To (the original mailbox SMTP delivered the message
  // to), then the To: header's first address.
  const dt = email.deliveredTo ? firstAddress(email.deliveredTo) : null
  if (dt) return dt.toLowerCase()
  return email.to ? firstAddress(email.to)?.toLowerCase() ?? null : null
}

function firstAddress(header: string): string | null {
  const m = header.match(/<([^>]+)>/)
  if (m) return m[1]!.trim()
  const m2 = header.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/)
  return m2 ? m2[0] : null
}

function domainOf(addrHeader: string | null): string {
  if (!addrHeader) return ''
  const addr = firstAddress(addrHeader)
  if (!addr) return ''
  const at = addr.lastIndexOf('@')
  return at === -1 ? '' : addr.slice(at + 1).toLowerCase()
}

function isoify(headerDate: string): string {
  const d = new Date(headerDate)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

function rejected(
  filename: string,
  parsed: ParsedEmail,
  recipient: string | null,
  orgId: OrgId | null,
  reason: IngestionRejectionReason,
  detail: string,
): EmlLoadedRejected {
  return {
    kind: 'rejected',
    filename,
    rejection: {
      messageId: parsed.messageId ?? `<unknown@${filename}>`,
      envelopeSender: (parsed.from && firstAddress(parsed.from)) ?? 'unknown@unknown',
      recipient: recipient ?? 'unknown@unknown',
      reason,
      detail,
      receivedAt: parsed.date ? isoify(parsed.date) : new Date().toISOString(),
      orgId,
    },
  }
}
