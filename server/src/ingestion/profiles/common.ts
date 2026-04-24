import { createHash } from 'node:crypto'
import type {
  BrokerEmail, Attachment, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, ReportType, Rating, Stance,
  AttachmentId, ReportId, SummaryId, EvidenceId, EmailId, BrokerId, StockTicker,
  SectorId, OrgId, Stock,
  EvidenceSupportingField,
} from '../../../../src/domain'
import {
  asAttachmentId, asReportId, asSummaryId, asEvidenceId, asEmailId,
  asTicker,
} from '../../../../src/lib/ids'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import { stocks as stockCatalog } from '../../config/organizations'

// Shared helpers used by every profile's extractor. Everything here is
// deterministic — same input, same output — so re-ingesting the same .eml
// twice produces byte-identical records.

export const GENERATOR_VERSION = 'eml-ingest@2026.04.4'

// ── ID hashing ────────────────────────────────────────────────────

export function hashId(prefix: string, input: string): string {
  return `${prefix}_${sha256(input).slice(0, 12)}`
}
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}
export function emailIdOf(messageId: string): EmailId { return asEmailId(hashId('eml', messageId)) }
export function attachmentIdOf(messageId: string, filename: string, idx: number): AttachmentId {
  return asAttachmentId(hashId('att', `${messageId}:${filename}:${idx}`))
}
export function reportIdOf(messageId: string, slot = ''): ReportId {
  return asReportId(hashId('rpt', slot ? `${messageId}::${slot}` : messageId))
}
export function summaryIdOf(messageId: string, slot = ''): SummaryId {
  return asSummaryId(hashId('sum', slot ? `${messageId}::${slot}` : messageId))
}
export function evidenceIdOf(messageId: string, slot: string): EvidenceId {
  return asEvidenceId(hashId('ev', `${messageId}::${slot}`))
}

// ── Record builders ────────────────────────────────────────────────

export function buildBrokerEmail(args: {
  readonly email: ParsedEmail
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly receivedAt: string
  readonly attachmentIds: readonly AttachmentId[]
  readonly reportIds: readonly ReportId[]
}): BrokerEmail {
  const { email, orgId, brokerId, receivedAt, attachmentIds, reportIds } = args
  const sender = extractAddressFromHeader(email.from) ?? 'unknown@unknown'
  const senderName = extractDisplayNameFromHeader(email.from) ?? sender
  const messageId = email.messageId ?? `<no-message-id@${sha256(email.subject).slice(0, 12)}>`
  return {
    id: emailIdOf(messageId),
    orgId,
    brokerId,
    senderAddress: sender,
    senderName,
    recipientAddress: extractAddressFromHeader(email.to ?? email.deliveredTo) ?? '',
    subject: email.subject,
    bodyPreview: email.bodyText.slice(0, 280),
    receivedAt,
    forwardedFrom: extractForwardedFrom(email),
    attachmentIds,
    reportIds,
    status: 'ready',
    statusMessage: null,
    sourceMessageId: messageId,
  }
}

export function buildAttachmentRecords(args: {
  readonly orgId: OrgId
  readonly emailId: EmailId
  readonly messageId: string
  readonly attachments: readonly ParsedAttachment[]
  readonly attachmentTexts: ReadonlyMap<string, string>
}): Attachment[] {
  const { orgId, emailId, messageId, attachments, attachmentTexts } = args
  return attachments.map((a, idx) => {
    const id = attachmentIdOf(messageId, a.filename, idx)
    const text = attachmentTexts.get(a.filename) ?? ''
    return {
      id,
      orgId,
      emailId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.data.length,
      checksumSha256: sha256(a.data),
      storageRef: `local-eml://${messageId}/${a.filename}`,
      pageCount: null,
      language: 'en',
      parseStatus: text.length > 0 ? 'ready' : (a.mimeType === 'application/pdf' ? 'failed' : 'ready'),
      parseErrorMessage: text.length === 0 && a.mimeType === 'application/pdf'
        ? 'pdf_extraction_weak: no text produced by weak extractor; OCR/pdf-parse not wired'
        : null,
    }
  })
}

// ── Rating / target / ticker inference ─────────────────────────────

export const RATINGS: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'Not Rated']

