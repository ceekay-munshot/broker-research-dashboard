import type { Organization } from '../domain'
import { asOrgId, asBrokerId } from '../lib/ids'

// Two organizations with disjoint broker subscriptions. The Module-2 adapter
// filters every read by orgId so the UI built on top can be verified to
// actually respect the tenant boundary.
export const organizations: readonly Organization[] = [
  {
    id: asOrgId('org_acme'),
    name: 'Acme Capital Management',
    shortName: 'Acme',
    forwardingAddress: 'research@acme.munshot.io',
    createdAt: '2025-09-14T10:00:00.000Z',
    enabledBrokerIds: [
      asBrokerId('brk_gs'), asBrokerId('brk_ms'), asBrokerId('brk_jpm'),
      asBrokerId('brk_baml'), asBrokerId('brk_citi'), asBrokerId('brk_ubs'),
      asBrokerId('brk_jef'), asBrokerId('brk_nmr'), asBrokerId('brk_barc'),
      asBrokerId('brk_wf'),
    ],
    timeZone: 'America/New_York',
    defaultCurrency: 'USD',
  },
  {
    id: asOrgId('org_northstar'),
    name: 'Northstar Partners',
    shortName: 'Northstar',
    forwardingAddress: 'desk@northstar.vimana.app',
    createdAt: '2026-01-08T10:00:00.000Z',
    enabledBrokerIds: [
      asBrokerId('brk_gs'), asBrokerId('brk_ms'), asBrokerId('brk_jpm'),
      asBrokerId('brk_ubs'), asBrokerId('brk_jef'),
    ],
    timeZone: 'Europe/London',
    defaultCurrency: 'USD',
  },
]

// Convenience handles for consumers.
export const DEFAULT_ORG_ID = organizations[0]!.id
export const SECONDARY_ORG_ID = organizations[1]!.id
