import type { DivergenceCase } from '../domain'
import {
  asOrgId, asBrokerId, asDivergenceId, asEvidenceId, asTicker,
} from '../lib/ids'

// Phase 2 placeholder data. Four named cases for Aranya where the Street
// materially disagrees. `aiConclusion` is left null until the ARB-closure
// logic ships; `conflicts[].evidenceIds` already point into the existing
// evidence-snippet fixture so the UI can render a citation trail without
// waiting on Phase 2.
export const divergenceCases: readonly DivergenceCase[] = [
  {
    id: asDivergenceId('div_0001'),
    orgId: asOrgId('org_aranya'),
    ticker: asTicker('TATAMOTORS'),
    spreadPct: 50.00,
    highBrokerId: asBrokerId('brk_ambit'),
    lowBrokerId:  asBrokerId('brk_icici'),
    highTargetPrice: 1080,
    lowTargetPrice:   720,
    conflicts: [
      {
        topic: 'JLR margin trajectory',
        bullThesis: 'Range Rover BEV launch and premium product cycle drives JLR EBIT margin recovery above 8% into FY27.',
        bearThesis: 'JLR EBIT margin reset structurally below 7% as Chinese BEV entrants disrupt premium pricing in UK and EU.',
        bullBrokerIds: [asBrokerId('brk_ambit')],
        bearBrokerIds: [asBrokerId('brk_icici')],
        evidenceIds:   [asEvidenceId('ev_0055'), asEvidenceId('ev_0025'), asEvidenceId('ev_0026')],
      },
      {
        topic: 'India PV market share',
        bullThesis: 'India PV share gains across Harrier/Safari/Nexon EV sustain into FY27 as CV cycle bottoms.',
        bearThesis: 'India PV cycle decelerating into FY27 while CV cycle rolls over on high base effect.',
        bullBrokerIds: [asBrokerId('brk_ambit')],
        bearBrokerIds: [asBrokerId('brk_icici')],
        evidenceIds:   [asEvidenceId('ev_0057'), asEvidenceId('ev_0027')],
      },
      {
        topic: 'Net auto debt',
        bullThesis: 'Free cash flow supports accelerated deleveraging — net auto debt zero by FY27 exit.',
        bearThesis: 'Capex intensity rising with BEV platform investment delays deleveraging path.',
        bullBrokerIds: [asBrokerId('brk_ambit')],
        bearBrokerIds: [],
        evidenceIds:   [asEvidenceId('ev_0056')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0002'),
    orgId: asOrgId('org_aranya'),
    ticker: asTicker('TCS'),
    spreadPct: 41.18,
    highBrokerId: asBrokerId('brk_kotak'),
    lowBrokerId:  asBrokerId('brk_nuvama'),
    highTargetPrice: 4800,
    lowTargetPrice:  3400,
    conflicts: [
      {
        topic: 'Discretionary spend trajectory',
        bullThesis: 'Discretionary spend stabilising across BFSI and hi-tech; deal TCV supports FY27 revenue inflection.',
        bearThesis: 'Deal deferrals accelerating in BFSI and hi-tech; utilization leverage exhausted heading into FY27.',
        bullBrokerIds: [asBrokerId('brk_kotak')],
        bearBrokerIds: [asBrokerId('brk_nuvama')],
        evidenceIds:   [asEvidenceId('ev_0010'), asEvidenceId('ev_0040'), asEvidenceId('ev_0041')],
      },
      {
        topic: 'GenAI monetisation',
        bullThesis: 'GenAI attach rate ~22% of new deals with margin-accretive pricing.',
        bearThesis: 'GenAI largely bundled into existing deals; incremental revenue not yet visible.',
        bullBrokerIds: [asBrokerId('brk_kotak')],
        bearBrokerIds: [asBrokerId('brk_nuvama')],
        evidenceIds:   [asEvidenceId('ev_0011')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0003'),
    orgId: asOrgId('org_aranya'),
    ticker: asTicker('ONGC'),
    spreadPct: 38.78,
    highBrokerId: asBrokerId('brk_kotak'),
    lowBrokerId:  asBrokerId('brk_jmfin'),
    highTargetPrice: 340,
    lowTargetPrice:  245,
    conflicts: [
      {
        topic: 'Brent deck FY27–28',
        bullThesis: 'Long-dated $80/bbl supported by OPEC+ discipline and decelerating non-OPEC supply.',
        bearThesis: '$68/bbl mid-cycle as non-OPEC supply surprises to the upside into FY28.',
        bullBrokerIds: [asBrokerId('brk_kotak')],
        bearBrokerIds: [asBrokerId('brk_jmfin')],
        evidenceIds:   [asEvidenceId('ev_0004'), asEvidenceId('ev_0058')],
      },
      {
        topic: 'Gas pricing',
        bullThesis: 'APM gas pricing floor provides FCF cushion through FY27.',
        bearThesis: 'Administered price cap limits gas upside even at firmer crude.',
        bullBrokerIds: [asBrokerId('brk_kotak')],
        bearBrokerIds: [asBrokerId('brk_jmfin')],
        evidenceIds:   [asEvidenceId('ev_0005'), asEvidenceId('ev_0060')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
  {
    id: asDivergenceId('div_0004'),
    orgId: asOrgId('org_aranya'),
    ticker: asTicker('ICICIBANK'),
    spreadPct: 38.18,
    highBrokerId: asBrokerId('brk_axis'),
    lowBrokerId:  asBrokerId('brk_nuvama'),
    highTargetPrice: 1520,
    lowTargetPrice:  1100,
    conflicts: [
      {
        topic: 'Unsecured credit quality',
        bullThesis: 'Net slippage at multi-year low; unsecured book resilient through current cycle.',
        bearThesis: 'Personal loan slippage ticking up in 4QFY26; microfinance portfolio at-risk rising.',
        bullBrokerIds: [asBrokerId('brk_axis')],
        bearBrokerIds: [asBrokerId('brk_nuvama')],
        evidenceIds:   [asEvidenceId('ev_0035'), asEvidenceId('ev_0043'), asEvidenceId('ev_0044')],
      },
      {
        topic: 'RoA trajectory',
        bullThesis: 'RoA sustaining above 2.3% through FY27 on NII strength and benign credit costs.',
        bearThesis: 'RoA compression likely as credit costs normalise and deposit competition intensifies.',
        bullBrokerIds: [asBrokerId('brk_axis')],
        bearBrokerIds: [asBrokerId('brk_nuvama')],
        evidenceIds:   [asEvidenceId('ev_0036')],
      },
    ],
    aiConclusion: null,
    generatedAt: null,
    resolvedAt: null,
  },
]
