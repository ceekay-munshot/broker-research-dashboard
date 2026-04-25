import { createHash } from 'node:crypto'
import type { OrgId } from '../../../src/domain'
import type { PipelineErrorCategory } from './errors'
import type { RawEmailArtifact, ReviewQueueItem } from './models'

/** Module-level review-queue store. In production, replace with a real
 *  durable store; in this repo it lives in memory next to the
 *  InMemoryStore for the same reasons. */
export class ReviewQueue {
  private items: ReviewQueueItem[] = []

  enqueue(
    orgId: OrgId,
    artifact: RawEmailArtifact,
    reasonCategory: PipelineErrorCategory,
    detail: string,
  ): ReviewQueueItem {
    const item: ReviewQueueItem = {
      id: deterministicId(`${artifact.envelope.messageId}:${reasonCategory}`),
      orgId,
      artifactId: artifact.id,
      reasonCategory,
      detail,
      enqueuedAt: new Date().toISOString(),
      snapshot: {
        subject: artifact.envelope.subject,
        senderAddress: artifact.envelope.from,
        attachmentNames: artifact.attachmentRefs.map((a) => a.filename),
        linkedUrls: artifact.linkedRefs.map((l) => l.url),
      },
    }
    // Idempotent enqueue — replace by id.
    const i = this.items.findIndex((x) => x.id === item.id)
    if (i >= 0) this.items[i] = item
    else this.items.push(item)
    return item
  }

  list(orgId?: OrgId): readonly ReviewQueueItem[] {
    return orgId ? this.items.filter((x) => x.orgId === orgId) : [...this.items]
  }

  clear(): void { this.items.length = 0 }
}

function deterministicId(seed: string): string {
  return `rev_${createHash('sha256').update(seed).digest('hex').slice(0, 12)}`
}
