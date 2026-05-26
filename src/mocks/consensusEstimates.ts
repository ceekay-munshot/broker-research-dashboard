// ─────────────────────────────────────────────────────────────────────────
// Per-broker KPI revisions vs the broker's prior comparable note.
//
// Consensus estimates moved out to mocks/brokerEstimates.ts (each broker
// carries their own KPI numbers; the view-model aggregates). Revisions
// follow the same per-broker model conceptually but are still hand-rolled
// here until the prior-comparable diff lands.
// ─────────────────────────────────────────────────────────────────────────

import type { RevisionEntry } from '../viewModels/stockStreetView'
import { asBrokerId } from '../lib/ids'

export const REVISIONS_BY_TICKER: Readonly<Record<string, readonly RevisionEntry[]>> = {
  KIMS: [
    {
      brokerId: asBrokerId('brk_ambit'),
      brokerShortName: 'Ambit',
      deltas: [
        { metric: 'Revenue', direction: 'up', pctText: '↑ +3%' },
        { metric: 'EBITDA', direction: 'up', pctText: '↑ +5%' },
        { metric: 'PAT', direction: 'up', pctText: '↑ +4%' },
      ],
    },
    {
      brokerId: asBrokerId('brk_kotak'),
      brokerShortName: 'Kotak',
      deltas: [
        { metric: 'Revenue', direction: 'down', pctText: '↓ −2%' },
        { metric: 'EBITDA', direction: 'down', pctText: '↓ −4%' },
        { metric: 'PAT', direction: 'down', pctText: '↓ −5%' },
      ],
    },
  ],
  APOLLOHOSP: [
    {
      brokerId: asBrokerId('brk_iifl'),
      brokerShortName: 'IIFL',
      deltas: [
        { metric: 'Revenue', direction: 'up', pctText: '↑ +2%' },
        { metric: 'EBITDA', direction: 'up', pctText: '↑ +1%' },
        { metric: 'PAT', direction: 'up', pctText: '↑ +3%' },
        { metric: 'EPS', direction: 'up', pctText: '↑ +3%' },
      ],
    },
  ],
  KOTAKBANK: [
    {
      brokerId: asBrokerId('brk_jmfin'),
      brokerShortName: 'JM Fin.',
      deltas: [
        { metric: 'NII', direction: 'unchanged', pctText: null },
        { metric: 'PAT', direction: 'up', pctText: '↑ +1%' },
        { metric: 'EPS', direction: 'up', pctText: '↑ +1%' },
      ],
    },
  ],
}
