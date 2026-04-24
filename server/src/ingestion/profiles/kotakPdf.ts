import type { Profile, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import {
  buildBrokerEmail, buildAttachmentRecords,
  emailIdOf, reportIdOf, summaryIdOf,
  makeReport, makeSummary, makeEvidence, makeOpinion,
  inferRating, inferTargetPrice, inferPriorTarget, inferReportType,
  inferTicker, inferStock, stanceForRating, extractAddressFromHeader,
} from './common'
import { asBrokerId } from '../../../../src/lib/ids'
import type { BrokerStockOpinion, EvidenceId } from '../../../../src/domain'

// Pattern A (see docs/ingestion-parser-profiles.md).
//
//   From:         "Kotak Neo" <kspcg.research@kotak.com>
//   Return-Path:  <comtrack.bounces@kotak.com>
//   Content-Type: multipart/mixed; boundary=...
//     - text/html (tiny or empty body)
//     - application/pdf (single attachment — the actual research)
//
// One email = one report. We use the subject + attachment filename as the
// report title and run conservative rating / target / ticker inference
// against the attachment text when the weak PDF extractor produced any,
// otherwise against the subject only.

const MATCHER = {
  envelopeDomain: 'kotak.com',
  returnPathAddress: 'comtrack.bounces@kotak.com',
}

export const kotakPdfProfile: Profile = {
  id: 'kotak_pdf',

  matches(email: ParsedEmail, attachments: readonly ParsedAttachment[]): ProfileMatch | null {
    const sender = extractAddressFromHeader(email.from)
    if (!sender || !sender.endsWith('@' + MATCHER.envelopeDomain)) return null
    const returnPath = extractAddressFromHeader(email.returnPath)
    const hasPdf = attachments.some((a) => a.mimeType === 'application/pdf')
    if (!hasPdf) return null
    const reason = returnPath === MATCHER.returnPathAddress
      ? 'From @kotak.com + return-path comtrack.bounces@kotak.com + PDF attachment'
      : 'From @kotak.com + PDF attachment'
    return {
      profileId: 'kotak_pdf',
      brokerId: asBrokerId('brk_kotak'),
      confidenceReason: reason,
    }
  },

  extract(input: ProfileInput): ProfileOutputs {
    const { email, orgId, brokerId, receivedAt, attachmentTexts } = input
    const messageId = email.messageId ?? `<kotak-synthetic-${Date.now()}>`
    const emailId = emailIdOf(messageId)

    // Only the PDF attachments become extraction sources; any image/png
    // "attachments" that sometimes show up in kotak HTML are dropped.
    const pdfs = email.attachments.filter((a) => a.mimeType === 'application/pdf')
    const attachmentRecords = buildAttachmentRecords({
      orgId, emailId, messageId,
      attachments: pdfs,
      attachmentTexts,
    })
    const firstAttachmentId = attachmentRecords[0]?.id ?? null

    // Build a single report candidate. Use the attachment filename as a
    // secondary hint for the company/ticker when the subject is generic
    // ("MORNING INSIGHT 24 APRIL 2026").
    const firstPdf = pdfs[0]
    const inferredText = `${email.subject}\n${firstPdf?.filename ?? ''}\n${
      firstPdf ? (attachmentTexts.get(firstPdf.filename) ?? '') : ''
    }`

    const stock = inferStock(inferredText)
    const ticker = inferTicker(inferredText)
    const rating = inferRating(inferredText)
    const targetPrice = inferTargetPrice(inferredText)
    const priorTargetPrice = inferPriorTarget(inferredText)
    const stance = stanceForRating(rating)
    const reportType = inferReportType(email.subject, inferredText)

    const slot = 'root'
    const reportId = reportIdOf(messageId, slot)
    const summaryId = summaryIdOf(messageId, slot)

    // Evidence sampling from the attachment text. Thesis = first sentence
    // that contains a ticker, a rating action word, or a ₹-prefixed number;
    // fallback = first non-empty sentence.
    const attachmentText = firstPdf ? (attachmentTexts.get(firstPdf.filename) ?? '') : ''
    const evidence = buildEvidenceFromAttachment({
      orgId, reportId, summaryId,
      attachmentId: firstAttachmentId,
      messageId,
      slot,
      attachmentText,
    })
    const evidenceIds = evidence.map((e): EvidenceId => e.id)

    const keyPoints = extractKeyPointsFromText(attachmentText).slice(0, 4)
    const themes = [] as string[]
    const risks: string[] = []
    const thesisLine =
      (attachmentText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).find((s) => /rating|target|recomm|initiat|buy|sell|hold|add|reduce/i.test(s))
        ?? email.subject).slice(0, 420)

    const report = makeReport({
      orgId, brokerId, emailId,
      firstAttachmentId,
      messageId, slot,
      title: email.subject,
      publishedAt: receivedAt,
      receivedAt,
      reportType,
      tickers: ticker ? [ticker] : [],
      sectorIds: stock ? [stock.sectorId] : [],
      pageCount: null,
      language: 'en',
      summaryId,
    })

    const summary = makeSummary({
      orgId, reportId, messageId, slot,
      stance, rating,
      targetPrice, priorTargetPrice,
      targetCurrency: stock?.currency ?? null,
      thesis: thesisLine,
      keyPoints,
      themes,
      risks,
      confidence: (rating !== null && targetPrice !== null) ? 0.72 : 0.5,
      generatedAt: receivedAt,
      evidenceIds,
    })

    const opinion: BrokerStockOpinion | null = (ticker && rating && targetPrice !== null)
      ? makeOpinion({
          orgId, brokerId,
          ticker,
          rating, stance,
          targetPrice,
          priorTargetPrice,
          currency: stock?.currency ?? 'INR',
          lastReportId: reportId,
          lastUpdatedAt: receivedAt,
          spotPrice: stock?.lastPrice ?? null,
        })
      : null

    const candidate: ReportCandidate = { report, summary, evidence, opinion }
    return {
      email: buildBrokerEmail({
        email, orgId, brokerId, receivedAt,
        attachmentIds: attachmentRecords.map((a) => a.id),
        reportIds: [reportId],
      }),
      attachments: attachmentRecords,
      candidates: [candidate],
    }
  },
}

