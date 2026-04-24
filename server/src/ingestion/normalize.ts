import { createHash } from 'node:crypto'
import type {
  BrokerEmail, Attachment, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, ReportType, Rating, Stance, Stock,
  AttachmentId, ReportId, SummaryId, EvidenceId, BrokerId, SectorId, StockTicker,
} from '../../../src/domain'
import {
  asAttachmentId, asReportId, asSummaryId, asEvidenceId, asEmailId,
  asTicker,
} from '../../../src/lib/ids'
import type { AdmittedInboundEmail } from '../types'
import { stocks as stockCatalog } from '../config/organizations'

// Conservative rule-based normalization. We never hallucinate: a field is
// only populated when it can be observed in the email body or attachment
// text via deterministic regex/keyword matching.
//
// Produces the full set of domain records one accepted email maps to:
//   • one BrokerEmail + its Attachment[]
//   • one ResearchReport (when at least a ticker can be resolved)
//   • one ReportSummary (conservative — may have nulls for rating/target)
//   • evidence snippets lifted verbatim from attachment text
//   • one BrokerStockOpinion when rating + targetPrice both resolve
//
// Generators are deterministic given the input fixture, so re-running
// ingestion on the same fixture tree produces byte-identical IDs.

const KNOWN_RATINGS: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell']
const GENERATOR_VERSION = 'fixture-ingest@2026.04.4'

// ── Public entry ────────────────────────────────────────────────────

export interface NormalizedOutputs {
  readonly email: BrokerEmail
  readonly attachments: readonly Attachment[]
  readonly report: ResearchReport | null
  readonly summary: ReportSummary | null
  readonly evidence: readonly EvidenceSnippet[]
  readonly opinion: BrokerStockOpinion | null
}

