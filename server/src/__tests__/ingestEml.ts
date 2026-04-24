import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAndProfileEml, listEmlFixtures } from '../ingestion/emlLoader'
import type { EmlLoadedAccepted } from '../ingestion/emlLoader'

// Golden-sample regression runner. Runs every .eml under
// server/fixtures/eml/ through the real parser + profile picker + extractor
// and asserts the expected shape for each. Invoke with `npm run server:test`.
//
// Prints a per-file summary. Exits 1 on any failed assertion. No test
// framework dependency — keeps the server runtime lean.

interface Expectation {
  readonly filename: string
  readonly accepted: boolean
  readonly profile?: string
  readonly brokerId?: string
  readonly orgId?: string
  readonly attachmentCountRange?: readonly [number, number]
  readonly candidateCountRange?: readonly [number, number]
  readonly pdfAttachmentsPresent?: boolean
  readonly digestSplit?: boolean
  readonly mustContainCompany?: readonly string[]
  readonly rejectionReason?: string
}

const EXPECTATIONS: readonly Expectation[] = [
  {
    filename: '23April2026_India_Daily.pdf.eml',
    accepted: true,
    profile: 'kotak_pdf',
    brokerId: 'brk_kotak',
    orgId: 'org_vimana',
    attachmentCountRange: [1, 1],
    candidateCountRange: [1, 1],
    pdfAttachmentsPresent: true,
    digestSplit: false,
  },
  {
    filename: 'Cyient  One Pager  Q4FY26  Result Update.eml',
    accepted: true,
    profile: 'kotak_pdf',
    brokerId: 'brk_kotak',
    orgId: 'org_vimana',
    attachmentCountRange: [1, 1],
    candidateCountRange: [1, 1],
    pdfAttachmentsPresent: true,
    digestSplit: false,
    mustContainCompany: ['Cyient'],
  },
  {
    filename: 'FW_ JMFL_ India Morning Brief (23 April 2026)_ Havells India, SBI Life Insurance, Tech Mahindra, Tata Communications, Sunteck Realty, PNC Infratech, ABB India, Strategy.eml',
    accepted: true,
    profile: 'jmfl_morning_brief',
    brokerId: 'brk_jmfin',
    orgId: 'org_vimana',
    attachmentCountRange: [0, 4],  // inline PNGs counted as attachments
    candidateCountRange: [3, 20],  // multi-item split (8 subjects × up to 2 region passes)
    digestSplit: true,
    mustContainCompany: ['Havells', 'SBI Life', 'Tech Mahindra'],
  },
  {
    filename: 'FW_ JMFS Fundamental Research - Daily Financial Market Digest  (24th April 2026).eml',
    accepted: true,
    profile: 'jmfl_daily_digest',
    brokerId: 'brk_jmfin',
    orgId: 'org_vimana',
    candidateCountRange: [3, 30],
    digestSplit: true,
  },
  {
    filename: 'FW_ Research of the Day.eml',
    accepted: true,
    profile: 'jmfl_research_of_day',
    brokerId: 'brk_jmfin',
    orgId: 'org_vimana',
    attachmentCountRange: [1, 1],  // counting only PDFs (inline image dropped)
    candidateCountRange: [1, 1],
    pdfAttachmentsPresent: true,
    digestSplit: false,
  },
  {
    filename: 'India Auto _ Competition heats up in mid-size SUVs.eml',
    accepted: true,
    profile: 'iifl_html_single',
    brokerId: 'brk_iifl',
    orgId: 'org_vimana',
    attachmentCountRange: [0, 2],
    candidateCountRange: [1, 1],
    digestSplit: false,
  },
  {
    filename: 'MORNING INSIGHT  24 APRIL 2026.eml',
    accepted: true,
    profile: 'kotak_pdf',
    brokerId: 'brk_kotak',
    orgId: 'org_vimana',
    attachmentCountRange: [1, 1],
    candidateCountRange: [1, 1],
    pdfAttachmentsPresent: true,
  },
  {
    filename: 'STOCK RECOMMENDATION  23 APRIL 2026.eml',
    accepted: true,
    profile: 'kotak_pdf',
    brokerId: 'brk_kotak',
    orgId: 'org_vimana',
    attachmentCountRange: [1, 1],
    candidateCountRange: [1, 1],
    pdfAttachmentsPresent: true,
  },
]

interface AssertionError { readonly file: string; readonly msg: string }

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(HERE, '..', '..', 'fixtures', 'eml')