// Canonical mapping of broker-specific rating vocabulary → canonical Rating.
const RATING_SYNONYMS: readonly { readonly pattern: RegExp; readonly rating: Rating }[] = [
  { pattern: /\bBUY\b/i,                  rating: 'Buy' },
  { pattern: /\bADD\b/i,                  rating: 'Overweight' },   // Kotak / JMFL ADD
  { pattern: /\bACCUMULATE\b/i,           rating: 'Overweight' },
  { pattern: /\bOUTPERFORM\b/i,           rating: 'Overweight' },
  { pattern: /\bOVERWEIGHT\b/i,           rating: 'Overweight' },
  { pattern: /\bHOLD\b/i,                 rating: 'Hold' },
  { pattern: /\bNEUTRAL\b/i,              rating: 'Hold' },
  { pattern: /\bREDUCE\b/i,               rating: 'Underweight' },  // Kotak REDUCE
  { pattern: /\bUNDERPERFORM\b/i,         rating: 'Underweight' },
  { pattern: /\bUNDERWEIGHT\b/i,          rating: 'Underweight' },
  { pattern: /\bSELL\b/i,                 rating: 'Sell' },
  { pattern: /\bNOT\s*RATED\b|\bNR\b/i,   rating: 'Not Rated' },
]

export function inferRating(text: string): Rating | null {
  for (const syn of RATING_SYNONYMS) {
    if (syn.pattern.test(text)) return syn.rating
  }
  return null
}

export function stanceForRating(rating: Rating | null): Stance {
  if (!rating) return 'neutral'
  if (rating === 'Buy' || rating === 'Overweight') return 'bullish'
  if (rating === 'Sell' || rating === 'Underweight') return 'bearish'
  return 'neutral'
}

// INR target price. Accepts `INR 1,490`, `₹1,490`, `PT 1,490`, etc.
const TARGET_PATTERNS: readonly RegExp[] = [
  /(?:TP|target\s*price|price\s*target|target|PT)\s*[:\-—]?\s*(?:INR|Rs\.?|₹)?\s*([0-9][0-9,]{0,7}(?:\.[0-9]+)?)/i,
  /(?:INR|Rs\.?|₹)\s*([0-9][0-9,]{0,7}(?:\.[0-9]+)?)/i,
]
export function inferTargetPrice(text: string): number | null {
  for (const p of TARGET_PATTERNS) {
    const m = text.match(p)
    if (m) return toNumber(m[1]!)
  }
  return null
}

const PRIOR_PATTERNS: readonly RegExp[] = [
  /\bprior\s+(?:PT|target)\s*(?:of|:|-|—)?\s*(?:INR|Rs\.?|₹)?\s*([0-9][0-9,]{0,7}(?:\.[0-9]+)?)/i,
  /\bfrom\s+(?:INR|Rs\.?|₹)?\s*([0-9][0-9,]{0,7}(?:\.[0-9]+)?)/i,
]
export function inferPriorTarget(text: string): number | null {
  for (const p of PRIOR_PATTERNS) {
    const m = text.match(p)
    if (m) return toNumber(m[1]!)
  }
  return null
}

export function inferTicker(text: string): StockTicker | null {
  const upper = text.toUpperCase()
  for (const s of stockCatalog) {
    const t = s.ticker as unknown as string
    if (new RegExp(`\\b${escapeRegex(t)}\\b`).test(upper)) return asTicker(t)
  }
  return null
}

// Broader company → ticker mapping: the .eml samples mention names like
// "Havells India", "SBI Life Insurance", "Tech Mahindra" that don't appear
// in the catalog. We still want to create a report candidate under the
// company name even without a ticker mapping; the UI shows the name string,
// and downstream analytics fall back gracefully.
export function inferStock(text: string): Stock | null {
  const ticker = inferTicker(text)
  if (!ticker) return null
  return stockCatalog.find((s) => s.ticker === ticker) ?? null
}

export function inferReportType(subject: string, body = ''): ReportType {
  const s = `${subject}\n${body}`.toLowerCase()
  if (/\b(earnings\s*)?(preview)\b/.test(s)) return 'earnings_preview'
  if (/\bresult\s*update\b|\bresults?\s*review\b|\bq[1-4]\s*fy\d+\b.*update/.test(s)) return 'earnings_review'
  if (/\binitiation\b/.test(s)) return 'initiation'
  if (/\bflash\b/.test(s)) return 'flash'
  if (/\bmorning\s*(insight|brief|call|note)\b/.test(s)) return 'morning_note'
  if (/\bstock\s*recommendation\b/.test(s)) return 'update'
  if (/\bsector\b|\bthematic\b|\bindia\s+auto\b/.test(s)) return 'sector_note'
  if (/\bdeep\s*dive\b/.test(s)) return 'deep_dive'
  if (/\bdigest\b|\bmarket\s*digest\b|\bresearch\s*of\s*the\s*day\b/.test(s)) return 'morning_note'
  return 'other'
}

// ── Record constructors ───────────────────────────────────────────

