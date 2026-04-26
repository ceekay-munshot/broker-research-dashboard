// ─────────────────────────────────────────────────────────────────────────
// Suppression — fingerprint + window-based dedup.
//
// The scheduler computes a fingerprint per rendered payload. Before each
// (target, payload) attempt, the dispatcher consults the Repo:
//
//   - if a non-expired record exists for (org, contentKind, targetId,
//     fingerprint) → suppress this attempt
//   - otherwise: send + record a new suppression with the template's
//     suppressionTtlSeconds expiry
//
// Suppression survives across processes because it lives in the Repo.
// ─────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import type {
  OrgId, DeliveryChannel, DeliveryContentKind, DeliveryPayload, DeliveryTargetId,
} from '../../../src/domain'
import { asSuppressionId } from '../../../src/lib/ids'
import type { Repo } from '../persistence'

/** Stable fingerprint over the parts of a payload that meaningfully change.
 *  We hash only the human-meaningful fields — never timestamps. */
export function fingerprintPayload(payload: Pick<DeliveryPayload, 'subject' | 'text' | 'contentKind'>): string {
  const h = createHash('sha256')
  h.update(payload.contentKind)
  h.update('::')
  h.update(payload.subject)
  h.update('::')
  h.update(payload.text)
  return h.digest('hex').slice(0, 32)
}

export interface ShouldSuppressInput {
  readonly orgId: OrgId
  readonly contentKind: DeliveryContentKind
  readonly channel: DeliveryChannel
  readonly targetId: DeliveryTargetId
  readonly fingerprint: string
}

/** Returns true when an active suppression matches and we should skip. */
export function shouldSuppress(repo: Repo, input: ShouldSuppressInput): boolean {
  const existing = repo.findDeliverySuppression(input.orgId, {
    contentKind: input.contentKind,
    targetId: input.targetId,
    fingerprint: input.fingerprint,
  })
  return existing !== null
}

/** Persist a new suppression after a successful send. */
export function recordSuppression(repo: Repo, args: {
  orgId: OrgId
  contentKind: DeliveryContentKind
  channel: DeliveryChannel
  targetId: DeliveryTargetId
  fingerprint: string
  ttlSeconds: number
  now: Date
  reason?: 'fingerprint_match' | 'manual' | 'rate_limit'
}): void {
  const suppressedAt = args.now.toISOString()
  const expiresAt = new Date(args.now.getTime() + args.ttlSeconds * 1000).toISOString()
  repo.upsertDeliverySuppression({
    id: asSuppressionId(`sup_${args.fingerprint.slice(0, 12)}_${args.targetId as unknown as string}`),
    orgId: args.orgId,
    contentKind: args.contentKind,
    channel: args.channel,
    targetId: args.targetId,
    fingerprint: args.fingerprint,
    suppressedAt,
    expiresAt,
    reason: args.reason ?? 'fingerprint_match',
  })
}
