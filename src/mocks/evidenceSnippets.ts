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
  // sum_0001 — Kotak RELIANCE bullish
  e('ev_0001','sum_0001','rpt_0001','att_0001', 2, 'thesis',   '', 'We lift our 12-month PT to \u20b93,200 (from \u20b93,050) on Jio ARPU discipline and retail EBITDA step-up; our sum-of-parts framework continues to reward execution across energy, retail and digital.', [72, 544, 486, 592]),
  e('ev_0002','sum_0001','rpt_0001','att_0001', 5, 'keyPoint', '0','Reported Jio ARPU of \u20b9218 implies 8-10% y/y growth is sustainable given current tariff discipline and subscriber mix.'),
  e('ev_0003','sum_0001','rpt_0001','att_0001', 9, 'keyPoint', '1','Retail EBITDA margin expansion of approximately 120bps year-over-year is being driven by operating leverage and premium-category growth.'),

  // sum_0002 — Kotak ONGC bullish
  e('ev_0004','sum_0002','rpt_0002','att_0002', 3, 'thesis',   '', 'We reiterate Buy and raise our PT to \u20b9340. Upstream capex discipline and APM gas pricing at firm floors position ONGC for FCF inflection into FY27.', [60, 512, 498, 566]),
  e('ev_0005','sum_0002','rpt_0002','att_0002', 7, 'keyPoint', '0','APM gas pricing remains anchored at the $6.50/mmbtu floor, providing meaningful cushion to our FY27 realisation assumptions.'),
  e('ev_0006','sum_0002','rpt_0002','att_0002',11, 'keyPoint', '1','Capex trajectory has been disciplined post board reset with standalone capex guidance of \u20b937,500cr sustained for FY27.'),

  // sum_0003 — Kotak INFY bullish
  e('ev_0007','sum_0003','rpt_0003','att_0003', 2, 'thesis',   '', 'We lift our 12-month PT to \u20b91,950. BFSI deal wins at record TCV alongside stabilising discretionary spend support an inflection in FY27 revenue growth.'),
  e('ev_0008','sum_0003','rpt_0003','att_0003', 4, 'keyPoint', '0','Disclosed BFSI deal TCV in 3QFY26 is approximately 40% higher year-over-year on our bottom-up tracking.'),
  e('ev_0009','sum_0003','rpt_0003','att_0003', 8, 'keyPoint', '1','Management commentary indicates discretionary spend stabilisation across BFSI and retail has become visible entering 4QFY26.'),

  // sum_0004 — Kotak TCS bullish
  e('ev_0010','sum_0004','rpt_0004','att_0004', 2, 'thesis',   '', 'We raise our PT to \u20b94,800 on Vantara platform contribution and GenAI attach rate exceeding our prior; reiterate Buy.'),
  e('ev_0011','sum_0004','rpt_0004','att_0004', 5, 'keyPoint', '0','Vantara platform is contributing to deal pipeline velocity across BFSI and hi-tech verticals as disclosed in our channel checks.'),
  e('ev_0012','sum_0004','rpt_0004','att_0004',10, 'keyPoint', '1','GenAI attach rate is running at approximately 22% of new deals, meaningfully above our prior baseline.'),

  // sum_0005 — MOSL HDFCBANK bullish
  e('ev_0013','sum_0005','rpt_0005','att_0005', 2, 'thesis',   '', 'NIM troughing in 1QFY27 with LDR normalisation visible provides clear line of sight to NII inflection; we reiterate Buy, PT \u20b92,050.'),
  e('ev_0014','sum_0005','rpt_0005','att_0005', 6, 'keyPoint', '0','Loan-to-deposit ratio is on a glide path toward approximately 100% by FY27 exit on our revised trajectory.'),
  e('ev_0015','sum_0005','rpt_0005','att_0005',12, 'keyPoint', '1','Granular retail deposit franchise advantage continues to hold, with retail deposit growth sustaining above industry pace.'),

  // sum_0006 — MOSL SUNPHARMA bullish
  e('ev_0016','sum_0006','rpt_0006','att_0006', 3, 'thesis',   '', 'Specialty franchise is re-rating as Ilumya scales and Cequa moats strengthen; we lift PT to \u20b92,000.'),
  e('ev_0017','sum_0006','rpt_0006','att_0006', 8, 'keyPoint', '0','Ilumya global sales trajectory on our model reaches approximately $1B at peak across plaque psoriasis and adjacent indications.'),
  e('ev_0018','sum_0006','rpt_0006','att_0006',14, 'keyPoint', '1','Specialty revenue mix is projected to exceed 20% of total revenue by FY27 exit on our forecast.'),

  // sum_0007 — MOSL LT bullish
  e('ev_0019','sum_0007','rpt_0007','att_0007', 2, 'thesis',   '', 'Order inflow at record highs across infrastructure and hi-tech segments supports an extended engineering capex cycle; Buy, PT \u20b94,200.'),
  e('ev_0020','sum_0007','rpt_0007','att_0007', 5, 'keyPoint', '0','4QFY26 order inflow is up approximately 22% year-over-year on a balanced infrastructure and hi-tech segment contribution.'),
  e('ev_0021','sum_0007','rpt_0007','att_0007', 8, 'keyPoint', '1','International orders now account for more than 35% of the order book, reflecting our thesis of diversified revenue base.'),

  // sum_0008 — ICICI Sec MARUTI neutral
  e('ev_0022','sum_0008','rpt_0008','att_0008', 2, 'thesis',   '', 'We move MARUTI to Hold; volume growth moderating as rural recovery comes through slower than our model. PT \u20b911,800.'),
  e('ev_0023','sum_0008','rpt_0008','att_0008', 5, 'keyPoint', '0','Rural volume recovery is tracking below our FY27 model by approximately 300 bps on early channel data.'),
  e('ev_0024','sum_0008','rpt_0008','att_0008', 9, 'keyPoint', '1','Entry-level hatchback demand remains muted despite recent price corrections across the segment.'),

  // sum_0009 — ICICI Sec TATAMOTORS bearish
  e('ev_0025','sum_0009','rpt_0009','att_0009', 2, 'thesis',   '', 'We downgrade TATAMOTORS to Sell. JLR margin reset is structural and China BEV entry is disrupting premium pricing. PT \u20b9720.'),
  e('ev_0026','sum_0009','rpt_0009','att_0009', 4, 'keyPoint', '0','JLR EBIT margin is resetting below 7% on our forecast, well short of management aspiration of double-digits.'),
  e('ev_0027','sum_0009','rpt_0009','att_0009', 7, 'keyPoint', '1','China BEV entrants such as NIO and BYD are meaningfully disrupting premium pricing in UK and EU markets.'),

  // sum_0010 — HDFC Sec MARUTI bullish
  e('ev_0028','sum_0010','rpt_0010','att_0010', 3, 'thesis',   '', 'EV roadmap with eVitara launch adds visibility; premiumisation trend intact into FY27. Buy, PT \u20b914,500.'),
  e('ev_0029','sum_0010','rpt_0010','att_0010', 6, 'keyPoint', '0','eVitara pre-bookings are tracking ahead of our FY27 volume expectations based on dealer channel checks.'),
  e('ev_0030','sum_0010','rpt_0010','att_0010',10, 'keyPoint', '1','Premium portfolio contribution has reached approximately 24% of volumes and is rising on Fronx/Grand Vitara momentum.'),

  // sum_0011 — HDFC Sec RELIANCE neutral
  e('ev_0031','sum_0011','rpt_0011','att_0011', 2, 'thesis',   '', 'Current price largely captures fair value across segments; risk/reward balanced. We move to Neutral with PT \u20b92,950.'),
  e('ev_0032','sum_0011','rpt_0011','att_0011', 4, 'keyPoint', '0','The Jio tariff hike is largely priced in following recent stock performance.'),
  e('ev_0033','sum_0011','rpt_0011','att_0011', 8, 'keyPoint', '1','Retail margin expansion path is fully captured in our base-case sum-of-parts framework.'),

  // sum_0012 — Axis Cap ICICIBANK bullish
  e('ev_0034','sum_0012','rpt_0012','att_0012', 2, 'thesis',   '', 'Deposit franchise strength sustaining with credit costs benign supports NII outperformance. Buy, PT \u20b91,520.'),
  e('ev_0035','sum_0012','rpt_0012','att_0012', 6, 'keyPoint', '0','Overall deposit growth is sustaining above plus eighteen percent year-over-year, well ahead of industry run-rate.'),
  e('ev_0036','sum_0012','rpt_0012','att_0012',11, 'keyPoint', '1','Net slippage has trended to multi-year lows across both retail and corporate books.'),

  // sum_0013 — Axis Cap DRREDDY neutral
  e('ev_0037','sum_0013','rpt_0013','att_0013', 2, 'thesis',   '', 'US generics pricing pressure persisting with limited near-term catalysts; we retain Hold. PT \u20b96,200.'),
  e('ev_0038','sum_0013','rpt_0013','att_0013', 5, 'keyPoint', '0','US oral solids pricing remains under pressure at approximately minus six percent year-over-year across the portfolio.'),
  e('ev_0039','sum_0013','rpt_0013','att_0013', 9, 'keyPoint', '1','The biosimilars pipeline is unchanged; we see no approvable near-term catalyst in the next 12 months.'),

  // sum_0014 — Nuvama TCS bearish
  e('ev_0040','sum_0014','rpt_0014','att_0014', 2, 'thesis',   '', 'We downgrade TCS to Sell. Discretionary deal deferrals intensifying in BFSI and hi-tech verticals. PT \u20b93,400.'),
  e('ev_0041','sum_0014','rpt_0014','att_0014', 4, 'keyPoint', '0','BFSI vertical is exhibiting clear deferral signals in 4QFY26 based on our checks with deal advisors.'),
  e('ev_0042','sum_0014','rpt_0014','att_0014', 7, 'keyPoint', '1','Hi-tech vertical guidance cuts look likely as client restructuring decisions extend into 1HFY27.'),

  // sum_0015 — Nuvama ICICIBANK bearish
  e('ev_0043','sum_0015','rpt_0015','att_0015', 3, 'thesis',   '', 'Unsecured book stress signals emerging; we trim FY27 credit cost estimates and downgrade. PT \u20b91,100.'),
  e('ev_0044','sum_0015','rpt_0015','att_0015', 8, 'keyPoint', '0','Personal loan slippage is trending higher in 4QFY26 based on our bottoms-up channel work.'),
  e('ev_0045','sum_0015','rpt_0015','att_0015',13, 'keyPoint', '1','Microfinance portfolio at-risk is rising and we see elevated credit cost pressure into FY27.'),

  // sum_0016 — Nuvama WIPRO neutral
  e('ev_0046','sum_0016','rpt_0016','att_0016', 2, 'thesis',   '', 'Transformation narrative yet to translate into a consistent revenue trajectory; we retain Neutral. PT \u20b9470.'),
  e('ev_0047','sum_0016','rpt_0016','att_0016', 5, 'keyPoint', '0','Capco integration is yielding mixed revenue synergies; cross-sell motion is below our FY27 expectation.'),
  e('ev_0048','sum_0016','rpt_0016','att_0016', 8, 'keyPoint', '1','Client concentration risk remains elevated with top-10 client exposure above peer average.'),

  // sum_0017 — Ambit HCLTECH bullish
  e('ev_0049','sum_0017','rpt_0017','att_0017', 3, 'thesis',   '', 'Services business at inflection with AI infra spend benefiting ER&D segment; Buy, PT \u20b92,050.'),
  e('ev_0050','sum_0017','rpt_0017','att_0017', 8, 'keyPoint', '0','ER&D pipeline growth of approximately 28% year-over-year reflects structural AI-infra tailwinds.'),
  e('ev_0051','sum_0017','rpt_0017','att_0017',14, 'keyPoint', '1','Services segment deal TCV has reached fresh highs, supporting our thesis of sustained double-digit growth.'),

  // sum_0018 — Ambit INFY bullish
  e('ev_0052','sum_0018','rpt_0018','att_0018', 2, 'thesis',   '', 'Deal ramp accelerating into 1HFY27 with margin cadence holding; we raise PT to \u20b91,920.'),
  e('ev_0053','sum_0018','rpt_0018','att_0018', 5, 'keyPoint', '0','Deal ramp-up period is shortening on our channel work, supporting faster revenue conversion.'),
  e('ev_0054','sum_0018','rpt_0018','att_0018', 9, 'keyPoint', '1','Operating margin is holding at the approximately 21% mid-point of management guidance.'),

  // sum_0019 — Ambit TATAMOTORS bullish
  e('ev_0055','sum_0019','rpt_0019','att_0019', 2, 'thesis',   '', 'We upgrade TATAMOTORS to Buy. Range Rover launches drive JLR margin recovery alongside India PV share gains; PT \u20b91,080.'),
  e('ev_0056','sum_0019','rpt_0019','att_0019', 5, 'keyPoint', '0','Range Rover BEV is on track for FY27 launch per management commentary and engineering milestones to date.'),
  e('ev_0057','sum_0019','rpt_0019','att_0019', 9, 'keyPoint', '1','India PV market share is expanding on Punch/Nexon EV momentum, supporting sustained domestic volume growth.'),

  // sum_0020 — JM Fin ONGC bearish
  e('ev_0058','sum_0020','rpt_0020','att_0020', 2, 'thesis',   '', 'We cut our Brent mid-cycle deck to $68/bbl through FY28 and reduce ONGC estimates; downgrade to Sell. PT \u20b9245.'),
  e('ev_0059','sum_0020','rpt_0020','att_0020', 6, 'keyPoint', '0','Non-OPEC supply is tracking ahead of our prior forecast with approximately 1.8 million barrels per day of additions through FY27.'),
  e('ev_0060','sum_0020','rpt_0020','att_0020',11, 'keyPoint', '1','The administered gas pricing cap at $6.50/mmbtu is limiting upside even if crude firms above $75.'),

  // sum_0021 — IIFL HUL bearish
  e('ev_0061','sum_0021','rpt_0021','att_0021', 2, 'thesis',   '', 'Premium skincare execution disappointment with rural slowdown persisting; we trim estimates and downgrade. PT \u20b92,100.'),
  e('ev_0062','sum_0021','rpt_0021','att_0021', 4, 'keyPoint', '0','Premium skincare growth has slowed sharply on our updated channel reads.'),
  e('ev_0063','sum_0021','rpt_0021','att_0021', 7, 'keyPoint', '1','Rural volume recovery remains distant despite price corrections across core portfolio.'),

  // sum_0022 — PL SBIN bullish
  e('ev_0064','sum_0022','rpt_0022','att_0022', 2, 'thesis',   '', 'Retail credit growth accelerating with asset quality benign; we raise PT to \u20b9980.'),
  e('ev_0065','sum_0022','rpt_0022','att_0022', 5, 'keyPoint', '0','Retail loan growth of plus sixteen percent year-over-year is being achieved with underwriting quality intact.'),
  e('ev_0066','sum_0022','rpt_0022','att_0022', 9, 'keyPoint', '1','Corporate credit revival is underway on our tracking, supported by industrial capex momentum.'),

  // ── Aranya · extra-coverage evidence (ev_0082..0093) ────────────────
  // sum_0028 — MOSL TCS bullish
  e('ev_0082','sum_0028','rpt_0028','att_0036', 2, 'thesis',   '', 'GenAI attach rate continues to exceed our prior and margin cadence is intact; we reiterate Buy at \u20b94,650.'),
  e('ev_0083','sum_0028','rpt_0028','att_0036', 5, 'keyPoint', '0','GenAI attach rate on new deals is approximately 22% on our latest channel-check work.'),
  e('ev_0084','sum_0028','rpt_0028','att_0036',10, 'keyPoint', '1','Operating margin is holding at the approximately 25% mid-point, with wage-hike effects contained.'),

  // sum_0029 — Kotak ICICIBANK bullish
  e('ev_0085','sum_0029','rpt_0029','att_0037', 2, 'thesis',   '', 'Deposit franchise resilience and benign retail credit costs support NII outperformance; Buy, PT \u20b91,480.'),
  e('ev_0086','sum_0029','rpt_0029','att_0037', 5, 'keyPoint', '0','Overall deposit growth of plus sixteen percent year-over-year with granular mix across retail and SA.'),
  e('ev_0087','sum_0029','rpt_0029','att_0037', 9, 'keyPoint', '1','Credit costs are stable at approximately 50 basis points through 4QFY26, tracking ahead of our prior.'),

  // sum_0030 — HDFC Sec TATAMOTORS neutral
  e('ev_0088','sum_0030','rpt_0030','att_0038', 2, 'thesis',   '', 'JLR margin recovery is progressing at a measured pace; risk/reward is balanced, we retain Hold with PT \u20b9880.'),
  e('ev_0089','sum_0030','rpt_0030','att_0038', 5, 'keyPoint', '0','JLR EBIT margin recovery is tracking for FY27 on product mix and Range Rover pricing discipline.'),
  e('ev_0090','sum_0030','rpt_0030','att_0038', 8, 'keyPoint', '1','India PV market share gains are continuing on Punch/Nexon EV/Harrier momentum.'),

  // sum_0031 — MOSL RELIANCE bullish
  e('ev_0091','sum_0031','rpt_0031','att_0039', 2, 'thesis',   '', 'Jio ARPU momentum combined with retail EBITDA expansion supports sustained re-rating; Buy, PT \u20b93,150.'),
  e('ev_0092','sum_0031','rpt_0031','att_0039', 6, 'keyPoint', '0','Jio ARPU growth is sustaining at 8-10% year-over-year on the current tariff structure.'),
  e('ev_0093','sum_0031','rpt_0031','att_0039',10, 'keyPoint', '1','Retail EBITDA margin is expanding on operating leverage with premium-category contribution rising.'),

  // ── Sahyadri summaries ──────────────────────────────────────────────
  e('ev_0067','sum_0023','rpt_0023','att_0029', 2, 'thesis',   '', 'We lift our 12-month PT to \u20b93,200 driven by Jio ARPU discipline and retail EBITDA step-up.',                                                   undefined, 'org_sahyadri'),
  e('ev_0068','sum_0023','rpt_0023','att_0029', 5, 'keyPoint', '0','Reported Jio ARPU implies 8-10% y/y growth is sustainable at current tariff discipline.',                                                       undefined, 'org_sahyadri'),
  e('ev_0069','sum_0023','rpt_0023','att_0029', 9, 'keyPoint', '1','Retail segment EBITDA margin expansion of approximately 120bps y/y on operating leverage.',                                                     undefined, 'org_sahyadri'),

  e('ev_0070','sum_0024','rpt_0024','att_0030', 2, 'thesis',   '', 'GenAI attach rate is running ahead of our prior with margin cadence intact.',                                                                   undefined, 'org_sahyadri'),
  e('ev_0071','sum_0024','rpt_0024','att_0030', 6, 'keyPoint', '0','GenAI attach rate on new deals is running at approximately 22% on our tracking.',                                                                undefined, 'org_sahyadri'),
  e('ev_0072','sum_0024','rpt_0024','att_0030',12, 'keyPoint', '1','Operating margin is holding above our FY26 exit assumption through the wage hike cycle.',                                                        undefined, 'org_sahyadri'),

  e('ev_0073','sum_0025','rpt_0025','att_0031', 2, 'thesis',   '', 'We move MARUTI to Hold; volume growth moderating as rural recovery comes through slower than modeled.',                                          undefined, 'org_sahyadri'),
  e('ev_0074','sum_0025','rpt_0025','att_0031', 5, 'keyPoint', '0','Rural volume recovery is tracking below our FY27 model by approximately 300 bps on early channel data.',                                         undefined, 'org_sahyadri'),
  e('ev_0075','sum_0025','rpt_0025','att_0031', 9, 'keyPoint', '1','Entry-level hatchback demand remains muted despite recent price corrections.',                                                                   undefined, 'org_sahyadri'),

  e('ev_0076','sum_0026','rpt_0026','att_0032', 2, 'thesis',   '', 'Deal ramp improving but margin cadence watch persists; Hold retained.',                                                                          undefined, 'org_sahyadri'),
  e('ev_0077','sum_0026','rpt_0026','att_0032', 5, 'keyPoint', '0','Deal ramp-up duration is shortening but visible margin slippage in one of the large BFSI deals is a concern.',                                   undefined, 'org_sahyadri'),
  e('ev_0078','sum_0026','rpt_0026','att_0032', 8, 'keyPoint', '1','Operating margin cadence is on watch given utilisation headroom has compressed.',                                                                undefined, 'org_sahyadri'),

  e('ev_0079','sum_0027','rpt_0027','att_0033', 3, 'thesis',   '', 'We upgrade TATAMOTORS to Buy on Range Rover BEV + India PV share expansion.',                                                                    undefined, 'org_sahyadri'),
  e('ev_0080','sum_0027','rpt_0027','att_0033', 8, 'keyPoint', '0','Range Rover BEV is on track for FY27 launch per engineering milestones.',                                                                       undefined, 'org_sahyadri'),
  e('ev_0081','sum_0027','rpt_0027','att_0033',14, 'keyPoint', '1','India PV market share is expanding on Punch/Nexon EV momentum.',                                                                                undefined, 'org_sahyadri'),
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
  orgId: string = 'org_aranya',
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
