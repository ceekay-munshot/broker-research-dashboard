import type { Profile, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import {
  buildBrokerEmail, buildAttachmentRecords,
  emailIdOf, reportIdOf, summaryIdOf,
  makeReport, makeSummary, makeEvidence, makeOpinion,
  inferRating, inferTargetPrice, inferPriorTarget, inferTicker, inferStock,
  stanceForRating, extractAddressFromHeader, inferReportType,
} from './common'
import { asBrokerId } from '../../../../src/lib/ids'
import { htmlToText } from '../../eml/html'
import type { BrokerStockOpinion, EvidenceId } from '../../../../src/domain'

// Pattern C — IIFL direct HTML-only email (no PDF attachment).
//
//   From:     joseph.george@iiflcap.com (or any @iiflcap.com)
//   Content:  single text/html body, research written inline.
//
// We HTML→text the body, then run the standard inference. One email = one
// report candidate. Evidence snippets come from the inline body.

export const iiflHtmlProfile: Profile = {
  id: 'iifl_html_single',

  matches(email: ParsedEmail, attachments: readonly ParsedAttachment[]): ProfileMatch | null {
    const sender = extractAddressFromHeader(email.from)
    if (!sender || !sender.endsWith('@iiflcap.com')) return null
    // Must have a body; no PDF requirement (this profile handles body-only).
    if (!email.bodyHtml && !email.bodyText) return null
    return {
      profileId: 'iifl_html_single',
      brokerId: asBrokerId('brk_iifl'),
      confidenceReason: attachments.length === 0
        ? 'From @iiflcap.com with no attachments (body-only)'
        : 'From @iiflcap.com (HTML body; attachments ignored)',
    }
  },

  extract(input: ProfileInput): ProfileOutputs {
    const { email, orgId, brokerId, receivedAt, attachmentTexts } = input
    const messageId = email.messageId ?? `<iifl-${Date.now()}>`
    const emailId = emailIdOf(messageId)

    // IIFL bodies sometimes carry inline images but the research is in the
    // HTML. We still record attachments for provenance.
    const attachmentRecords = buildAttachmentRecords({
      orgId, emailId, messageId,
      attachments: email.attachments,
      attachmentTexts,
    })

    const bodyRaw = email.bodyHtml ? htmlToText(email.bodyHtml) : email.bodyText
    // IIFL emails often include deeply nested signature/disclosure boilerplate
    // after the research. Clip at the first strong disclaimer marker.
    const body = clipAtDisclaimer(bodyRaw)

    const stock = inferStock(`${email.subject}\n${body}`)
    const ticker = inferTicker(`${email.subject}\n${body}`)
    const rating = inferRating(body)
    const target = inferTargetPrice(body)
    const prior = inferPriorTarget(body)
    const stance = stanceForRating(rating)
    const reportType = inferReportType(email.subject, body)

    const slot = 'root'
    const reportId = reportIdOf(messageId, slot)
    const summaryId = summaryIdOf(messageId, slot)

    // Evidence: first 3 non-trivial sentences.
    const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 30)
    const evidence: import('../../../../src/domain').EvidenceSnippet[] = []
    const picks: { field: 'thesis' | 'keyPoint'; text: string; ref: string }[] = []
    if (sentences[0]) picks.push({ field: 'thesis', text: sentences[0], ref: '' })
    sentences.slice(1, 3).forEach((s, i) => picks.push({ field: 'keyPoint', text: s, ref: String(i) }))
    picks.forEach((p, i) => evidence.push(makeEvidence({
      orgId, reportId, summaryId,
      attachmentId: null,
      messageId, slot: `${slot}:${p.field}:${i}`,
      textSnippet: p.text.slice(0, 600),
      supportingField: p.field,
      fieldRef: p.ref,
      pageNumber: 1,
    })))
    const evidenceIds = evidence.map((e): EvidenceId => e.id)

    const report = makeReport({
      orgId, brokerId, emailId,
      firstAttachmentId: attachmentRecords[0]?.id ?? null,
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
      targetPrice: target, priorTargetPrice: prior,
      targetCurrency: stock?.currency ?? (target !== null ? 'INR' : null),
      thesis: (sentences[0] ?? email.subject).slice(0, 420),
      keyPoints: sentences.slice(1, 5),
      themes: [],
      risks: [],
      confidence: (rating !== null && target !== null) ? 0.72 : 0.5,
      generatedAt: receivedAt,
      evidenceIds,
    })

    const opinion: BrokerStockOpinion | null = (ticker && rating && target !== null)
      ? makeOpinion({
          orgId, brokerId, ticker, rating, stance,
          targetPrice: target,
          priorTargetPrice: prior,
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

// Trim aggressive IIFL disclaimers / boilerplate so they don't dominate
// evidence selection. The real research always appears before these
// markers on the samples we've inspected.
function clipAtDisclaimer(text: string): string {
  const markers = [
    /\bDisclaimer\b/i,
    /\bIIFL\s+DISCLAIMER\b/i,
    /\bThis\s+communication\s+is\s+confidential/i,
    /\bStandard\s+Disclaimer\b/i,
  ]
  let min = text.length
  for (const m of markers) {
    const idx = text.search(m)
    if (idx >= 0 && idx < min) min = idx
  }
  return text.slice(0, min).trim()
}
