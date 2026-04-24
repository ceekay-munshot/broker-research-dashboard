import type { Profile, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import {
  buildBrokerEmail, buildAttachmentRecords,
  emailIdOf, reportIdOf, summaryIdOf,
  makeReport, makeSummary, makeEvidence,
  inferTicker, inferStock, extractAddressFromHeader, inferReportType,
} from './common'
import { asBrokerId } from '../../../../src/lib/ids'
import type { EvidenceId } from '../../../../src/domain'

// Pattern B.3 — JMFL "Research of the Day".
//
//   From:     jmfsebgresearch@jmfl.com
//   Subject:  FW: Research of the Day
//   Content:  multipart/mixed containing an HTML digest body (list of
//             companies) PLUS a full research PDF (IndiaMorningBrief_*.pdf).
//
// Strategy: treat the PDF as the authoritative container (one parent
// report) and also split the inline HTML digest for navigation. For v1 we
// keep it simple: emit ONE report for the PDF (with the filename as title)
// and parse the inline HTML body as supporting evidence. The downstream
// JMFL Morning-Brief profile already handles the multi-company splitting;
// this profile's job is admission + "pdf is the artefact."

const SENDER_ADDRESS = 'jmfsebgresearch@jmfl.com'

export const jmflResearchOfDayProfile: Profile = {
  id: 'jmfl_research_of_day',

  matches(email: ParsedEmail, attachments: readonly ParsedAttachment[]): ProfileMatch | null {
    const sender = extractAddressFromHeader(email.from)
    if (sender !== SENDER_ADDRESS) return null
    if (!/Research\s+of\s+the\s+Day/i.test(email.subject)) return null
    const hasPdf = attachments.some((a) => a.mimeType === 'application/pdf')
    if (!hasPdf) return null
    return {
      profileId: 'jmfl_research_of_day',
      brokerId: asBrokerId('brk_jmfin'),
      confidenceReason: 'From jmfsebgresearch@jmfl.com + subject "Research of the Day" + PDF attached',
    }
  },

  extract(input: ProfileInput): ProfileOutputs {
    const { email, orgId, brokerId, receivedAt, attachmentTexts } = input
    const messageId = email.messageId ?? `<jmfl-rod-${Date.now()}>`
    const emailId = emailIdOf(messageId)

    const pdfs = email.attachments.filter((a) => a.mimeType === 'application/pdf')
    const attachmentRecords = buildAttachmentRecords({
      orgId, emailId, messageId,
      attachments: pdfs, // only PDFs, drop inline images
      attachmentTexts,
    })
    const firstAttachmentId = attachmentRecords[0]?.id ?? null

    const pdfName = pdfs[0]?.filename ?? 'Research of the Day'
    const pdfText = pdfs[0] ? (attachmentTexts.get(pdfs[0].filename) ?? '') : ''
    const inferredFrom = `${email.subject}\n${pdfName}\n${pdfText}`
    const stock = inferStock(inferredFrom)
    const ticker = inferTicker(inferredFrom)
    const reportType = inferReportType(email.subject, pdfText)

    const slot = 'rod'
    const reportId = reportIdOf(messageId, slot)
    const summaryId = summaryIdOf(messageId, slot)

    // Evidence: first two useful sentences from the PDF (if extractable).
    const sentences = pdfText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
    const evidence: import('../../../../src/domain').EvidenceSnippet[] = []
    if (sentences[0]) {
      evidence.push(makeEvidence({
        orgId, reportId, summaryId,
        attachmentId: firstAttachmentId,
        messageId, slot: `${slot}:thesis`,
        textSnippet: sentences[0].slice(0, 600),
        supportingField: 'thesis',
        fieldRef: '',
        pageNumber: 1,
      }))
    }
    if (sentences[1]) {
      evidence.push(makeEvidence({
        orgId, reportId, summaryId,
        attachmentId: firstAttachmentId,
        messageId, slot: `${slot}:kp:0`,
        textSnippet: sentences[1].slice(0, 600),
        supportingField: 'keyPoint',
        fieldRef: '0',
        pageNumber: 1,
      }))
    }
    const evidenceIds = evidence.map((e): EvidenceId => e.id)

    const report = makeReport({
      orgId, brokerId, emailId,
      firstAttachmentId,
      messageId, slot,
      title: pdfName.replace(/\.pdf$/i, '').replace(/_/g, ' '),
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
      stance: 'neutral', rating: null,
      targetPrice: null, priorTargetPrice: null,
      targetCurrency: null,
      thesis: sentences[0] ?? email.subject,
      keyPoints: sentences.slice(1, 4),
      themes: [],
      risks: [],
      confidence: 0.5,
      generatedAt: receivedAt,
      evidenceIds,
    })

    const candidate: ReportCandidate = { report, summary, evidence, opinion: null }
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
