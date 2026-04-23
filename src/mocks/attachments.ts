import type { Attachment } from '../domain'
import { asOrgId, asEmailId, asAttachmentId } from '../lib/ids'

// One attachment per email that carried a PDF. The skipped calendar-invite
// and disclaimer-only emails (eml_0029, eml_0030, eml_0038) have none.
//
// parseStatus mirrors the email's own status so the ops console can render a
// consistent view. The one `failed` row (att_0028) captures a realistic
// pipeline failure mode: a scanned / image-only PDF that needs OCR.
export const attachments: readonly Attachment[] = [
  // Aranya ready (parsed)
  mk('att_0001', 'eml_0001', 'RELIANCE_ResearchUpdate_20260422.pdf',   18, 'ready'),
  mk('att_0002', 'eml_0002', 'ONGC_Update_20260422.pdf',                22, 'ready'),
  mk('att_0003', 'eml_0003', 'INFY_Update_20260422.pdf',                14, 'ready'),
  mk('att_0004', 'eml_0004', 'TCS_Update_20260422.pdf',                 16, 'ready'),
  mk('att_0005', 'eml_0005', 'HDFCBANK_NIMDeepDive_20260422.pdf',       24, 'ready'),
  mk('att_0006', 'eml_0006', 'SUNPHARMA_Specialty_20260422.pdf',        28, 'ready'),
  mk('att_0007', 'eml_0007', 'LT_OrderBook_20260422.pdf',               12, 'ready'),
  mk('att_0008', 'eml_0008', 'MARUTI_VolumeOutlook_20260421.pdf',       15, 'ready'),
  mk('att_0009', 'eml_0009', 'TATAMOTORS_JLRMargins_20260418.pdf',      11, 'ready'),
  mk('att_0010', 'eml_0010', 'MARUTI_EVRoadmap_20260422.pdf',           17, 'ready'),
  mk('att_0011', 'eml_0011', 'RELIANCE_ModelUpdate_20260417.pdf',       10, 'ready'),
  mk('att_0012', 'eml_0012', 'ICICIBANK_Deposits_20260422.pdf',         19, 'ready'),
  mk('att_0013', 'eml_0013', 'DRREDDY_USPricing_20260416.pdf',          13, 'ready'),
  mk('att_0014', 'eml_0014', 'TCS_DealDeferrals_20260422.pdf',           9, 'ready'),
  mk('att_0015', 'eml_0015', 'ICICIBANK_Unsecured_20260414.pdf',        20, 'ready'),
  mk('att_0016', 'eml_0016', 'WIPRO_Transformation_20260415.pdf',       11, 'ready'),
  mk('att_0017', 'eml_0017', 'HCLTECH_ERDInflection_20260423.pdf',      23, 'ready'),
  mk('att_0018', 'eml_0018', 'INFY_DealRamp_20260423.pdf',              18, 'ready'),
  mk('att_0019', 'eml_0019', 'TATAMOTORS_RangeRover_20260423.pdf',      14, 'ready'),
  mk('att_0020', 'eml_0020', 'ONGC_BrentDeck_20260418.pdf',             21, 'ready'),
  mk('att_0021', 'eml_0021', 'HUL_Premiumisation_20260415.pdf',         12, 'ready'),
  mk('att_0022', 'eml_0022', 'SBIN_RetailCredit_20260419.pdf',          16, 'ready'),

  // Aranya in-flight
  mk('att_0023', 'eml_0023', 'LT_RestockCycle_20260423.pdf',            12, 'queued'),
  mk('att_0024', 'eml_0024', 'RELIANCE_Q4Update_20260423.pdf',          14, 'queued'),
  mk('att_0025', 'eml_0025', 'HDFCBANK_1QFY27_20260423.pdf',            11, 'queued'),
  mk('att_0026', 'eml_0026', 'CIPLA_RespiratoryUpdate_20260423.pdf',    19, 'parsing'),
  mk('att_0027', 'eml_0027', 'SBIN_AssetQualityDeep_20260423.pdf',      13, 'parsing'),
  mk('att_0028', 'eml_0028', 'IOC_ScannedReport_20260422.pdf',          22, 'failed',
     'pdf_extraction_failed: image-only pages, OCR worker unavailable'),

  // Aranya · extra coverage (att_0036..0039)
  mk('att_0036', 'eml_0039', 'TCS_GenAIAttach_20260423.pdf',            18, 'ready'),
  mk('att_0037', 'eml_0040', 'ICICIBANK_DepositFranchise_20260423.pdf', 14, 'ready'),
  mk('att_0038', 'eml_0041', 'TATAMOTORS_JLRRecovery_20260423.pdf',     12, 'ready'),
  mk('att_0039', 'eml_0042', 'RELIANCE_JioARPU_20260423.pdf',           16, 'ready'),

  // Sahyadri
  mkS('att_0029', 'eml_0031', 'RELIANCE_ResearchUpdate_20260422.pdf',   18, 'ready'),
  mkS('att_0030', 'eml_0032', 'TCS_GenAIUpdate_20260422.pdf',           24, 'ready'),
  mkS('att_0031', 'eml_0033', 'MARUTI_VolumeOutlook_20260421.pdf',      15, 'ready'),
  mkS('att_0032', 'eml_0034', 'INFY_DealRamp_20260421.pdf',             12, 'ready'),
  mkS('att_0033', 'eml_0035', 'TATAMOTORS_RangeRover_20260423.pdf',     23, 'ready'),
  mkS('att_0034', 'eml_0036', 'TATAMOTORS_PostEarnings_20260423.pdf',   15, 'queued'),
  mkS('att_0035', 'eml_0037', 'ONGC_Q4Preview_20260423.pdf',            18, 'parsing'),
]

// Helpers to trim the table above. They construct a default shape; anything
// non-default (the failed one) passes the extra argument.
function mk(
  attId: string, emailId: string, filename: string, pages: number,
  parseStatus: Attachment['parseStatus'], parseErrorMessage: string | null = null,
): Attachment {
  return {
    id: asAttachmentId(attId),
    orgId: asOrgId('org_aranya'),
    emailId: asEmailId(emailId),
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 380_000 + pages * 22_000,
    checksumSha256: `sha256:${filename}-${pages}`.padEnd(64, '0').slice(0, 71),
    storageRef: `s3://munshot-research-raw/org_aranya/${attId}.pdf`,
    pageCount: pages,
    language: 'en',
    parseStatus,
    parseErrorMessage,
  }
}

function mkS(
  attId: string, emailId: string, filename: string, pages: number,
  parseStatus: Attachment['parseStatus'],
): Attachment {
  return {
    id: asAttachmentId(attId),
    orgId: asOrgId('org_sahyadri'),
    emailId: asEmailId(emailId),
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 380_000 + pages * 22_000,
    checksumSha256: `sha256:${filename}-${pages}-sh`.padEnd(64, '0').slice(0, 71),
    storageRef: `s3://munshot-research-raw/org_sahyadri/${attId}.pdf`,
    pageCount: pages,
    language: 'en',
    parseStatus,
    parseErrorMessage: null,
  }
}
