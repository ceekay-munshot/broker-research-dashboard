import type { BrokerId, OrgId } from '../../src/domain'

// ─── Inbound email fixture (format produced by a future MTA/forwarder) ─
// Every email that lands in the Munshot/Vimana forwarding mailbox would
// be parsed into this shape by the MTA before the ingestion pipeline sees
// it. Fixture files under server/fixtures/emails/**/*.json use this shape
// verbatim so replacing the loader with a real MTA adapter later is a
// one-file change.

export interface InboundEmailFixtureAttachment {
  readonly filename: string
  readonly mimeType: string
  /** Path to the attachment's raw bytes, relative to the fixture JSON file. */
  readonly fixturePath: string
  readonly pageCount: number | null
  readonly language: string | null
}

export interface InboundEmailFixture {
  /** Upstream RFC-5322 Message-ID of the broker's original email. */
  readonly messageId: string
  /** The SMTP envelope "MAIL FROM" — the machine-level sender. */
  readonly envelopeSender: string
  /** Human-readable "From:" header, if present. */
  readonly originalFrom: string | null
  /** The forwarding chain — zero or more addresses that forwarded into the
   *  org's Munshot inbox. The last element is closest to the org. */
  readonly forwardedBy: readonly string[]
  /** The recipient address on the Munshot/Vimana side. */
  readonly recipient: string
  readonly subject: string
  readonly receivedAt: string  // ISO-8601
  readonly bodyText: string
  readonly bodyHtml: string | null
  readonly attachments: readonly InboundEmailFixtureAttachment[]
}

// ─── Ingestion outcomes ────────────────────────────────────────────────

export type IngestionRejectionReason =
  | 'UNKNOWN_RECIPIENT'        // recipient doesn't match any org's forwarding address
  | 'SENDER_NOT_ALLOWLISTED'   // sender domain/address not in org's allowlist
  | 'FORWARDER_NOT_ALLOWED'    // forwarding address not on the org's allowed-forwarder list
  | 'ATTACHMENT_MISSING'       // declared attachment fixture file not found
  | 'EXTRACTION_FAILED'        // DocumentTextExtractor threw

export interface IngestionRejection {
  readonly messageId: string
  readonly envelopeSender: string
  readonly recipient: string
  readonly reason: IngestionRejectionReason
  readonly detail: string
  readonly receivedAt: string
  /** orgId when the recipient resolves; null when the recipient is unknown. */
  readonly orgId: OrgId | null
}

export interface AdmittedInboundEmail {
  readonly fixture: InboundEmailFixture
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  /** Plain text extracted from every attachment, keyed by filename. */
  readonly attachmentTexts: ReadonlyMap<string, string>
}

// ─── Document extraction boundary ──────────────────────────────────────
// The real production implementation will be a PDF parser + OCR fallback.
// For now, server/src/ingestion/extractText.ts ships a plain-text and
// light pseudo-PDF stub. The interface is what the rest of the pipeline
// depends on.

export interface DocumentRef {
  readonly mimeType: string
  readonly absolutePath: string
  readonly filename: string
}

export interface DocumentTextExtractor {
  extract(ref: DocumentRef): Promise<string>
}
