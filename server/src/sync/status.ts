// Operational status snapshot. Exposes per-org sync metadata to CLI +
// API surfaces without leaking persistence types upward.

import type { OrgId } from '../../../src/domain'
import type { Repo, SyncCheckpoint } from '../persistence/types'

export interface OperationalStatus {
  readonly orgId: OrgId
  readonly checkpoint: SyncCheckpoint | null
  readonly counts: {
    readonly rawEmails: number
    readonly materialized: number
    readonly failed: number
    readonly reviewNeeded: number
    readonly reviewOpen: number
  }
}

export function snapshotStatus(repo: Repo, orgId: OrgId): OperationalStatus {
  const checkpoint = repo.getCheckpoint(orgId)
  const all = repo.listRawEmails(orgId)
  const materialized = all.filter((r) => r.state === 'materialized_ready').length
  const failed = all.filter((r) => r.state === 'failed').length
  const reviewNeeded = all.filter((r) => r.state === 'review_needed').length
  const reviewOpen = repo.listReviewItems(orgId, false).length
  return {
    orgId,
    checkpoint,
    counts: {
      rawEmails: all.length,
      materialized,
      failed,
      reviewNeeded,
      reviewOpen,
    },
  }
}
