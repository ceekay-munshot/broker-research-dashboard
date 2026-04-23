import type { ResearchReport } from '../domain'
import {
  asOrgId, asBrokerId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asSectorId, asTicker,
} from '../lib/ids'

// One ResearchReport per READY email. Aranya: rpt_0001..0022 mapping 1:1
// with eml_0001..0022. Sahyadri: rpt_0023..0027 mapping to eml_0031..0035.
export const reports: readonly ResearchReport[] = [
  // ── Aranya ───────────────────────────────────────────────────────────
  r('rpt_0001', 'org_aranya', 'brk_kotak',      'eml_0001', 'att_0001', 'RELIANCE: Jio ARPU discipline + retail EBITDA step-up into FY27',        '2026-04-22T09:00:00.000Z', '2026-04-22T11:14:22.000Z', 'update', ['RELIANCE'],   ['sec_energy'],     18, 'sum_0001'),
  r('rpt_0002', 'org_aranya', 'brk_kotak',      'eml_0002', 'att_0002', 'ONGC: Upstream capex discipline drives FCF inflection',                    '2026-04-22T10:05:00.000Z', '2026-04-22T12:05:10.000Z', 'update', ['ONGC'],       ['sec_energy'],     22, 'sum_0002'),
  r('rpt_0003', 'org_aranya', 'brk_kotak',      'eml_0003', 'att_0003', 'INFY: BFSI deal TCV accelerating; raising FY27 estimates',                 '2026-04-22T11:00:00.000Z', '2026-04-22T13:02:01.000Z', 'update', ['INFY'],       ['sec_it'],         14, 'sum_0003'),
  r('rpt_0004', 'org_aranya', 'brk_kotak',      'eml_0004', 'att_0004', 'TCS: Vantara ramp + GenAI attach rate surprise; reiterate Buy',             '2026-04-22T12:10:00.000Z', '2026-04-22T14:18:45.000Z', 'update', ['TCS'],        ['sec_it'],         16, 'sum_0004'),
  r('rpt_0005', 'org_aranya', 'brk_mosl',       'eml_0005', 'att_0005', 'HDFCBANK: NIM trough in 1QFY27; LDR normalisation visible',                 '2026-04-22T07:40:00.000Z', '2026-04-22T09:42:18.000Z', 'update', ['HDFCBANK'],   ['sec_fin'],        24, 'sum_0005'),
  r('rpt_0006', 'org_aranya', 'brk_mosl',       'eml_0006', 'att_0006', 'SUNPHARMA: Specialty franchise re-rating + Ilumya ramp',                    '2026-04-22T08:25:00.000Z', '2026-04-22T10:28:05.000Z', 'deep_dive', ['SUNPHARMA'], ['sec_pharma'],     28, 'sum_0006'),
  r('rpt_0007', 'org_aranya', 'brk_mosl',       'eml_0007', 'att_0007', 'LT: Order inflow at record highs; engineering cycle extended',               '2026-04-22T13:05:00.000Z', '2026-04-22T15:12:40.000Z', 'update', ['LT'],         ['sec_industrial'], 12, 'sum_0007'),
  r('rpt_0008', 'org_aranya', 'brk_icici',      'eml_0008', 'att_0008', 'MARUTI: Volume growth moderating; rural recovery slower than modeled',      '2026-04-21T11:48:00.000Z', '2026-04-21T13:55:30.000Z', 'update', ['MARUTI'],     ['sec_consumer'],   15, 'sum_0008'),
  r('rpt_0009', 'org_aranya', 'brk_icici',      'eml_0009', 'att_0009', 'TATAMOTORS: JLR margin reset structural; headwinds into FY27',              '2026-04-18T12:00:00.000Z', '2026-04-18T14:08:11.000Z', 'update', ['TATAMOTORS'], ['sec_consumer'],   11, 'sum_0009'),
  r('rpt_0010', 'org_aranya', 'brk_hdfc',       'eml_0010', 'att_0010', 'MARUTI: EV roadmap adds visibility; premiumisation intact',                 '2026-04-22T06:00:00.000Z', '2026-04-22T08:02:02.000Z', 'update', ['MARUTI'],     ['sec_consumer'],   17, 'sum_0010'),
  r('rpt_0011', 'org_aranya', 'brk_hdfc',       'eml_0011', 'att_0011', 'RELIANCE: Fair value captured; balanced risk/reward',                        '2026-04-17T10:30:00.000Z', '2026-04-17T12:30:00.000Z', 'update', ['RELIANCE'],   ['sec_energy'],     10, 'sum_0011'),
  r('rpt_0012', 'org_aranya', 'brk_axis',       'eml_0012', 'att_0012', 'ICICIBANK: Deposit franchise strength; credit costs benign',                 '2026-04-22T09:30:00.000Z', '2026-04-22T11:48:22.000Z', 'update', ['ICICIBANK'],  ['sec_fin'],        19, 'sum_0012'),
  r('rpt_0013', 'org_aranya', 'brk_axis',       'eml_0013', 'att_0013', 'DRREDDY: US generics pricing pressure persisting',                          '2026-04-16T08:00:00.000Z', '2026-04-16T10:11:50.000Z', 'update', ['DRREDDY'],    ['sec_pharma'],     13, 'sum_0013'),
  r('rpt_0014', 'org_aranya', 'brk_nuvama',     'eml_0014', 'att_0014', 'TCS: Discretionary deal deferrals; cutting estimates, downgrading',          '2026-04-22T12:25:00.000Z', '2026-04-22T14:44:01.000Z', 'flash',  ['TCS'],        ['sec_it'],          9, 'sum_0014'),
  r('rpt_0015', 'org_aranya', 'brk_nuvama',     'eml_0015', 'att_0015', 'ICICIBANK: Unsecured book stress rising; trimming FY27 estimates',           '2026-04-14T14:15:00.000Z', '2026-04-14T16:21:00.000Z', 'update', ['ICICIBANK'],  ['sec_fin'],        20, 'sum_0015'),
  r('rpt_0016', 'org_aranya', 'brk_nuvama',     'eml_0016', 'att_0016', 'WIPRO: Transformation narrative unproven; Neutral reiterated',              '2026-04-15T11:00:00.000Z', '2026-04-15T13:15:00.000Z', 'update', ['WIPRO'],      ['sec_it'],         11, 'sum_0016'),
  r('rpt_0017', 'org_aranya', 'brk_ambit',      'eml_0017', 'att_0017', 'HCLTECH: Services business at inflection; AI infra spend beneficiary',       '2026-04-23T06:00:00.000Z', '2026-04-23T08:11:44.000Z', 'deep_dive', ['HCLTECH'],  ['sec_it'],         23, 'sum_0017'),
  r('rpt_0018', 'org_aranya', 'brk_ambit',      'eml_0018', 'att_0018', 'INFY: Deal ramp improving; raising PT',                                      '2026-04-23T07:00:00.000Z', '2026-04-23T09:02:18.000Z', 'update', ['INFY'],       ['sec_it'],         18, 'sum_0018'),
  r('rpt_0019', 'org_aranya', 'brk_ambit',      'eml_0019', 'att_0019', 'TATAMOTORS: JLR Range Rover launch + India PV gains; upgrading to Buy',      '2026-04-23T08:15:00.000Z', '2026-04-23T10:18:00.000Z', 'update', ['TATAMOTORS'], ['sec_consumer'],   14, 'sum_0019'),
  r('rpt_0020', 'org_aranya', 'brk_jmfin',      'eml_0020', 'att_0020', 'ONGC: Brent deck cut to $68 \u2014 cutting estimates and PT',               '2026-04-18T09:30:00.000Z', '2026-04-18T11:34:22.000Z', 'update', ['ONGC'],       ['sec_energy'],     21, 'sum_0020'),
  r('rpt_0021', 'org_aranya', 'brk_iifl',       'eml_0021', 'att_0021', 'HUL: Premium skincare disappointment; FY27 volume growth at risk',           '2026-04-15T13:40:00.000Z', '2026-04-15T15:50:00.000Z', 'flash',  ['HINDUNILVR'], ['sec_consumer'],   12, 'sum_0021'),
  r('rpt_0022', 'org_aranya', 'brk_plilladher', 'eml_0022', 'att_0022', 'SBIN: Retail credit growth + asset quality benign; raising PT',             '2026-04-19T10:00:00.000Z', '2026-04-19T12:00:00.000Z', 'update', ['SBIN'],       ['sec_fin'],        16, 'sum_0022'),

  // ── Sahyadri ─────────────────────────────────────────────────────────
  r('rpt_0023', 'org_sahyadri', 'brk_kotak',  'eml_0031', 'att_0029', 'RELIANCE: Jio ARPU discipline + retail EBITDA step-up into FY27',          '2026-04-22T09:00:00.000Z', '2026-04-22T11:14:22.000Z', 'update', ['RELIANCE'],  ['sec_energy'],   18, 'sum_0023'),
  r('rpt_0024', 'org_sahyadri', 'brk_mosl',   'eml_0032', 'att_0030', 'TCS: GenAI attach rate ahead of plan; margin cadence intact',              '2026-04-22T07:40:00.000Z', '2026-04-22T09:42:18.000Z', 'update', ['TCS'],       ['sec_it'],       24, 'sum_0024'),
  r('rpt_0025', 'org_sahyadri', 'brk_icici',  'eml_0033', 'att_0031', 'MARUTI: Volume growth moderating; rural recovery slower than modeled',     '2026-04-21T11:48:00.000Z', '2026-04-21T13:55:30.000Z', 'update', ['MARUTI'],    ['sec_consumer'], 15, 'sum_0025'),
  r('rpt_0026', 'org_sahyadri', 'brk_nuvama', 'eml_0034', 'att_0032', 'INFY: Deal ramp visible; margin cadence on watch',                          '2026-04-21T09:15:00.000Z', '2026-04-21T11:18:00.000Z', 'update', ['INFY'],      ['sec_it'],       12, 'sum_0026'),
  r('rpt_0027', 'org_sahyadri', 'brk_ambit',  'eml_0035', 'att_0033', 'TATAMOTORS: JLR Range Rover launch + India PV gains; upgrading to Buy',    '2026-04-23T06:00:00.000Z', '2026-04-23T08:11:44.000Z', 'deep_dive', ['TATAMOTORS'], ['sec_consumer'], 23, 'sum_0027'),
]

function r(
  id: string, orgId: string, brokerId: string, emailId: string, attachmentId: string,
  title: string, publishedAt: string, receivedAt: string,
  reportType: ResearchReport['reportType'],
  tickers: readonly string[],
  sectorIds: readonly string[],
  pageCount: number,
  summaryId: string,
): ResearchReport {
  return {
    id: asReportId(id),
    orgId: asOrgId(orgId),
    brokerId: asBrokerId(brokerId),
    sourceEmailId: asEmailId(emailId),
    sourceAttachmentId: asAttachmentId(attachmentId),
    title,
    publishedAt,
    receivedAt,
    reportType,
    tickers: tickers.map(asTicker),
    sectorIds: sectorIds.map(asSectorId),
    pageCount,
    language: 'en',
    status: 'ready',
    summaryId: asSummaryId(summaryId),
  }
}