async function main(): Promise<void> {
  const files = await listEmlFixtures(FIXTURES_DIR)
  const filenameMap = new Map<string, string>()
  for (const f of files) filenameMap.set(f.split('/').pop()!, f)

  const errors: AssertionError[] = []
  let passCount = 0

  console.log('┌─ eml regression ───────────────────────────────────────')

  for (const expect of EXPECTATIONS) {
    const abs = filenameMap.get(expect.filename)
    if (!abs) { errors.push({ file: expect.filename, msg: `fixture file missing under ${FIXTURES_DIR}` }); continue }

    const result = await loadAndProfileEml(abs)

    if (expect.accepted && result.kind !== 'accepted') {
      errors.push({ file: expect.filename, msg: `expected accepted, got ${result.kind}: ${result.kind === 'rejected' ? result.rejection.detail : ''}` })
      console.log(`│  ✗ ${expect.filename.slice(0, 54).padEnd(54, ' ')}  REJECTED`)
      continue
    }
    if (!expect.accepted && result.kind !== 'rejected') {
      errors.push({ file: expect.filename, msg: `expected rejected, got accepted` })
      continue
    }
    if (result.kind === 'rejected') {
      if (expect.rejectionReason && result.rejection.reason !== expect.rejectionReason) {
        errors.push({ file: expect.filename, msg: `rejection reason ${result.rejection.reason} ≠ expected ${expect.rejectionReason}` })
      }
      console.log(`│  ✓ ${expect.filename.slice(0, 54).padEnd(54, ' ')}  rejected=${result.rejection.reason}`)
      passCount += 1
      continue
    }

    const acc = result as EmlLoadedAccepted
    const { outputs, match } = acc

    if (expect.profile && match.profileId !== expect.profile) {
      errors.push({ file: expect.filename, msg: `profile ${match.profileId} ≠ ${expect.profile}` })
    }
    if (expect.brokerId && match.brokerId !== expect.brokerId) {
      errors.push({ file: expect.filename, msg: `broker ${match.brokerId} ≠ ${expect.brokerId}` })
    }
    if (expect.orgId && outputs.email.orgId !== expect.orgId) {
      errors.push({ file: expect.filename, msg: `orgId ${outputs.email.orgId} ≠ ${expect.orgId}` })
    }
    if (expect.attachmentCountRange) {
      const n = outputs.attachments.length
      const [lo, hi] = expect.attachmentCountRange
      if (n < lo || n > hi) errors.push({ file: expect.filename, msg: `attachments=${n} outside [${lo},${hi}]` })
    }
    if (expect.candidateCountRange) {
      const n = outputs.candidates.length
      const [lo, hi] = expect.candidateCountRange
      if (n < lo || n > hi) errors.push({ file: expect.filename, msg: `candidates=${n} outside [${lo},${hi}]` })
    }
    if (expect.pdfAttachmentsPresent) {
      const hasPdf = outputs.attachments.some((a) => a.mimeType === 'application/pdf')
      if (!hasPdf) errors.push({ file: expect.filename, msg: `expected a PDF attachment to be retained` })
    }
    if (expect.digestSplit !== undefined) {
      const isSplit = outputs.candidates.length > 1
      if (expect.digestSplit !== isSplit) {
        errors.push({ file: expect.filename, msg: `digestSplit=${isSplit} ≠ ${expect.digestSplit}` })
      }
    }
    if (expect.mustContainCompany) {
      const titles = outputs.candidates.map((c) => c.report.title.toLowerCase()).join(' || ')
      for (const needle of expect.mustContainCompany) {
        if (!titles.includes(needle.toLowerCase())) {
          errors.push({ file: expect.filename, msg: `expected a candidate title mentioning "${needle}"` })
        }
      }
    }
    // Evidence grounding — every ReportSummary.evidenceIds must match at
    // least one EvidenceSnippet in the corresponding candidate's evidence[].
    for (const c of outputs.candidates) {
      for (const eid of c.summary.evidenceIds) {
        if (!c.evidence.some((e) => e.id === eid)) {
          errors.push({ file: expect.filename, msg: `summary references evidenceId ${eid} but it isn't in the candidate's evidence array` })
        }
      }
    }

    console.log(`│  ✓ ${expect.filename.slice(0, 54).padEnd(54, ' ')}  profile=${match.profileId.padEnd(22, ' ')}  candidates=${outputs.candidates.length}`)
    passCount += 1
  }

  // Idempotency: re-run every accepted file and confirm identical IDs.
  const secondPass = new Map<string, string>()
  for (const expect of EXPECTATIONS.filter((e) => e.accepted)) {
    const abs = filenameMap.get(expect.filename)!
    const a = await loadAndProfileEml(abs)
    if (a.kind !== 'accepted') continue
    const b = await loadAndProfileEml(abs)
    if (b.kind !== 'accepted') continue
    const sig = a.outputs.candidates.map((c) => c.report.id as unknown as string).sort().join(',')
    const sig2 = b.outputs.candidates.map((c) => c.report.id as unknown as string).sort().join(',')
    if (sig !== sig2) errors.push({ file: expect.filename, msg: `idempotency: report IDs diverged on re-ingest (${sig} vs ${sig2})` })
    secondPass.set(expect.filename, sig)
  }

  console.log('└────────────────────────────────────────────────────────')
  console.log(`${passCount}/${EXPECTATIONS.length} assertions satisfied`)
  if (errors.length > 0) {
    console.log('\nFAILURES:')
    for (const e of errors) console.log(`  • [${e.file}] ${e.msg}`)
    process.exit(1)
  }
  console.log('\nall golden assertions OK + re-ingestion idempotent ✓')
}

main().catch((err) => {
  console.error('[eml-test] fatal', err)
  process.exit(1)
})