// ── Evidence + key-point extraction helpers ───────────────────────

function buildEvidenceFromAttachment(args: {
  readonly orgId: ProfileInput['orgId']
  readonly reportId: import('../../../../src/domain').ReportId
  readonly summaryId: import('../../../../src/domain').SummaryId
  readonly attachmentId: import('../../../../src/domain').AttachmentId | null
  readonly messageId: string
  readonly slot: string
  readonly attachmentText: string
}) {
  const { orgId, reportId, summaryId, attachmentId, messageId, slot, attachmentText } = args
  if (!attachmentText) return []
  const sentences = attachmentText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  const picks: { field: 'thesis' | 'keyPoint'; text: string; fieldRef: string; page: number }[] = []

  const thesis = sentences.find((s) => /(?:₹|INR|Rs\.?|rating|target|buy|sell|hold|add|reduce)/i.test(s))
    ?? sentences[0]
  if (thesis) picks.push({ field: 'thesis', text: thesis, fieldRef: '', page: 1 })

  // Up to 3 supporting sentences mentioning numeric cues.
  const kp = sentences.filter((s) => /\b(?:\d+(?:\.\d+)?%|bps|y\/y|cr\.?|crore|growth|margin|TCV|FCF|FY2[6-9]|Q[1-4]FY)\b/i.test(s))
  kp.slice(0, 3).forEach((s, i) => picks.push({ field: 'keyPoint', text: s, fieldRef: String(i), page: 1 }))

  return picks.map((p, i) => makeEvidence({
    orgId, reportId, summaryId, attachmentId,
    messageId, slot: `${slot}:${p.field}:${i}`,
    textSnippet: p.text.slice(0, 600),
    supportingField: p.field,
    fieldRef: p.fieldRef,
    pageNumber: p.page,
  }))
}

function extractKeyPointsFromText(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^[•\-*]\s+/.test(line)) out.push(line.replace(/^[•\-*]\s+/, ''))
    else if (/\b(?:y\/y|bps|%|cr\.?|crore|growth|margin|q[1-4]fy|fy2[6-9])\b/i.test(line) && line.length < 320) out.push(line)
    if (out.length >= 4) break
  }
  return out
}
