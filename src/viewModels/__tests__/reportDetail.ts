// Tests for the ReportDetail viewmodel's source / broker-provenance
// fields. Locks in the four-fact display contract the Report drawer's
// Source section depends on:
//   1. broker.name (the resolved research house)
//   2. brokerSender (the original sender inside the forwarded header)
//   3. forwardedBy (the person whose mailbox forwarded it in)
//   4. sourceEmail exposing senderAddress + forwardedFrom for completeness
//
// Calls buildReportDetailViewModel directly with synthesized inputs —
// no React, no adapter, no fixture loading.
// Run: npx tsx src/viewModels/__tests__/reportDetail.ts

import type {
  ResearchReport, Broker, BrokerEmail,
  BrokerId, EmailId, OrgId, ReportId, AttachmentId,
} from '../../domain'
import { buildReportDetailViewModel } from '../reportDetail'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

// ── Minimal fixture: an IIFL forwarded note for APOLLOHOSP ──────────────

const ORG = 'org_test' as unknown as OrgId
const REPORT_ID = 'rpt_apollo' as unknown as ReportId
const EMAIL_ID = 'eml_apollo' as unknown as EmailId
const BROKER_IIFL = 'brk_iifl' as unknown as BrokerId
const ATT_ID = 'att_apollo_body' as unknown as AttachmentId

const broker: Broker = {
  id: BROKER_IIFL,
  name: 'IIFL Securities',
  shortName: 'IIFL',
  senderDomains: ['iiflcap.com'],
  researchAliases: ['IIFLCAP'],
  coverageTags: [],
  brandColor: '#0a3d62',
  website: null,
}

const report: ResearchReport = {
  id: REPORT_ID,
  orgId: ORG,
  brokerId: BROKER_IIFL,
  sourceEmailId: EMAIL_ID,
  sourceAttachmentId: ATT_ID,
  title: 'Apollo Hospitals – Strong execution continues; 24/7 nearing break-even – BUY',
  publishedAt: '2026-05-23T09:00:00.000Z',
  receivedAt: '2026-05-23T09:05:00.000Z',
  reportType: 'flash',
  tickers: [],
  sectorIds: [],
  pageCount: null,
  language: 'en',
  status: 'ready',
  summaryId: null,
  brokerResolution: {
    brokerId: BROKER_IIFL,
    brokerCanonicalName: 'IIFL Securities',
    brokerSource: 'forwarded_body_header',
    brokerConfidence: 0.95,
    brokerEvidence: '*From:* Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>',
    resolutionClass: 'mapped',
    isMapped: true,
    isUnresolved: false,
    brokerConflict: false,
    evidenceTrail: [],
  },
  brokerStockConflict: false,
}

const sourceEmail: BrokerEmail = {
  id: EMAIL_ID,
  orgId: ORG,
  brokerId: BROKER_IIFL,
  senderAddress: 'simran@beascapital.in',
  senderName: 'Simran Thakkar',
  recipientAddress: 'ceekay@muns.io',
  subject: 'Fw: Apollo Hospitals – Strong execution continues; 24/7 nearing break-even – BUY',
  bodyPreview: '',
  receivedAt: '2026-05-23T09:05:00.000Z',
  forwardedFrom: ['rahul.jeewani@iiflcap.com'],
  attachmentIds: [ATT_ID],
  reportIds: [REPORT_ID],
  status: 'ready',
  statusMessage: null,
  sourceMessageId: 'mid_apollo',
}

const vm = buildReportDetailViewModel({
  report,
  summary: null,
  evidence: [],
  broker,
  stocks: [],
  sectors: [],
  sourceEmail,
  sourceAttachment: null,
  closure: null,
})

console.log('reportDetail viewmodel — source fields\n')

// ── Broker resolution ───────────────────────────────────────────────────
check('vm.broker.name === "IIFL Securities"', vm.broker.name === 'IIFL Securities', vm.broker.name)
check('vm.broker.shortName === "IIFL"', vm.broker.shortName === 'IIFL', vm.broker.shortName)

// ── brokerSender — parsed from the forwarded-header evidence ────────────
check('vm.brokerSender is non-null', vm.brokerSender !== null)
check('vm.brokerSender.name === "Rahul Jeewani"',
  vm.brokerSender?.name === 'Rahul Jeewani', String(vm.brokerSender?.name))
check('vm.brokerSender.email === "rahul.jeewani@iiflcap.com"',
  vm.brokerSender?.email === 'rahul.jeewani@iiflcap.com', String(vm.brokerSender?.email))
check('vm.brokerSender.organizationHint === "IIFLCAP"',
  vm.brokerSender?.organizationHint === 'IIFLCAP', String(vm.brokerSender?.organizationHint))
check('vm.brokerSender.raw preserves the original evidence',
  vm.brokerSender?.raw === '*From:* Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>',
  String(vm.brokerSender?.raw))

// ── forwardedBy — the person/system that forwarded the note IN ──────────
check('vm.forwardedBy is non-null when forwardedFrom is set',
  vm.forwardedBy !== null)
check('vm.forwardedBy.name === "Simran Thakkar"',
  vm.forwardedBy?.name === 'Simran Thakkar', String(vm.forwardedBy?.name))
check('vm.forwardedBy.email === "simran@beascapital.in"',
  vm.forwardedBy?.email === 'simran@beascapital.in', String(vm.forwardedBy?.email))

// ── sourceEmail extended fields ─────────────────────────────────────────
check('vm.sourceEmail.senderAddress exposed',
  vm.sourceEmail?.senderAddress === 'simran@beascapital.in',
  String(vm.sourceEmail?.senderAddress))
check('vm.sourceEmail.forwardedFrom exposed',
  Array.isArray(vm.sourceEmail?.forwardedFrom) && vm.sourceEmail!.forwardedFrom.length === 1)

// ── Direct broker email (no forwarder): forwardedBy must be null ────────
{
  const directEmail: BrokerEmail = {
    ...sourceEmail,
    forwardedFrom: [],
    senderAddress: 'research@iiflcap.com',
    senderName: 'IIFL Research',
  }
  const directVm = buildReportDetailViewModel({
    report, summary: null, evidence: [], broker, stocks: [], sectors: [],
    sourceEmail: directEmail, sourceAttachment: null, closure: null,
  })
  check('direct email (no forwarder): forwardedBy is null',
    directVm.forwardedBy === null, JSON.stringify(directVm.forwardedBy))
}

// ── Non-header resolver source: brokerSender hides cleanly ──────────────
{
  const subjectPrefixReport: ResearchReport = {
    ...report,
    brokerResolution: {
      ...report.brokerResolution!,
      brokerSource: 'subject_prefix',
      brokerEvidence: 'subject prefix [IIFL]',
    },
  }
  const sp = buildReportDetailViewModel({
    report: subjectPrefixReport, summary: null, evidence: [], broker,
    stocks: [], sectors: [],
    sourceEmail: { ...sourceEmail, forwardedFrom: [] },
    sourceAttachment: null, closure: null,
  })
  check('non-header source + no forwardedFrom: brokerSender null',
    sp.brokerSender === null, JSON.stringify(sp.brokerSender))
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
