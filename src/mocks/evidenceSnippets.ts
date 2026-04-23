import type { EvidenceSnippet, EvidenceSupportingField } from '../domain'
import {
  asOrgId, asEvidenceId, asReportId, asSummaryId, asAttachmentId,
} from '../lib/ids'

// Three snippets per summary, in deterministic order:
//   [0] the thesis quote  (supportingField='thesis', fieldRef='')
//   [1] keyPoints[0]      (supportingField='keyPoint', fieldRef='0')
//   [2] keyPoints[1]      (supportingField='keyPoint', fieldRef='1')
//
// Bounding boxes are omitted for brevity here — the real adapter will fill
// them from the PDF parser. A representative sample is included on the first
// few snippets to keep the type exercised.

export const evidenceSnippets: readonly EvidenceSnippet[] = [
  // sum_0001 — GS NVDA bullish
  e('ev_0001','sum_0001','rpt_0001','att_0001', 2, 'thesis',   '', 'We raise our 12-month price target to $1,320 (from $1,240) driven by an earlier-than-modeled Blackwell Ultra ramp and sustained hyperscaler capex commitments.', [72, 544, 486, 592]),
  e('ev_0002','sum_0001','rpt_0001','att_0001', 5, 'keyPoint', '0','Supply-side checks indicate Blackwell Ultra shipments are tracking approximately six weeks ahead of the baseline ramp schedule we set at initiation.'),
  e('ev_0003','sum_0001','rpt_0001','att_0001', 9, 'keyPoint', '1','Aggregate FY2026 capex guidance from the top four hyperscalers implies ~22% year-over-year growth, with recent commentary supporting sustained datacenter infrastructure build-out.'),

  // sum_0002 — GS XOM bullish
  e('ev_0004','sum_0002','rpt_0002','att_0002', 3, 'thesis',   '', 'We reiterate Buy and raise our PT to $135. Stabroek phases 4-6 deliver a step-up in free cash flow through 2027 that the market is under-modeling.', [60, 512, 498, 566]),
  e('ev_0005','sum_0002','rpt_0002','att_0002', 7, 'keyPoint', '0','Guyana net production reaches approximately 900 thousand barrels per day by 2026 year-end on the current development schedule.'),
  e('ev_0006','sum_0002','rpt_0002','att_0002',11, 'keyPoint', '1','At an $85/bbl Brent strip assumption the consolidated FCF yield exceeds 10%, supporting accelerated capital returns through 2027.'),

  // sum_0003 — GS META bullish
  e('ev_0007','sum_0003','rpt_0003','att_0003', 2, 'thesis',   '', 'We lift our 12-month PT to $680. Reels price-per-impression is closing the gap to feed at an accelerated pace, with advertiser adoption at record levels.'),
  e('ev_0008','sum_0003','rpt_0003','att_0003', 4, 'keyPoint', '0','Reels CPM now sits at roughly 80% of core feed CPM and has been closing at about six percentage points per year.'),
  e('ev_0009','sum_0003','rpt_0003','att_0003', 8, 'keyPoint', '1','Ad-supported video time accounts for approximately 30% of daily MAU time on the platform, a 9% year-over-year lift.'),

  // sum_0004 — GS AMZN bullish
  e('ev_0010','sum_0004','rpt_0004','att_0004', 2, 'thesis',   '', 'We see AWS growth reaccelerating into 2H alongside retail segment operating margin expansion of approximately 90 basis points year-over-year.'),
  e('ev_0011','sum_0004','rpt_0004','att_0004', 5, 'keyPoint', '0','AWS constant-currency growth accelerates to approximately 20% in the second half of 2026 on our updated forecast.'),
  e('ev_0012','sum_0004','rpt_0004','att_0004',10, 'keyPoint', '1','Advertising revenue grew 24% year-over-year in Q4 and remains a structurally higher-margin contributor to the retail segment.'),

  // sum_0005 — MS MSFT bullish
  e('ev_0013','sum_0005','rpt_0005','att_0005', 2, 'thesis',   '', 'Azure constant-currency growth is sustaining at +32% with AI attach rate running meaningfully ahead of our prior model.'),
  e('ev_0014','sum_0005','rpt_0005','att_0005', 6, 'keyPoint', '0','Azure constant-currency growth tracked plus thirty-two percent year-over-year exiting the December quarter.'),
  e('ev_0015','sum_0005','rpt_0005','att_0005',12, 'keyPoint', '1','AI workload attach on Azure exceeds our prior modeling, with per-workload revenue intensity running thirty percent above the legacy compute baseline.'),

  // sum_0006 — MS LLY bullish
  e('ev_0016','sum_0006','rpt_0006','att_0006', 3, 'thesis',   '', 'We raise our long-term GLP-1 TAM estimate to approximately $150B by 2030 and lift PT to $860 on cardio label optionality.'),
  e('ev_0017','sum_0006','rpt_0006','att_0006', 8, 'keyPoint', '0','Our revised bottom-up GLP-1 TAM reaches $150B by 2030, approximately 30% above consensus assumptions.'),
  e('ev_0018','sum_0006','rpt_0006','att_0006',14, 'keyPoint', '1','Cardio outcomes label filing is tracking for the first half of 2026 based on current trial timelines.'),

  // sum_0007 — MS CAT bullish
  e('ev_0019','sum_0007','rpt_0007','att_0007', 2, 'thesis',   '', 'Services backlog has reached record highs and late-cycle dynamics remain favorable; we raise numbers.'),
  e('ev_0020','sum_0007','rpt_0007','att_0007', 5, 'keyPoint', '0','Services backlog sits at an all-time high, up 14% year-over-year with balanced regional composition.'),
  e('ev_0021','sum_0007','rpt_0007','att_0007', 8, 'keyPoint', '1','Dealer inventory levels have normalized below our prior guidance, reducing de-stocking headwinds into 2H.'),

  // sum_0008 — JPM AAPL neutral
  e('ev_0022','sum_0008','rpt_0008','att_0008', 2, 'thesis',   '', 'We move AAPL to Neutral; the modest iPhone 17 upgrade cycle is insufficient to drive positive EPS revisions.'),
  e('ev_0023','sum_0008','rpt_0008','att_0008', 5, 'keyPoint', '0','iPhone 17 blended ASP growth is limited to low single digits in our updated model.'),
  e('ev_0024','sum_0008','rpt_0008','att_0008', 9, 'keyPoint', '1','China demand is normalizing but is not reaccelerating on the forward trajectory; we model flat year-over-year units.'),

  // sum_0009 — JPM TSLA bearish
  e('ev_0025','sum_0009','rpt_0009','att_0009', 2, 'thesis',   '', 'We reiterate Underweight. Delivery growth is decelerating and valuation remains disconnected from the fundamental trajectory.'),
  e('ev_0026','sum_0009','rpt_0009','att_0009', 4, 'keyPoint', '0','Deliveries are decelerating to low single digit year-over-year growth on our forecast, well below the consensus growth rate.'),
  e('ev_0027','sum_0009','rpt_0009','att_0009', 7, 'keyPoint', '1','Auto gross margin floor has reset below 18% and we see limited scope for near-term recovery.'),

  // sum_0010 — BofA AAPL bullish
  e('ev_0028','sum_0010','rpt_0010','att_0010', 3, 'thesis',   '', 'Services ARR is tracking approximately 14% y/y and AI features are accelerating the iPhone replacement cycle; reiterate Buy.'),
  e('ev_0029','sum_0010','rpt_0010','att_0010', 6, 'keyPoint', '0','Services ARR growth is running at plus fourteen percent year-over-year based on our channel analysis.'),
  e('ev_0030','sum_0010','rpt_0010','att_0010',10, 'keyPoint', '1','Installed-base refresh cadence is shortening by approximately three quarters on the AI feature cycle.'),

  // sum_0011 — BofA NVDA neutral
  e('ev_0031','sum_0011','rpt_0011','att_0011', 2, 'thesis',   '', 'The near-term setup is balanced; multiple expansion from here looks limited. We move to Neutral with PT of $1,080.'),
  e('ev_0032','sum_0011','rpt_0011','att_0011', 4, 'keyPoint', '0','Risk/reward is balanced at the current multiple, with upside and downside scenarios of similar magnitude.'),
  e('ev_0033','sum_0011','rpt_0011','att_0011', 8, 'keyPoint', '1','The AI capex digestion question remains unresolved into the back half of 2026.'),

  // sum_0012 — Citi GOOGL bullish
  e('ev_0034','sum_0012','rpt_0012','att_0012', 2, 'thesis',   '', 'Search volume is proving resilient despite the AI overhang, supported by Gemini integration defending commercial-intent queries.'),
  e('ev_0035','sum_0012','rpt_0012','att_0012', 6, 'keyPoint', '0','The mix of commercial-intent queries remains stable year-over-year despite broader AI-driven substitution concerns.'),
  e('ev_0036','sum_0012','rpt_0012','att_0012',11, 'keyPoint', '1','Gemini integration is driving incremental session engagement on both consumer and search surfaces.'),

  // sum_0013 — Citi LLY neutral
  e('ev_0037','sum_0013','rpt_0013','att_0013', 2, 'thesis',   '', 'GLP-1 competitive intensity is rising into year-end; we remain cautious on the near-term setup.'),
  e('ev_0038','sum_0013','rpt_0013','att_0013', 5, 'keyPoint', '0','Novo competitive pricing pressure continues to intensify in both US and EU markets.'),
  e('ev_0039','sum_0013','rpt_0013','att_0013', 9, 'keyPoint', '1','Capacity constraints in GLP-1 manufacturing have largely alleviated, removing a prior tailwind to pricing discipline.'),

  // sum_0014 — UBS NVDA bearish
  e('ev_0040','sum_0014','rpt_0014','att_0014', 2, 'thesis',   '', 'We downgrade NVDA to Underweight. Hyperscaler capex digestion is becoming visible and sovereign order momentum is slippable.'),
  e('ev_0041','sum_0014','rpt_0014','att_0014', 4, 'keyPoint', '0','A digestion phase is likely in 2H 2026 as the deployed fleet ramps utilization across the top hyperscalers.'),
  e('ev_0042','sum_0014','rpt_0014','att_0014', 7, 'keyPoint', '1','Custom silicon ramps at the top two hyperscalers are accelerating and will begin to displace GPU workloads more meaningfully from 2H.'),

  // sum_0015 — UBS GOOGL bearish
  e('ev_0043','sum_0015','rpt_0015','att_0015', 3, 'thesis',   '', 'DOJ remedy uncertainty limits multiple expansion; we downgrade to Underweight with PT $170.'),
  e('ev_0044','sum_0015','rpt_0015','att_0015', 8, 'keyPoint', '0','A forced divestiture of default search agreements remains within the plausible remedy set.'),
  e('ev_0045','sum_0015','rpt_0015','att_0015',13, 'keyPoint', '1','AI answer engines are eroding the high-CPC query mix at a faster annualized pace than we previously modeled.'),

  // sum_0016 — UBS AMZN neutral
  e('ev_0046','sum_0016','rpt_0016','att_0016', 2, 'thesis',   '', 'Retail margin cadence is in line with our model; we maintain Neutral on a balanced setup.'),
  e('ev_0047','sum_0016','rpt_0016','att_0016', 5, 'keyPoint', '0','Retail operating margin cadence is tracking in line with our base case forecast.'),
  e('ev_0048','sum_0016','rpt_0016','att_0016', 8, 'keyPoint', '1','AWS reacceleration appears already priced into the current multiple.'),

  // sum_0017 — JEF TSLA bullish
  e('ev_0049','sum_0017','rpt_0017','att_0017', 3, 'thesis',   '', 'Robotaxi launch path is credible for H2 26 and the optionality remains mispriced. We raise PT to $340.'),
  e('ev_0050','sum_0017','rpt_0017','att_0017', 8, 'keyPoint', '0','The Robotaxi platform is ready for pilot cities in the second half of 2026 based on current testing milestones.'),
  e('ev_0051','sum_0017','rpt_0017','att_0017',14, 'keyPoint', '1','Energy storage gross margin exceeds 30% in our 2027 model driven by Megapack backlog conversion.'),

  // sum_0018 — JEF MSFT bullish
  e('ev_0052','sum_0018','rpt_0018','att_0018', 2, 'thesis',   '', 'Copilot attach rate is materially exceeding our prior forecast; raising PT to $505 on monetization trajectory.'),
  e('ev_0053','sum_0018','rpt_0018','att_0018', 5, 'keyPoint', '0','Copilot attach rate on commercial seats is running at approximately twice our prior baseline.'),
  e('ev_0054','sum_0018','rpt_0018','att_0018', 9, 'keyPoint', '1','Revenue per M365 seat has increased 18% year-over-year on Copilot-driven mix enrichment.'),

  // sum_0019 — JEF AMZN bullish
  e('ev_0055','sum_0019','rpt_0019','att_0019', 2, 'thesis',   '', 'AWS growth reacceleration paired with advertising contribution supports continued upside; we raise PT to $240.'),
  e('ev_0056','sum_0019','rpt_0019','att_0019', 5, 'keyPoint', '0','AWS reacceleration is visible by Q3 on our revenue trajectory, driven by AI workload onboarding.'),
  e('ev_0057','sum_0019','rpt_0019','att_0019', 9, 'keyPoint', '1','Advertising revenue growth is running at plus twenty percent or higher on a sustained basis.'),

  // sum_0020 — BARC XOM bearish
  e('ev_0058','sum_0020','rpt_0020','att_0020', 2, 'thesis',   '', 'We cut our Brent mid-cycle deck to $72 per barrel; downside to FCF persists through 2027.'),
  e('ev_0059','sum_0020','rpt_0020','att_0020', 6, 'keyPoint', '0','Non-OPEC supply additions contribute approximately 1.8 million barrels per day through 2026 on our forecast.'),
  e('ev_0060','sum_0020','rpt_0020','att_0020',11, 'keyPoint', '1','Refining margins compress as Asian refining capacity ramps through year-end.'),

  // sum_0021 — NMR TSLA bearish
  e('ev_0061','sum_0021','rpt_0021','att_0021', 2, 'thesis',   '', 'We downgrade to Sell. The auto margin reset is structural, not cyclical, and the price war is unlikely to abate before Q3.'),
  e('ev_0062','sum_0021','rpt_0021','att_0021', 4, 'keyPoint', '0','Auto gross margin floor has reset below 17% in our base case and our bear case implies further compression.'),
  e('ev_0063','sum_0021','rpt_0021','att_0021', 7, 'keyPoint', '1','China BEV pricing pressure is structural given the competitive intensity from domestic OEMs.'),

  // sum_0022 — WF JPM bullish
  e('ev_0064','sum_0022','rpt_0022','att_0022', 2, 'thesis',   '', 'Net interest income is set to trough in Q2 and the deposit beta inflection begins in the second half.'),
  e('ev_0065','sum_0022','rpt_0022','att_0022', 5, 'keyPoint', '0','NII is troughing in Q2 2026 based on our quarterly rate path assumptions.'),
  e('ev_0066','sum_0022','rpt_0022','att_0022', 9, 'keyPoint', '1','Deposit beta inflection point is positioned for the second half of 2026 on both retail and commercial books.'),

  // ── Northstar summaries ─────────────────────────────────────────────
  e('ev_0067','sum_0023','rpt_0023','att_0029', 2, 'thesis',   '', 'We raise our 12-month price target to $1,320 driven by an earlier-than-modeled Blackwell Ultra ramp.',                                                      undefined, 'org_northstar'),
  e('ev_0068','sum_0023','rpt_0023','att_0029', 5, 'keyPoint', '0','Supply-side checks indicate Blackwell Ultra shipments tracking approximately six weeks ahead of baseline.',                                              undefined, 'org_northstar'),
  e('ev_0069','sum_0023','rpt_0023','att_0029', 9, 'keyPoint', '1','Aggregate FY2026 capex guidance from top four hyperscalers implies ~22% y/y growth.',                                                                   undefined, 'org_northstar'),

  e('ev_0070','sum_0024','rpt_0024','att_0030', 2, 'thesis',   '', 'Azure constant-currency growth is sustaining at +32% with AI attach rate running ahead of prior.',                                                      undefined, 'org_northstar'),
  e('ev_0071','sum_0024','rpt_0024','att_0030', 6, 'keyPoint', '0','Azure constant-currency growth tracked plus thirty-two percent year-over-year exiting the December quarter.',                                           undefined, 'org_northstar'),
  e('ev_0072','sum_0024','rpt_0024','att_0030',12, 'keyPoint', '1','AI workload attach on Azure exceeds our prior modeling.',                                                                                              undefined, 'org_northstar'),

  e('ev_0073','sum_0025','rpt_0025','att_0031', 2, 'thesis',   '', 'We move AAPL to Neutral; the modest iPhone 17 upgrade cycle is insufficient to drive positive EPS revisions.',                                          undefined, 'org_northstar'),
  e('ev_0074','sum_0025','rpt_0025','att_0031', 5, 'keyPoint', '0','iPhone 17 blended ASP growth is limited to low single digits in our updated model.',                                                                    undefined, 'org_northstar'),
  e('ev_0075','sum_0025','rpt_0025','att_0031', 9, 'keyPoint', '1','China demand is normalizing but not reaccelerating.',                                                                                                   undefined, 'org_northstar'),

  e('ev_0076','sum_0026','rpt_0026','att_0032', 2, 'thesis',   '', 'Engagement trends are holding and valuation is balanced; we retain Neutral.',                                                                           undefined, 'org_northstar'),
  e('ev_0077','sum_0026','rpt_0026','att_0032', 5, 'keyPoint', '0','Engagement trends are stable year-over-year across core surfaces.',                                                                                     undefined, 'org_northstar'),
  e('ev_0078','sum_0026','rpt_0026','att_0032', 8, 'keyPoint', '1','Reels monetization provides modest upside to our ad revenue forecast.',                                                                                 undefined, 'org_northstar'),

  e('ev_0079','sum_0027','rpt_0027','att_0033', 3, 'thesis',   '', 'Robotaxi launch path is credible for H2 26 and the optionality remains mispriced.',                                                                    undefined, 'org_northstar'),
  e('ev_0080','sum_0027','rpt_0027','att_0033', 8, 'keyPoint', '0','The Robotaxi platform is ready for pilot cities in the second half of 2026.',                                                                           undefined, 'org_northstar'),
  e('ev_0081','sum_0027','rpt_0027','att_0033',14, 'keyPoint', '1','Energy storage gross margin exceeds 30% in our 2027 model.',                                                                                           undefined, 'org_northstar'),
]

function e(
  id: string,
  summaryId: string,
  reportId: string,
  attachmentId: string,
  pageNumber: number,
  supportingField: EvidenceSupportingField,
  fieldRef: string,
  textSnippet: string,
  boundingBox?: readonly [number, number, number, number],
  orgId: string = 'org_acme',
): EvidenceSnippet {
  return {
    id: asEvidenceId(id),
    orgId: asOrgId(orgId),
    reportId: asReportId(reportId),
    summaryId: asSummaryId(summaryId),
    attachmentId: asAttachmentId(attachmentId),
    pageNumber,
    textSnippet,
    charOffsetStart: null,
    charOffsetEnd: null,
    boundingBox: boundingBox ?? null,
    supportingField,
    fieldRef,
  }
}
