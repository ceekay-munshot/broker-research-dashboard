import type { BrokerId, OrgId } from '../../../src/domain'
import type {
  InboundEmailFixture, IngestionRejection, IngestionRejectionReason,
} from '../types'
import {
  findAllowlistByRecipient, resolveBrokerForSender,
} from '../config/allowlist'

// Deterministic admission gate. Returns either the resolved (orgId, brokerId)
// that the downstream pipeline should attribute the email to, OR a structured
// rejection explaining exactly why the email is being dropped.
//
// Rules, in order:
//   1. RECIPIENT — recipient must equal some org's forwarding address. The
//      Munshot/Vimana mailbox resolves to exactly one org. Unknown recipients
//      are hard-rejected with UNKNOWN_RECIPIENT.
//   2. SENDER — envelope sender's exact address (or its domain) must appear
//      in that org's allowlist AND map to an enabled broker id. Otherwise
//      SENDER_NOT_ALLOWLISTED.
//   3. FORWARDER — if a forwarder is present, the last-hop forwarder must
//      appear in the org's allowedForwarders. This is how we stop random
//      aliases from piping mail into a tenant's inbox.
export type ValidationResult =
  | { readonly ok: true;  readonly orgId: OrgId; readonly brokerId: BrokerId }
  | { readonly ok: false; readonly rejection: IngestionRejection }

export function validateSender(fixture: InboundEmailFixture): ValidationResult {
  // 1. Recipient must resolve to an org.
  const allowlist = findAllowlistByRecipient(fixture.recipient)
  if (!allowlist) {
    return reject(fixture, null, 'UNKNOWN_RECIPIENT',
      `recipient ${fixture.recipient} does not match any org forwarding address`)
  }

  // 2. Sender address or domain must be allowlisted AND resolve to a broker.
  const brokerId = resolveBrokerForSender(allowlist, fixture.envelopeSender)
  if (!brokerId) {
    return reject(fixture, allowlist.orgId, 'SENDER_NOT_ALLOWLISTED',
      `sender ${fixture.envelopeSender} not in allowlist for ${allowlist.orgId}`)
  }

  // 3. If forwarded, last-hop forwarder must be an allowed forwarder.
  if (fixture.forwardedBy.length > 0) {
    const lastHop = fixture.forwardedBy[fixture.forwardedBy.length - 1]!.toLowerCase()
    if (!allowlist.allowedForwarders.includes(lastHop)) {
      return reject(fixture, allowlist.orgId, 'FORWARDER_NOT_ALLOWED',
        `forwarder ${lastHop} not allowed for ${allowlist.orgId}`)
    }
  }

  return { ok: true, orgId: allowlist.orgId, brokerId }
}

function reject(
  fixture: InboundEmailFixture,
  orgId: OrgId | null,
  reason: IngestionRejectionReason,
  detail: string,
): ValidationResult {
  return {
    ok: false,
    rejection: {
      messageId: fixture.messageId,
      envelopeSender: fixture.envelopeSender,
      recipient: fixture.recipient,
      reason,
      detail,
      receivedAt: fixture.receivedAt,
      orgId,
    },
  }
}
