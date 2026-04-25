import type { BrokerId, OrgId } from '../../../../src/domain'
import { findAllowlistByRecipient, resolveBrokerForSender } from '../../config/allowlist'

export interface ResolvedBroker {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
}

/** Resolve `(orgId, brokerId)` from the email envelope, deterministically.
 *
 *   1. Recipient is matched against the org-allowlist (forwarding addresses).
 *   2. The sender domain or address is matched to one of that org's enabled
 *      brokers.
 *
 *  Returns null when either step fails. The caller decides whether to send
 *  to the review queue or drop the artifact entirely. */
export function resolveBroker(
  recipient: string,
  senderAddress: string,
): ResolvedBroker | null {
  const allowlist = findAllowlistByRecipient(recipient)
  if (!allowlist) return null
  const brokerId = resolveBrokerForSender(allowlist, senderAddress)
  if (!brokerId) return null
  return { orgId: allowlist.orgId, brokerId }
}
