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
  readonly pageCount: number | null
  readonly language: string | null
  readonly parseStatus: EmailProcessingStatus
  readonly parseErrorMessage: string | null
}
