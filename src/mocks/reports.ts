import type { ResearchReport } from '../domain'
import {
  asOrgId, asBrokerId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asSectorId, asTicker,
} from '../lib/ids'

// One ResearchReport per READY email. Acme: rpt_0001..0022 mapping 1:1 with
// eml_0001..0022. Northstar: rpt_0023..0027 mapping to eml_0031..0035.
export const reports: readonly ResearchReport[] = [
  // ── Acme ─────────────────────────────────────────────────────────────
  r('rpt_0001', 'org_acme', 'brk_gs',   'eml_0001', 'att_0001', 'NVDA: Raising estimates — Blackwell ramp tracking ahead of plan', '2026-04-22T09:00:00.000Z', '2026-04-22T11:14:22.000Z', 'update', ['NVDA'],         ['sec_tech'],       18, 'sum_0001'),
  r('rpt_0002', 'org_acme', 'brk_gs',   'eml_0002', 'att_0002', 'XOM: Guyana cash flow step-up into 2027 underappreciated',           '2026-04-22T10:05:00.000Z', '2026-04-22T12:05:10.000Z', 'update', ['XOM'],          ['sec_energy'],     22, 'sum_0002'),
  r('rpt_0003', 'org_acme', 'brk_gs',   'eml_0003', 'att_0003', 'META: Reels monetization closing the gap to feed',                   '2026-04-22T11:00:00.000Z', '2026-04-22T13:02:01.000Z', 'update', ['META'],         ['sec_tech'],       14, 'sum_0003'),
  r('rpt_0004', 'org_acme', 'brk_gs',   'eml_0004', 'att_0004', 'AMZN: AWS reacceleration plus retail margin expansion',               '2026-04-22T12:10:00.000Z', '2026-04-22T14:18:45.000Z', 'update', ['AMZN'],         ['sec_tech'],       16, 'sum_0004'),
  r('rpt_0005', 'org_acme', 'brk_ms',   'eml_0005', 'att_0005', 'MSFT: Azure growth sustaining — AI attach rate surprise',             '2026-04-22T07:40:00.000Z', '2026-04-22T09:42:18.000Z', 'update', ['MSFT'],         ['sec_tech'],       24, 'sum_0005'),
  r('rpt_0006', 'org_acme', 'brk_ms',   'eml_0006', 'att_0006', 'LLY: GLP-1 TAM expansion — cardio label a 2027 catalyst',              '2026-04-22T08:25:00.000Z', '2026-04-22T10:28:05.000Z', 'deep_dive', ['LLY'],        ['sec_health'],     28, 'sum_0006'),
  r('rpt_0007', 'org_acme', 'brk_ms',   'eml_0007', 'att_0007', 'CAT: Services backlog at new highs — cycle extended',                 '2026-04-22T13:05:00.000Z', '2026-04-22T15:12:40.000Z', 'update', ['CAT'],          ['sec_industrial'], 12, 'sum_0007'),
  r('rpt_0008', 'org_acme', 'brk_jpm',  'eml_0008', 'att_0008', 'AAPL: Trim to Neutral — upgrade cycle likely muted',                  '2026-04-21T11:48:00.000Z', '2026-04-21T13:55:30.000Z', 'update', ['AAPL'],         ['sec_tech'],       15, 'sum_0008'),
  r('rpt_0009', 'org_acme', 'brk_jpm',  'eml_0009', 'att_0009', 'TSLA: Valuation disconnect from delivery trajectory',                 '2026-04-18T12:00:00.000Z', '2026-04-18T14:08:11.000Z', 'update', ['TSLA'],         ['sec_consumer'],   11, 'sum_0009'),
  r('rpt_0010', 'org_acme', 'brk_baml', 'eml_0010', 'att_0010', 'AAPL: Services re-rating as AI features pull iPhone cycle',           '2026-04-22T06:00:00.000Z', '2026-04-22T08:02:02.000Z', 'update', ['AAPL'],         ['sec_tech'],       17, 'sum_0010'),
  r('rpt_0011', 'org_acme', 'brk_baml', 'eml_0011', 'att_0011', 'NVDA: Moving to Neutral — limited multiple expansion from here',      '2026-04-17T10:30:00.000Z', '2026-04-17T12:30:00.000Z', 'update', ['NVDA'],         ['sec_tech'],       10, 'sum_0011'),
  r('rpt_0012', 'org_acme', 'brk_citi', 'eml_0012', 'att_0012', 'GOOGL: Search resilience holding despite AI overhang',                '2026-04-22T09:30:00.000Z', '2026-04-22T11:48:22.000Z', 'update', ['GOOGL'],        ['sec_tech'],       19, 'sum_0012'),
  r('rpt_0013', 'org_acme', 'brk_citi', 'eml_0013', 'att_0013', 'LLY: Cautious — competitive intensity rising into year-end',           '2026-04-16T08:00:00.000Z', '2026-04-16T10:11:50.000Z', 'update', ['LLY'],          ['sec_health'],     13, 'sum_0013'),
  r('rpt_0014', 'org_acme', 'brk_ubs',  'eml_0014', 'att_0014', 'NVDA: Downgrade to Sell — hyperscaler capex digestion risk',           '2026-04-22T12:25:00.000Z', '2026-04-22T14:44:01.000Z', 'flash',  ['NVDA'],         ['sec_tech'],        9, 'sum_0014'),
  r('rpt_0015', 'org_acme', 'brk_ubs',  'eml_0015', 'att_0015', 'GOOGL: Regulatory overhang limits multiple expansion',                 '2026-04-14T14:15:00.000Z', '2026-04-14T16:21:00.000Z', 'update', ['GOOGL'],        ['sec_tech'],       20, 'sum_0015'),
  r('rpt_0016', 'org_acme', 'brk_ubs',  'eml_0016', 'att_0016', 'AMZN: Margin cadence unchanged — retain Neutral',                      '2026-04-15T11:00:00.000Z', '2026-04-15T13:15:00.000Z', 'update', ['AMZN'],         ['sec_tech'],       11, 'sum_0016'),
  r('rpt_0017', 'org_acme', 'brk_jef',  'eml_0017', 'att_0017', 'TSLA: Robotaxi option value still underwritten by the Street',          '2026-04-23T06:00:00.000Z', '2026-04-23T08:11:44.000Z', 'deep_dive', ['TSLA'],       ['sec_consumer'],   23, 'sum_0017'),
  r('rpt_0018', 'org_acme', 'brk_jef',  'eml_0018', 'att_0018', 'MSFT: Raising PT on Copilot monetization traction',                    '2026-04-23T07:00:00.000Z', '2026-04-23T09:02:18.000Z', 'update', ['MSFT'],         ['sec_tech'],       18, 'sum_0018'),
  r('rpt_0019', 'org_acme', 'brk_jef',  'eml_0019', 'att_0019', 'AMZN: AWS reacceleration plus retail margin expansion',                '2026-04-23T08:15:00.000Z', '2026-04-23T10:18:00.000Z', 'update', ['AMZN'],         ['sec_tech'],       14, 'sum_0019'),
  r('rpt_0020', 'org_acme', 'brk_barc', 'eml_0020', 'att_0020', 'XOM: Brent deck cut — supply surplus widens through year-end',          '2026-04-18T09:30:00.000Z', '2026-04-18T11:34:22.000Z', 'update', ['XOM'],          ['sec_energy'],     21, 'sum_0020'),
  r('rpt_0021', 'org_acme', 'brk_nmr',  'eml_0021', 'att_0021', 'TSLA: Margin reset — price war unlikely to abate before Q3',           '2026-04-15T13:40:00.000Z', '2026-04-15T15:50:00.000Z', 'flash',  ['TSLA'],         ['sec_consumer'],   12, 'sum_0021'),
  r('rpt_0022', 'org_acme', 'brk_wf',   'eml_0022', 'att_0022', 'JPM: NII troughing — deposit beta inflection in view',                 '2026-04-19T10:00:00.000Z', '2026-04-19T12:00:00.000Z', 'update', ['JPM'],          ['sec_fin'],        16, 'sum_0022'),

  // ── Northstar ────────────────────────────────────────────────────────
  r('rpt_0023', 'org_northstar', 'brk_gs',  'eml_0031', 'att_0029', 'NVDA: Raising estimates — Blackwell ramp tracking ahead of plan', '2026-04-22T09:00:00.000Z', '2026-04-22T11:14:22.000Z', 'update', ['NVDA'], ['sec_tech'],     18, 'sum_0023'),
  r('rpt_0024', 'org_northstar', 'brk_ms',  'eml_0032', 'att_0030', 'MSFT: Azure growth sustaining — AI attach rate surprise',         '2026-04-22T07:40:00.000Z', '2026-04-22T09:42:18.000Z', 'update', ['MSFT'], ['sec_tech'],     24, 'sum_0024'),
  r('rpt_0025', 'org_northstar', 'brk_jpm', 'eml_0033', 'att_0031', 'AAPL: Trim to Neutral — upgrade cycle likely muted',              '2026-04-21T11:48:00.000Z', '2026-04-21T13:55:30.000Z', 'update', ['AAPL'], ['sec_tech'],     15, 'sum_0025'),
  r('rpt_0026', 'org_northstar', 'brk_ubs', 'eml_0034', 'att_0032', 'META: Engagement holding — retain Neutral',                       '2026-04-21T09:15:00.000Z', '2026-04-21T11:18:00.000Z', 'update', ['META'], ['sec_tech'],     12, 'sum_0026'),
  r('rpt_0027', 'org_northstar', 'brk_jef', 'eml_0035', 'att_0033', 'TSLA: Robotaxi option value still underwritten by the Street',    '2026-04-23T06:00:00.000Z', '2026-04-23T08:11:44.000Z', 'deep_dive', ['TSLA'], ['sec_consumer'], 23, 'sum_0027'),
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
