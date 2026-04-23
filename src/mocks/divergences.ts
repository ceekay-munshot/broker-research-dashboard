import type { DivergenceCase } from '../domain'
import {
  asOrgId, asBrokerId, asDivergenceId, asEvidenceId, asTicker,
} from '../lib/ids'

// Phase 2 placeholder data. Four named cases for Acme where the Street
// materially disagrees. `aiConclusion` is left null until the ARB-closure
// logic ships; `conflicts[].evidenceIds` already point into the existing
// evidence-snippet fixture so the UI can render a citation trail without
// waiting on Phase 2.
export const divergenceCases: readonly DivergenceCase[] = [
  {
    id: asDivergenceId('div_0001'),
    orgId: asOrgId('org_acme'),
    ticker: asTicker('TSLA'),
    spreadPct: 106.06,
    highBrokerId: asBrokerId('brk_jef'),
    lowBrokerId:  asBrokerId('brk_nmr'),
    highTargetPrice: 340,
    lowTargetPrice:  165,
    conflicts: [
      {
        topic: 'Auto margin trajectory',
        bullThesis: 'Operating leverage reasserts as the price war eases into 2H26, with auto GM recovering above 20%.',
        bearThesis: 'Structural OEM competition has reset the auto gross margin floor below 17% and further compression is possible.',
        bullBrokerIds: [asBrokerId('brk_jef')],
        bearBrokerIds: [asBrokerId('brk_nmr'), asBrokerId('brk_jpm')],
        evidenceIds:   [asEvidenceId('ev_0049'), asEvidenceId('ev_0061'), asEvidenceId('ev_0027')],
      },
      {
        topic: 'Robotaxi monetization',
        bullThesis: 'Option value not yet priced by the Street — credible first-city launch in H2 26.',
        bearThesis: 'Regulatory path unresolved in every major US metro; monetization timeline is speculative.',
        bullBrokerIds: [asBrokerId('brk_jef')],
        bearBrokerIds: [asBrokerId('brk_jpm')],
        evidenceIds:   [asEvidenceId('ev_0050'), asEvidenceId('ev_0025')],
      },
      {
        topic: 'Energy storage',
        bullThesis: 'Megapack backlog converts to >30% GM contribution by 2027.',
        bearThesis: 'Utility-scale bid pressure from CATL/BYD erodes margin expectations.',
        bullBrokerIds: [asBrokerId('brk_jef')],
        bearBrokerIds: [],
        evidenceIds:   [asEvidenceId('ev_0051')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0002'),
    orgId: asOrgId('org_acme'),
    ticker: asTicker('NVDA'),
    spreadPct: 43.48,
    highBrokerId: asBrokerId('brk_gs'),
    lowBrokerId:  asBrokerId('brk_ubs'),
    highTargetPrice: 1320,
    lowTargetPrice:   920,
    conflicts: [
      {
        topic: 'Hyperscaler capex',
        bullThesis: 'Top-4 hyperscaler FY26 capex guidance implies ~22% y/y growth, sustained into 2027.',
        bearThesis: 'Digestion phase likely in 2H26 as the deployed fleet ramps utilization.',
        bullBrokerIds: [asBrokerId('brk_gs')],
        bearBrokerIds: [asBrokerId('brk_ubs')],
        evidenceIds:   [asEvidenceId('ev_0003'), asEvidenceId('ev_0041')],
      },
      {
        topic: 'Custom silicon risk',
        bullThesis: 'CUDA lock-in and the software stack protect share through 2027.',
        bearThesis: 'TPU v6 and MTIA ramps begin to displace >15% of training workloads from 2H.',
        bullBrokerIds: [asBrokerId('brk_gs')],
        bearBrokerIds: [asBrokerId('brk_ubs')],
        evidenceIds:   [asEvidenceId('ev_0042')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0003'),
    orgId: asOrgId('org_acme'),
    ticker: asTicker('XOM'),
    spreadPct: 37.76,
    highBrokerId: asBrokerId('brk_gs'),
    lowBrokerId:  asBrokerId('brk_barc'),
    highTargetPrice: 135,
    lowTargetPrice:   98,
    conflicts: [
      {
        topic: 'Brent deck 2026–27',
        bullThesis: 'Long-dated $85/bbl supported by OPEC+ discipline and shale exit rates.',
        bearThesis: '$72/bbl mid-cycle as non-OPEC supply accelerates into a soft demand print.',
        bullBrokerIds: [asBrokerId('brk_gs')],
        bearBrokerIds: [asBrokerId('brk_barc')],
        evidenceIds:   [asEvidenceId('ev_0004'), asEvidenceId('ev_0058')],
      },
      {
        topic: 'Guyana cash return',
        bullThesis: 'FCF yield >10% at strip supports accelerated buyback through 2027.',
        bearThesis: 'Capex creep in Stabroek Phase 6+ reduces distributable FCF.',
        bullBrokerIds: [asBrokerId('brk_gs')],
        bearBrokerIds: [asBrokerId('brk_barc')],
        evidenceIds:   [asEvidenceId('ev_0006')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0004'),
    orgId: asOrgId('org_acme'),
    ticker: asTicker('GOOGL'),
    spreadPct: 29.41,
    highBrokerId: asBrokerId('brk_citi'),
    lowBrokerId:  asBrokerId('brk_ubs'),
    highTargetPrice: 220,
    lowTargetPrice:  170,
    conflicts: [
      {
        topic: 'Query volume',
        bullThesis: 'Gemini integration is defending query counts and commercial intent remains intact.',
        bearThesis: 'AI answer engines eroding the high-CPC query mix at a faster annualized pace.',
        bullBrokerIds: [asBrokerId('brk_citi')],
        bearBrokerIds: [asBrokerId('brk_ubs')],
        evidenceIds:   [asEvidenceId('ev_0036'), asEvidenceId('ev_0045')],
      },
      {
        topic: 'Regulatory',
        bullThesis: 'DOJ remedy path leaves core distribution economics intact.',
        bearThesis: 'Forced divestiture of default-search agreements compresses TAC leverage.',
        bullBrokerIds: [asBrokerId('brk_citi')],
        bearBrokerIds: [asBrokerId('brk_ubs')],
        evidenceIds:   [asEvidenceId('ev_0044')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
]
