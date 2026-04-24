import type { Profile, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import {
  buildBrokerEmail, buildAttachmentRecords,
  emailIdOf, reportIdOf, summaryIdOf,
  makeReport, makeSummary, makeEvidence, makeOpinion,
  inferRating, inferTargetPrice, inferTicker, inferStock,
  stanceForRating, extractAddressFromHeader, inferReportType,
} from './common'
import { asBrokerId } from '../../../../src/lib/ids'
import { htmlToText } from '../../eml/html'
import type { BrokerStockOpinion, EvidenceId } from '../../../../src/domain'

// Pattern B.1 — JMFL "India Morning Brief" forwarded digest.
//
// Key signals:
//   From:    jmfsebgresearch@jmfl.com
//   Subject: FW: JMFL: India Morning Brief (<date>): <comma list of names>
//   Body:    plaintext section with a top bulleted index followed by per-
//            company detail blocks of the shape:
//              CompanyName | Headline (URL)
//              <blank>
//              Rating            ADD     INR 1,490
//              <blank>
//              Body ...
//
// We split the body at each detail-block start ("CompanyName | Headline")
// and produce one ReportCandidate per section. Digest splitting is the
// whole point of this profile.

const SENDER_ADDRESS = 'jmfsebgresearch@jmfl.com'

export const jmflMorningBriefProfile: Profile = {
  id: 'jmfl_morning_brief',

  matches(email: ParsedEmail, _attachments: readonly ParsedAttachment[]): ProfileMatch | null {
    const sender = extractAddressFromHeader(email.from)
    if (sender !== SENDER_ADDRESS) return null
    if (!/JMFL:\s*India\s+Morning\s+Brief/i.test(email.subject)) return null
    return {
      profileId: 'jmfl_morning_brief',
      brokerId: asBrokerId('brk_jmfin'),
      confidenceReason: 'From jmfsebgresearch@jmfl.com + subject matches "JMFL: India Morning Brief"',
    }
  },

  extract(input: ProfileInput): ProfileOutputs {
    const { email, orgId, brokerId, receivedAt, attachmentTexts } = input
    const messageId = email.messageId ?? `<jmfl-mb-${Date.now()}>`
    const emailId = emailIdOf(messageId)

    const attachmentRecords = buildAttachmentRecords({
      orgId, emailId, messageId,
      attachments: email.attachments,
      attachmentTexts,
    })

    const body = (email.bodyText && email.bodyText.length > 200)
      ? email.bodyText
      : (email.bodyHtml ? htmlToText(email.bodyHtml) : email.bodyText)

    const sections = splitMorningBriefSections(body)

    const candidates: ReportCandidate[] = []
    const reportIds: import('../../../../src/domain').ReportId[] = []

    sections.forEach((section, idx) => {
      const slot = `mb:${idx}:${slugify(section.company)}`
      const reportId = reportIdOf(messageId, slot)
      const summaryId = summaryIdOf(messageId, slot)
      reportIds.push(reportId)

      const joined = `${section.company} ${section.headline}\n${section.body}`
      const stock = inferStock(joined)
      const ticker = inferTicker(joined)
      const rating = section.explicitRating ?? inferRating(joined)
      const target = section.explicitTarget ?? inferTargetPrice(joined)
      const stance = stanceForRating(rating)
      const reportType = inferReportType(section.headline || email.subject, section.body)

      // Evidence — first two sentences from the section body.
      const sentences = section.body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
      const thesisSentence = sentences[0] ?? section.headline
      const keyPointSentence = sentences[1] ?? ''
      const evidence: import('../../../../src/domain').EvidenceSnippet[] = []
      if (thesisSentence) {
        evidence.push(makeEvidence({
          orgId, reportId, summaryId,
          attachmentId: null,
          messageId, slot: `${slot}:thesis`,
          textSnippet: thesisSentence.slice(0, 600),
          supportingField: 'thesis',
          fieldRef: '',
          pageNumber: 1,
        }))
      }
      if (keyPointSentence) {
        evidence.push(makeEvidence({
          orgId, reportId, summaryId,
          attachmentId: null,
          messageId, slot: `${slot}:kp:0`,
          textSnippet: keyPointSentence.slice(0, 600),
          supportingField: 'keyPoint',
          fieldRef: '0',
          pageNumber: 1,
        }))
      }
      const evidenceIds = evidence.map((e): EvidenceId => e.id)

      const report = makeReport({
        orgId, brokerId, emailId,
        firstAttachmentId: null,
        messageId, slot,
        title: `${section.company} | ${section.headline}`.trim() || email.subject,
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
        targetPrice: target,
        priorTargetPrice: null,
        targetCurrency: stock?.currency ?? (target !== null ? 'INR' : null),
        thesis: thesisSentence.slice(0, 420),
        keyPoints: sentences.slice(0, 3),
        themes: [],
        risks: [],
        confidence: (rating !== null && target !== null) ? 0.7 : 0.5,
        generatedAt: receivedAt,
        evidenceIds,
      })

      const opinion: BrokerStockOpinion | null = (ticker && rating && target !== null)
        ? makeOpinion({
            orgId, brokerId, ticker, rating, stance,
            targetPrice: target,
            priorTargetPrice: null,
            currency: stock?.currency ?? 'INR',
            lastReportId: reportId,
            lastUpdatedAt: receivedAt,
            spotPrice: stock?.lastPrice ?? null,
          })
        : null

      candidates.push({ report, summary, evidence, opinion })
    })

    return {
      email: buildBrokerEmail({
        email, orgId, brokerId, receivedAt,
        attachmentIds: attachmentRecords.map((a) => a.id),
        reportIds,
      }),
      attachments: attachmentRecords,
      candidates,
    }
  },
}

// ── Section splitter ──────────────────────────────────────────────
//
// Morning-brief detail blocks open with the pattern
//
//   <Company Name> | <Headline>
//
// followed by a rating/target line (optional) and then body. We locate the
// detail blocks by scanning for " | " in lines that are short (< ~80 chars)
// AND where the preceding line is blank — this distinguishes the detail
// headers from the top-of-email bulleted index (which starts with "•  ").

interface BriefSection {
  readonly company: string
  readonly headline: string
  readonly body: string
  readonly explicitRating: import('../../../../src/domain').Rating | null
  readonly explicitTarget: number | null
}

function splitMorningBriefSections(body: string): BriefSection[] {
  // Drop the forwarding-preamble + top bulleted index so we start inside
  // the detail region. Heuristic: the detail region begins right after the
  // first line that ends in `Update` / `Weekly` / `Monthly` /
  // `Focus Report` section heading, OR the second "|"-containing line.
  const lines = body.split(/\r?\n/)
  const headerLineIndices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    // Likely a section header. Skip bulleted index entries (they start with
    // "•").
    if (line.startsWith('•')) continue
    if (line.startsWith('From:') || line.startsWith('Sent:') || line.startsWith('To:')) continue
    // Company | Headline detail header: contains " | " exactly once in the
    // visible portion, isn't too long (< 140 chars), and the next non-blank
    // line has rating/target signals.
    if (/ \| /.test(line) && line.length < 180 && !/^Subject:/i.test(line)) {
      // Must not be a navigation link line (long hyperlink).
      if (/^https?:\/\//i.test(line)) continue
      headerLineIndices.push(i)
    }
  }
  // The first occurrence is typically inside the top bulleted index (but we
  // skipped those via the • check); the second/third are detail headers.
  // Deduplicate by company name so we don't double-emit when the same name
  // appears in both the top summary and the detail region.
  const seen = new Set<string>()
  const sections: BriefSection[] = []
  for (let i = 0; i < headerLineIndices.length; i++) {
    const start = headerLineIndices[i]!
    const headerLine = lines[start]!.trim()
    // Split on the *first* pipe; headlines may contain slashes or ":".
    const pipe = headerLine.indexOf(' | ')
    const company = headerLine.slice(0, pipe).replace(/^[•\-*]\s*/, '').trim()
    const headline = headerLine.slice(pipe + 3).replace(/<[^>]+>/g, '').trim()
    const key = company.toLowerCase()
    if (seen.has(key)) continue
    // Only admit if there's a meaningful body below (i.e. not just the
    // bulleted-index entry). We take the next up to 35 lines until we hit
    // the next header.
    const end = (headerLineIndices[i + 1] ?? Math.min(start + 60, lines.length))
    const block = lines.slice(start + 1, end).join('\n').trim()
    // Skip detail-less index entries (block too small) — they'll be merged
    // with the detail section later.
    if (block.length < 40) continue
    seen.add(key)
    // Attempt to pull an explicit rating + target line: the three-token
    // "Rating Downgrade   ADD   INR 1,490" pattern seen in JMFL notes.
    let explicitRating: import('../../../../src/domain').Rating | null = null
    let explicitTarget: number | null = null
    const ratingLine = block.split(/\r?\n/).find((l) =>
      /(ADD|BUY|HOLD|REDUCE|SELL|NEUTRAL|OUTPERFORM)/i.test(l) && /INR\s*\d/.test(l))
    if (ratingLine) {
      explicitRating = inferRating(ratingLine)
      explicitTarget = inferTargetPrice(ratingLine)
    }
    sections.push({ company, headline, body: block, explicitRating, explicitTarget })
  }
  return sections
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32)
}