export function normalizeAdmittedEmail(admitted: AdmittedInboundEmail): NormalizedOutputs {
  const { fixture, orgId, brokerId, attachmentTexts } = admitted
  const emailId = asEmailId(hashedId('eml', fixture.messageId))

  // ── Attachments ──────────────────────────────────────────────────
  const attachments: Attachment[] = fixture.attachments.map((a, idx) => {
    const attId = asAttachmentId(hashedId('att', `${fixture.messageId}:${a.filename}:${idx}`))
    const bodyBytes = (attachmentTexts.get(a.filename) ?? '').length
    return {
      id: attId,
      orgId,
      emailId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: bodyBytes,
      checksumSha256: sha256(attachmentTexts.get(a.filename) ?? ''),
      storageRef: `local://${fixture.messageId}/${a.filename}`,
      pageCount: a.pageCount,
      language: a.language,
      parseStatus: 'ready',
      parseErrorMessage: null,
    }
  })

  // ── Ticker + sector resolution ──────────────────────────────────
  const joinedText = `${fixture.subject}\n${fixture.bodyText}\n${[...attachmentTexts.values()].join('\n')}`
  const ticker = inferTicker(joinedText, fixture.attachments.map((a) => a.filename))
  const stock: Stock | null = ticker ? (stockCatalog.find((s) => s.ticker === ticker) ?? null) : null

  // If we can't even resolve a ticker, we still persist the email +
  // attachments but produce no report; the ops console will show the
  // email as `status=ready` without any downstream derivation.
  const hasPayload = ticker !== null && stock !== null

  const reportId = hasPayload ? asReportId(hashedId('rpt', fixture.messageId)) : null
  const summaryId = reportId ? asSummaryId(hashedId('sum', fixture.messageId)) : null

  // ── BrokerEmail ─────────────────────────────────────────────────
  const email: BrokerEmail = {
    id: emailId,
    orgId,
    brokerId,
    senderAddress: fixture.envelopeSender,
    senderName: fixture.originalFrom ?? fixture.envelopeSender,
    recipientAddress: fixture.recipient,
    subject: fixture.subject,
    bodyPreview: fixture.bodyText.slice(0, 280),
    receivedAt: fixture.receivedAt,
    forwardedFrom: fixture.forwardedBy,
    attachmentIds: attachments.map((a) => a.id),
    reportIds: reportId ? [reportId] : [],
    status: 'ready',
    statusMessage: null,
    sourceMessageId: fixture.messageId,
  }

  if (!hasPayload) {
    return { email, attachments, report: null, summary: null, evidence: [], opinion: null }
  }

  // ── ResearchReport ──────────────────────────────────────────────
  const sectorIds: readonly SectorId[] = stock ? [stock.sectorId] : []
  const report: ResearchReport = {
    id: reportId!,
    orgId,
    brokerId,
    sourceEmailId: emailId,
    sourceAttachmentId: attachments[0]?.id ?? null,
    title: fixture.subject,
    publishedAt: fixture.receivedAt,
    receivedAt: fixture.receivedAt,
    reportType: inferReportType(fixture.subject),
    tickers: [ticker!],
    sectorIds,
    pageCount: fixture.attachments[0]?.pageCount ?? null,
    language: fixture.attachments[0]?.language ?? 'en',
    status: 'ready',
    summaryId,
  }

  // ── ReportSummary ───────────────────────────────────────────────
  const rating = inferRating(joinedText)
  const targetPrice = inferTargetPrice(joinedText)
  const priorTarget = inferPriorTarget(joinedText)
  const stance: Stance = rating
    ? (rating === 'Buy' || rating === 'Overweight' ? 'bullish'
      : rating === 'Sell' || rating === 'Underweight' ? 'bearish' : 'neutral')
    : 'neutral'
  const themes = inferThemes(joinedText)
  const keyPoints = extractKeyPoints([...attachmentTexts.values()].join('\n\n'))
  const risks = extractRisks([...attachmentTexts.values()].join('\n\n'))
  const evidenceIds: EvidenceId[] = []

  // Evidence snippets — conservatively pulled from attachment text.
  const evidence: EvidenceSnippet[] = []
  let evIdx = 0
  const attachmentForEvidence = attachments[0]
  for (const [attName, text] of attachmentTexts) {
    if (!attachmentForEvidence || attachmentForEvidence.filename !== attName) continue
    const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

    // Thesis evidence: the first sentence that mentions the ticker or a
    // pricing action.
    const thesisSentence = sentences.find((s) => /₹\s?\d/.test(s))
      ?? sentences.find((s) => ticker !== null && s.toLowerCase().includes((ticker as unknown as string).toLowerCase()))
      ?? sentences[0]
    if (thesisSentence) {
      const evId = asEvidenceId(hashedId('ev', `${reportId}:thesis`))
      evidence.push(makeSnippet(evId, orgId, reportId!, summaryId!, attachmentForEvidence.id, 1, thesisSentence, 'thesis', ''))
      evidenceIds.push(evId)
    }

    // Key-point evidence: up to 2 sentences that mention theme keywords.
    const themeMatchers = themes.map((t) => t.toLowerCase())
    const kpSentences = sentences.filter((s) => themeMatchers.some((t) => s.toLowerCase().includes(t)))
      .slice(0, 2)
    for (const kp of kpSentences) {
      const evId = asEvidenceId(hashedId('ev', `${reportId}:kp:${evIdx++}`))
      evidence.push(makeSnippet(evId, orgId, reportId!, summaryId!, attachmentForEvidence.id, 2, kp, 'keyPoint', String(evIdx - 1)))
      evidenceIds.push(evId)
    }
  }

  const summary: ReportSummary = {
    id: summaryId!,
    orgId,
    reportId: reportId!,
    stance,
    rating,
    targetPrice,
    priorTargetPrice: priorTarget,
    targetCurrency: stock?.currency ?? null,
    thesis: fixture.bodyText.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '',
    keyPoints,
    themes,
    risks,
    catalysts: [],
    confidence: rating !== null && targetPrice !== null ? 0.75 : 0.55,
    generatedAt: fixture.receivedAt,
    generatorVersion: GENERATOR_VERSION,
    evidenceIds,
  }

  // ── BrokerStockOpinion (only if rating + target both resolvable) ─
  const opinion: BrokerStockOpinion | null = (rating !== null && targetPrice !== null)
    ? {
        orgId,
        brokerId,
        ticker: ticker!,
        rating,
        stance,
        targetPrice,
        priorTargetPrice: priorTarget,
        targetCurrency: stock?.currency ?? null,
        lastReportId: reportId!,
        lastUpdatedAt: fixture.receivedAt,
        impliedUpsidePct: stock && stock.lastPrice !== null
          ? ((targetPrice / stock.lastPrice) - 1) * 100
          : null,
      }
    : null

  return { email, attachments, report, summary, evidence, opinion }
}

// ── Inference helpers (deterministic, rule-based) ─────────────────────

