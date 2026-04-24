import type { BrokerId, OrgId } from '../../../src/domain'
import { asBrokerId } from '../../../src/lib/ids'
import { organizations, brokers } from './organizations'

// Per-org allowlist controlling which inbound emails the ingestion pipeline
// admits. The rules are deterministic:
//   1. The recipient must equal the org's forwarding address.
//   2. Either the sender's domain OR the exact sender address must appear in
//      the org's allowlist AND resolve to an enabled broker.
//   3. If the email was forwarded, the last-hop forwarder must appear in
//      `allowedForwarders` (we admit only humans on the research team).
//
// Anything else gets rejected with an explicit reason. See
// server/src/ingestion/validateSender.ts for the check.

export interface OrgAllowlist {
  readonly orgId: OrgId
  readonly forwardingAddress: string
  /** Exact sender addresses admitted for this org. */
  readonly allowedSenderAddresses: readonly string[]
  /** Domain-level allowlist (lowercase, no `@`). Covers all mailboxes. */
  readonly allowedSenderDomains: readonly string[]
  /** Map from sender address or domain → resolved broker id. */
  readonly brokerBySender: ReadonlyMap<string, BrokerId>
  /** Addresses allowed to forward research mail into the org's Munshot inbox. */
  readonly allowedForwarders: readonly string[]
}

// ── Per-org allowed forwarders ────────────────────────────────────────
// Only the team members below can forward broker mail into the org inbox.
// Everything else is dropped. Values intentionally match the user rows the
// frontend seeds so the demo story is coherent.
const ALLOWED_FORWARDERS_BY_ORG: Readonly<Record<string, readonly string[]>> = {
  org_aranya: [
    'arjun.mehta@aranyacap.example',
    'kavita.iyer@aranyacap.example',
  ],
  org_sahyadri: [
    'nikhil.desai@sahyadri.example',
  ],
}

// ── Build allowlists from the enabled broker catalog ──────────────────

export const allowlists: readonly OrgAllowlist[] = organizations.map((org) => {
  const enabled = new Set<string>(org.enabledBrokerIds as readonly string[])
  const enabledBrokers = brokers.filter((b) => enabled.has(b.id as unknown as string))

  // Every enabled broker's sender domains become admissible for the org.
  const domainSet = new Set<string>()
  const brokerBySender = new Map<string, BrokerId>()
  for (const b of enabledBrokers) {
    for (const d of b.senderDomains) {
      const dom = d.toLowerCase()
      domainSet.add(dom)
      brokerBySender.set(dom, asBrokerId(b.id as unknown as string))
    }
  }

  return {
    orgId: org.id,
    forwardingAddress: org.forwardingAddress.toLowerCase(),
    allowedSenderAddresses: [],
    allowedSenderDomains: [...domainSet],
    brokerBySender,
    allowedForwarders: (ALLOWED_FORWARDERS_BY_ORG[org.id as unknown as string] ?? [])
      .map((a) => a.toLowerCase()),
  }
})

// ── Helper lookups ────────────────────────────────────────────────────

export function findAllowlistByRecipient(recipient: string): OrgAllowlist | null {
  const key = recipient.toLowerCase()
  return allowlists.find((a) => a.forwardingAddress === key) ?? null
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf('@')
  return at === -1 ? '' : address.slice(at + 1).toLowerCase()
}

export function resolveBrokerForSender(allowlist: OrgAllowlist, senderAddress: string): BrokerId | null {
  const lower = senderAddress.toLowerCase()
  // Prefer exact-address match, then domain.
  const byAddress = allowlist.brokerBySender.get(lower)
  if (byAddress) return byAddress
  const d = domainOf(lower)
  const byDomain = allowlist.brokerBySender.get(d)
  return byDomain ?? null
}