export function makeReport(args: {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly emailId: EmailId
  readonly firstAttachmentId: AttachmentId | null
  readonly messageId: string
  readonly slot: string
  readonly title: string
  readonly publishedAt: string
  readonly receivedAt: string
  readonly reportType: ReportType
  readonly tickers: readonly StockTicker[]
  readonly sectorIds: readonly SectorId[]
  readonly pageCount: number | null
  readonly language: string
  readonly summaryId: SummaryId
}): ResearchReport {
  return {
    id: reportIdOf(args.messageId, args.slot),
    orgId: args.orgId,
    brokerId: args.brokerId,
    sourceEmailId: args.emailId,
    sourceAttachmentId: args.firstAttachmentId,
    title: args.title,
    publishedAt: args.publishedAt,
    receivedAt: args.receivedAt,
    reportType: args.reportType,
    tickers: args.tickers,
    sectorIds: args.sectorIds,
    pageCount: args.pageCount,
    language: args.language,
    status: 'ready',
    summaryId: args.summaryId,
  }
}

export function makeSummary(args: {
  readonly orgId: OrgId
  readonly reportId: ReportId
  readonly messageId: string
  readonly slot: string
  readonly stance: Stance
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: string | null
  readonly thesis: string
  readonly keyPoints: readonly string[]
  readonly themes: readonly string[]
  readonly risks: readonly string[]
  readonly confidence: number
  readonly generatedAt: string
  readonly evidenceIds: readonly EvidenceId[]
}): ReportSummary {
  return {
    id: summaryIdOf(args.messageId, args.slot),
    orgId: args.orgId,
    reportId: args.reportId,
    stance: args.stance,
    rating: args.rating,
    targetPrice: args.targetPrice,
    priorTargetPrice: args.priorTargetPrice,
    targetCurrency: args.targetCurrency,
    thesis: args.thesis,
    keyPoints: args.keyPoints,
    themes: args.themes,
    risks: args.risks,
    catalysts: [],
    confidence: args.confidence,
    generatedAt: args.generatedAt,
    generatorVersion: GENERATOR_VERSION,
    evidenceIds: args.evidenceIds,
  }
}

export function makeEvidence(args: {
  readonly orgId: OrgId
  readonly reportId: ReportId
  readonly summaryId: SummaryId
  readonly attachmentId: AttachmentId | null
  readonly messageId: string
  readonly slot: string
  readonly textSnippet: string
  readonly supportingField: EvidenceSupportingField
  readonly fieldRef: string
  readonly pageNumber: number
}): EvidenceSnippet {
  return {
    id: evidenceIdOf(args.messageId, args.slot),
    orgId: args.orgId,
    reportId: args.reportId,
    summaryId: args.summaryId,
    attachmentId: args.attachmentId ?? (asAttachmentId('att_inline') as AttachmentId),
    pageNumber: args.pageNumber,
    textSnippet: args.textSnippet,
    charOffsetStart: null,
    charOffsetEnd: null,
    boundingBox: null,
    supportingField: args.supportingField,
    fieldRef: args.fieldRef,
  }
}

export function makeOpinion(args: {
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly ticker: StockTicker
  readonly rating: Rating
  readonly stance: Stance
  readonly targetPrice: number
  readonly priorTargetPrice: number | null
  readonly currency: string
  readonly lastReportId: ReportId
  readonly lastUpdatedAt: string
  readonly spotPrice: number | null
}): BrokerStockOpinion {
  const impliedUpsidePct = args.spotPrice !== null
    ? ((args.targetPrice / args.spotPrice) - 1) * 100
    : null
  return {
    orgId: args.orgId,
    brokerId: args.brokerId,
    ticker: args.ticker,
    rating: args.rating,
    stance: args.stance,
    targetPrice: args.targetPrice,
    priorTargetPrice: args.priorTargetPrice,
    targetCurrency: args.currency,
    lastReportId: args.lastReportId,
    lastUpdatedAt: args.lastUpdatedAt,
    impliedUpsidePct,
  }
}

// ── Header / text helpers ─────────────────────────────────────────

export function extractAddressFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const m = header.match(/<([^>]+)>/)
  if (m) return m[1]!.trim().toLowerCase()
  const m2 = header.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/)
  return m2 ? m2[0].toLowerCase() : null
}

export function extractDisplayNameFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const m = header.match(/^([^<]+?)\s*<[^>]+>/)
  if (m) return m[1]!.replace(/^"|"$/g, '').trim()
  return null
}

export function extractForwardedFrom(email: ParsedEmail): readonly string[] {
  const chain: string[] = []
  const body = email.bodyText
  const forwardedRegex = /From:\s*([^<\n\r]+?(?:<[^>]+>)?)[\n\r]/g
  let m: RegExpExecArray | null
  while ((m = forwardedRegex.exec(body)) !== null) {
    const addr = extractAddressFromHeader(m[1])
    if (addr) chain.push(addr)
    if (chain.length >= 5) break
  }
  return chain
}

export function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function pickSentence(text: string, matcher: RegExp): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  return sentences.find((s) => matcher.test(s)) ?? null
}