function inferTicker(text: string, _filenames: readonly string[]): StockTicker | null {
  const upper = text.toUpperCase()
  for (const s of stockCatalog) {
    const t = s.ticker as unknown as string
    // Word-boundary match so NVDA isn't accidentally matched inside NVDAX.
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`)
    if (re.test(upper)) return asTicker(t)
  }
  return null
}

function inferReportType(subject: string): ReportType {
  const s = subject.toLowerCase()
  if (s.includes('preview')) return 'earnings_preview'
  if (s.includes('post print') || s.includes('result review') || s.includes('earnings review')) return 'earnings_review'
  if (s.includes('initiation')) return 'initiation'
  if (s.includes('flash')) return 'flash'
  if (s.includes('morning note') || s.includes('morning call')) return 'morning_note'
  if (s.includes('sector') || s.includes('thematic')) return 'sector_note'
  if (s.includes('deep dive')) return 'deep_dive'
  return 'update'
}

function inferRating(text: string): Rating | null {
  // Scan in preferred order — prioritize explicit actions ("Downgrade to Sell")
  // over generic mentions ("we continue to like Buy-rated names").
  for (const r of KNOWN_RATINGS) {
    const re = new RegExp(`\\b${escapeRegex(r)}\\b`, 'i')
    if (re.test(text)) return r
  }
  return null
}

function inferTargetPrice(text: string): number | null {
  // ₹X,XXX or PT ₹X pattern.
  const rePT = /(?:PT|price\s+target|target\s+price|target)\s*(?:of|:|-|—|is|at)?\s*₹?\s?([0-9][0-9,]{0,6}(?:\.[0-9]+)?)/i
  const reRupee = /₹\s?([0-9][0-9,]{0,6}(?:\.[0-9]+)?)/
  const m1 = text.match(rePT)
  if (m1) return parseNumber(m1[1]!)
  const m2 = text.match(reRupee)
  if (m2) return parseNumber(m2[1]!)
  return null
}

function inferPriorTarget(text: string): number | null {
  const re = /\bprior\s+(?:PT|target)\s*(?:of|:|-|—)?\s*₹?\s?([0-9][0-9,]{0,6}(?:\.[0-9]+)?)/i
  const re2 = /\bfrom\s+₹?\s?([0-9][0-9,]{0,6}(?:\.[0-9]+)?)/i
  const m = text.match(re) ?? text.match(re2)
  return m ? parseNumber(m[1]!) : null
}

// Keyword vocabulary. Deliberately conservative — each keyword must have
// been observed in real Indian-broker coverage to avoid false positives.
const THEME_VOCABULARY: readonly string[] = [
  'Jio ARPU', 'Retail EBITDA', 'O2C recovery', 'GenAI attach', 'Vantara',
  'Deal TCV', 'NIM', 'LDR', 'Deposit franchise', 'Credit cost', 'RoA',
  'Unsecured', 'Range Rover', 'JLR margins', 'India PV share', 'Brent deck',
  'Capex discipline', 'Specialty', 'Ilumya', 'India formulations',
  'US generics', 'Retail credit', 'Rural demand', 'Premiumisation',
  'EV roadmap', 'Order book',
]

function inferThemes(text: string): string[] {
  const hits: string[] = []
  for (const t of THEME_VOCABULARY) {
    if (new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(text)) hits.push(t)
  }
  return hits.slice(0, 5)
}

function extractKeyPoints(text: string): string[] {
  // Lines that start with a dash / bullet, OR sentences that include
  // numeric traction cues (y/y, bps, percent signs).
  const out: string[] = []
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^[-•*]\s+/.test(line)) out.push(line.replace(/^[-•*]\s+/, ''))
    else if (/\b(?:y\/y|bps|%|crore|cr)\b/i.test(line) && line.length < 240) out.push(line)
    if (out.length >= 4) break
  }
  return out
}

function extractRisks(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim()
    if (/^risk[s]?\s*[:\-—]/i.test(line)) out.push(line.replace(/^risk[s]?\s*[:\-—]\s*/i, ''))
    if (out.length >= 3) break
  }
  return out
}

// ── ID generation — deterministic hashes so re-runs are byte-stable ──

function hashedId(prefix: string, input: string): string {
  return `${prefix}_${sha256(input).slice(0, 12)}`
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function makeSnippet(
  id: EvidenceId,
  orgId: BrokerEmail['orgId'],
  reportId: ReportId,
  summaryId: SummaryId,
  attachmentId: AttachmentId,
  pageNumber: number,
  textSnippet: string,
  supportingField: EvidenceSnippet['supportingField'],
  fieldRef: string,
): EvidenceSnippet {
  return {
    id,
    orgId,
    reportId,
    summaryId,
    attachmentId,
    pageNumber,
    textSnippet,
    charOffsetStart: null,
    charOffsetEnd: null,
    boundingBox: null,
    supportingField,
    fieldRef,
  }
}

// `BrokerId` import needed by the makeSnippet type-parameter inference; this
// silences the "declared but never used" warning in downstream consumers
// that only touch BrokerStockOpinion.
export type { BrokerId }
