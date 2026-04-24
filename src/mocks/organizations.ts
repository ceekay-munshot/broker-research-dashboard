import type { Organization } from '../domain'
import { asOrgId, asBrokerId } from '../lib/ids'

// Indian AMCs with per-org broker subscriptions. The adapter filters every
// read by orgId so tenancy is enforced at the edge. Aranya + Sahyadri are
// synthetic fixtures for the mock adapter; Vimana is the real tenant whose
// forwarding address (vimana@vimanacapital.com) receives the broker .eml
// samples we ingest in server/fixtures/eml/.
export const organizations: readonly Organization[] = [
  {
    id: asOrgId('org_aranya'),
    name: 'Aranya Capital Partners',
    shortName: 'Aranya',
    forwardingAddress: 'research@aranyacap.munshot.io',
    createdAt: '2025-09-14T10:00:00.000Z',
    enabledBrokerIds: [
      asBrokerId('brk_kotak'), asBrokerId('brk_mosl'), asBrokerId('brk_icici'),
      asBrokerId('brk_hdfc'),  asBrokerId('brk_axis'), asBrokerId('brk_nuvama'),
      asBrokerId('brk_ambit'), asBrokerId('brk_jmfin'), asBrokerId('brk_iifl'),
      asBrokerId('brk_plilladher'),
    ],
    timeZone: 'Asia/Kolkata',
    defaultCurrency: 'INR',
  },
  {
    id: asOrgId('org_sahyadri'),
    name: 'Sahyadri Investment Management',
    shortName: 'Sahyadri',
    forwardingAddress: 'desk@sahyadri.vimana.app',
    createdAt: '2026-01-08T10:00:00.000Z',
    enabledBrokerIds: [
      asBrokerId('brk_kotak'), asBrokerId('brk_mosl'), asBrokerId('brk_icici'),
      asBrokerId('brk_nuvama'), asBrokerId('brk_ambit'),
    ],
    timeZone: 'Asia/Kolkata',
    defaultCurrency: 'INR',
  },
  {
    id: asOrgId('org_vimana'),
    name: 'Vimana Capital Management LLP',
    shortName: 'Vimana',
    forwardingAddress: 'vimana@vimanacapital.com',
    createdAt: '2025-11-01T10:00:00.000Z',
    enabledBrokerIds: [
      asBrokerId('brk_kotak'), asBrokerId('brk_jmfin'), asBrokerId('brk_iifl'),
    ],
    timeZone: 'Asia/Kolkata',
    defaultCurrency: 'INR',
  },
]

// Convenience handles for consumers.
export const DEFAULT_ORG_ID = organizations[0]!.id
export const SECONDARY_ORG_ID = organizations[1]!.id
export const VIMANA_ORG_ID = organizations[2]!.id
