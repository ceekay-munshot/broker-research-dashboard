import type { OrgId, EmailId, IngestionJobId } from './ids'
import type { Iso8601 } from './common'

// Processing lifecycle for inbound broker artifacts. The state machine runs
// separately for an email and for each of its attachments; both use this
// enum for consistency.
//
//   received   → email landed in the forwarding mailbox
//   queued     → accepted, waiting for worker
//   parsing    → extracting text/metadata (PDF, HTML, etc.)
//   normalizing→ mapping into canonical domain objects
//   summarizing→ running the summary model
//   ready      → fully processed, exposed to the UI
//   failed     → unrecoverable error; `statusMessage` explains
//   skipped    → admitted but intentionally not processed (e.g. calendar
//                invite, disclaimer-only note, duplicate)
export type EmailProcessingStatus =
  | 'received'
  | 'queued'
  | 'parsing'
  | 'normalizing'
  | 'summarizing'
  | 'ready'
  | 'failed'
  | 'skipped'

export interface IngestionJob {
  readonly id: IngestionJobId
  readonly orgId: OrgId
  readonly emailId: EmailId
  readonly status: EmailProcessingStatus
  readonly startedAt: Iso8601
  readonly completedAt: Iso8601 | null
  readonly failureReason: string | null
  readonly pipelineVersion: string
}

// Aggregate ops metrics for the ingestion queue, org-scoped.
export interface IngestionStatus {
  readonly orgId: OrgId
  readonly asOf: Iso8601
  readonly queued: number
  readonly processing: number
  readonly readyLast24h: number
  readonly failedLast24h: number
  readonly throughputPerHour: number
}
