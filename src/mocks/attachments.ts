import type { Attachment } from '../domain'
import { asOrgId, asEmailId, asAttachmentId } from '../lib/ids'

// One attachment per email that carried a PDF. The skipped calendar-invite
// and disclaimer-only emails (eml_0029, eml_0030, eml_0038) have none.
//
// parseStatus mirrors the email's own status so the ops console can render a
// consistent view. The one `failed` row (att_0028) captures a realistic
// pipeline failure mode: a scanned / image-only PDF that needs OCR.
export const attachments: readonly Attachment[] = [
  // Acme ready (parsed)
  mk('att_0001', 'eml_0001', 'NVDA_ResearchUpdate_20260422.pdf', 18, 'ready'),
  mk('att_0002', 'eml_0002', 'XOM_Update_20260422.pdf',          22, 'ready'),
  mk('att_0003', 'eml_0003', 'META_Update_20260422.pdf',         14, 'ready'),
  mk('att_0004', 'eml_0004', 'AMZN_Update_20260422.pdf',         16, 'ready'),
  mk('att_0005', 'eml_0005', 'MSFT_AzureDeepDive_20260422.pdf',  24, 'ready'),
  mk('att_0006', 'eml_0006', 'LLY_GLP1_TAM_20260422.pdf',        28, 'ready'),
  mk('att_0007', 'eml_0007', 'CAT_Backlog_20260422.pdf',         12, 'ready'),
  mk('att_0008', 'eml_0008', 'AAPL_UpgradeCycle_20260421.pdf',   15, 'ready'),
  mk('att_0009', 'eml_0009', 'TSLA_Valuation_20260418.pdf',      11, 'ready'),
  mk('att_0010', 'eml_0010', 'AAPL_ServicesReRate_20260422.pdf', 17, 'ready'),
  mk('att_0011', 'eml_0011', 'NVDA_ModelUpdate_20260417.pdf',    10, 'ready'),
  mk('att_0012', 'eml_0012', 'GOOGL_SearchResilience_20260422.pdf', 19, 'ready'),
  mk('att_0013', 'eml_0013', 'LLY_Competition_20260416.pdf',     13, 'ready'),
  mk('att_0014', 'eml_0014', 'NVDA_Digestion_20260422.pdf',       9, 'ready'),
  mk('att_0015', 'eml_0015', 'GOOGL_Regulatory_20260414.pdf',    20, 'ready'),
  mk('att_0016', 'eml_0016', 'AMZN_Margin_20260415.pdf',         11, 'ready'),
  mk('att_0017', 'eml_0017', 'TSLA_RobotaxiValue_20260423.pdf',  23, 'ready'),
  mk('att_0018', 'eml_0018', 'MSFT_CopilotMon_20260423.pdf',     18, 'ready'),
  mk('att_0019', 'eml_0019', 'AMZN_ReaccelPlus_20260423.pdf',    14, 'ready'),
  mk('att_0020', 'eml_0020', 'XOM_BrentDeck_20260418.pdf',       21, 'ready'),
  mk('att_0021', 'eml_0021', 'TSLA_MarginReset_20260415.pdf',    12, 'ready'),
  mk('att_0022', 'eml_0022', 'JPM_NII_20260419.pdf',             16, 'ready'),

  // Acme in-flight
  mk('att_0023', 'eml_0023', 'CAT_RestockCycle_20260423.pdf',    12, 'queued'),
  mk('att_0024', 'eml_0024', 'NVDA_Q1Update_20260423.pdf',       14, 'queued'),
  mk('att_0025', 'eml_0025', 'META_Q2Update_20260423.pdf',       11, 'queued'),
  mk('att_0026', 'eml_0026', 'CVX_PermianProductivity_20260423.pdf', 19, 'parsing'),
  mk('att_0027', 'eml_0027', 'BAC_CreditTrends_20260423.pdf',    13, 'parsing'),
  mk('att_0028', 'eml_0028', 'BAC_ScannedReport_20260422.pdf',   22, 'failed',
     'pdf_extraction_failed: image-only pages, OCR worker unavailable'),

  // Northstar
  mkN('att_0029', 'eml_0031', 'NVDA_ResearchUpdate_20260422.pdf', 18, 'ready'),
  mkN('att_0030', 'eml_0032', 'MSFT_AzureDeepDive_20260422.pdf',  24, 'ready'),
  mkN('att_0031', 'eml_0033', 'AAPL_UpgradeCycle_20260421.pdf',   15, 'ready'),
  mkN('att_0032', 'eml_0034', 'META_Engagement_20260421.pdf',     12, 'ready'),
  mkN('att_0033', 'eml_0035', 'TSLA_RobotaxiValue_20260423.pdf',  23, 'ready'),
  mkN('att_0034', 'eml_0036', 'TSLA_PostEarnings_20260423.pdf',   15, 'queued'),
  mkN('att_0035', 'eml_0037', 'XOM_Q1Preview_20260423.pdf',       18, 'parsing'),
]

// Helpers to trim the table above. They construct a default shape; anything
// non-default (the failed one) passes the extra argument.
function mk(
  attId: string, emailId: string, filename: string, pages: number,
  parseStatus: Attachment['parseStatus'], parseErrorMessage: string | null = null,
): Attachment {
  return {
    id: asAttachmentId(attId),
    orgId: asOrgId('org_acme'),
    emailId: asEmailId(emailId),
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 380_000 + pages * 22_000,
    checksumSha256: `sha256:${filename}-${pages}`.padEnd(64, '0').slice(0, 71),
    storageRef: `s3://munshot-research-raw/org_acme/${attId}.pdf`,
    pageCount: pages,
    language: 'en',
    parseStatus,
    parseErrorMessage,
  }
}

function mkN(
  attId: string, emailId: string, filename: string, pages: number,
  parseStatus: Attachment['parseStatus'],
): Attachment {
  return {
    id: asAttachmentId(attId),
    orgId: asOrgId('org_northstar'),
    emailId: asEmailId(emailId),
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 380_000 + pages * 22_000,
    checksumSha256: `sha256:${filename}-${pages}-ns`.padEnd(64, '0').slice(0, 71),
    storageRef: `s3://munshot-research-raw/org_northstar/${attId}.pdf`,
    pageCount: pages,
    language: 'en',
    parseStatus,
    parseErrorMessage: null,
  }
}
