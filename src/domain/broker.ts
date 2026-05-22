import type {
  BrokerId, EmailId, AttachmentId, OrgId, ReportId,
} from './ids'
import type { Iso8601 } from './common'
import type { EmailProcessingStatus } from './status'

// Global broker catalog entry. Brokers are not org-scoped themselves; they are
// a shared directory. Which brokers a particular org *consumes* is controlled
// by Organization.enabledBrokerIds.
export interface Broker {
  readonly id: BrokerId
  readonly name: string
  readonly shortName: string
  readonly senderDomains: readonly string[]
  readonly researchAliases: readonly string[]
  readonly coverageTags: readonly string[]
  readonly brandColor: string | null
  readonly website: string | null
}

// A single inbound email that was accepted into an org's ingestion pipeline.
// The Module-1 UI does not show these directly; they surface in the Ingestion
// ops console and as the source pointer on each normalized report.
export interface BrokerEmail {
  readonly id: EmailId
  readonly orgId: OrgId
  readonly brokerId: BrokerId | null
  readonly senderAddress: string
  readonly senderName: string
  readonly recipientAddress: string
  readonly subject: string
  readonly bodyPreview: string
  readonly receivedAt: Iso8601
  readonly forwardedFrom: readonly string[]
  readonly attachmentIds: readonly AttachmentId[]
  readonly reportIds: readonly ReportId[]
  readonly status: EmailProcessingStatus
  readonly statusMessage: string | null
  readonly sourceMessageId: string
}

// ── Broker resolution ──────────────────────────────────────────────────────
// How a forwarded research note's broker/research house was recovered.
// Forwarded mail names the *forwarder* (the person who relayed it), not the
// research house — the house is recovered from embedded forwarded headers,
// sender domains, disclaimers and subject prefixes. See
// src/adapters/serverOutput/brokerResolver.ts.

// Which signal the winning broker identity came from.
export type BrokerSource =
  | 'metadata'                // a structured broker field on the wire
  | 'original_sender_domain'  // the sending address's domain
  | 'forwarded_body_header'   // a `From:` header embedded in the forwarded body
  | 'signature_or_disclaimer' // a house name/domain in the body or filename
  | 'subject_prefix'          // a `[IIFL]` / `Kotak:` style subject label
  | 'llm_extraction'          // inferred by the extraction layer
  | 'unknown'                 // nothing resolved

// The class of a resolution outcome — authoritative for UI sorting + labels.
export type ResolutionClass =
  | 'mapped'                  // a research house present in the broker catalog
  | 'unmapped_research_house' // strong research-house evidence, domain/name not catalogued
  | 'other_source'            // clearly non-broker: IR, newsletter, macro, internal
  | 'unknown'                 // looks like research but the house cannot be resolved

// One piece of evidence considered while resolving a note's broker.
export interface BrokerEvidenceItem {
  readonly source: BrokerSource
  readonly brokerName: string
  readonly confidence: number
  readonly evidence: string
}

// The resolved broker identity for one research note, with provenance.
export interface BrokerResolution {
  readonly brokerId: BrokerId
  readonly brokerCanonicalName: string
  readonly brokerRawName?: string
  readonly brokerSource: BrokerSource
  readonly brokerConfidence: number
  readonly brokerEvidence?: string
  readonly resolutionClass: ResolutionClass
  readonly isMapped: boolean        // resolutionClass === 'mapped'
  readonly isUnresolved: boolean    // resolutionClass === 'unknown' ONLY
  readonly brokerConflict: boolean  // ≥2 signals resolved to DIFFERENT houses
  readonly evidenceTrail: readonly BrokerEvidenceItem[]
  readonly resolutionReason?: string
}

// A file extracted from a BrokerEmail. In Phase 1 we only parse PDFs; other
// mime types are captured for provenance but produce no reports.
export interface Attachment {
  readonly id: AttachmentId
  readonly orgId: OrgId
  readonly emailId: EmailId
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly checksumSha256: string
  readonly storageRef: string
  // Time-limited signed URL to the original document, when the source feed
  // provides one. Optional: only the forwarded-email adapter populates it;
  // other adapters leave it undefined.
  readonly sourceUrl?: string | null
  readonly pageCount: number | null
  readonly language: string | null
  readonly parseStatus: EmailProcessingStatus
  readonly parseErrorMessage: string | null
}
