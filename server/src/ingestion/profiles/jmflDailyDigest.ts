import type { Profile, ProfileMatch, ProfileInput, ProfileOutputs, ReportCandidate } from './types'
import type { ParsedEmail, ParsedAttachment } from '../../eml/parse'
import {
  buildBrokerEmail, buildAttachmentRecords,
  emailIdOf, reportIdOf, summaryIdOf,
  makeReport, makeSummary, makeEvidence,
  inferTicker, inferStock, extractAddressFromHeader, inferReportType,
} from './common'
import { asBrokerId } from '../../../../src/lib/ids'
import { htmlToText } from '../../eml/html'
import type { EvidenceId, Stance } from '../../../../src/domain'

// Pattern B.2 — JMFL "Daily Financial Market Digest".
//
//   From:    jmfsebgresearch@jmfl.com
//   Subject: FW: JMFS Fundamental Research - Daily Financial Market Digest (<date>)
//   Body:    Top Corporate News & sector developments section containing a
//            series of entries of the shape
//              CompanyName: sentence explanation. Positive|Neutral|Negative
//
// One email = N report candidates (one per company line). Each carries a
// sentiment tag (Positive/Neutral/Negative) that maps directly to stance;
// there's usually no target price. We don't emit opinions here (no target),
// only news-flow report candidates.

const SENDER_ADDRESS = 'jmfsebgresearch@jmfl.com'

export const jmflDailyDigestProfile: Profile = {
  id: 'jmfl_daily_digest',

  matches(email: ParsedEmail, _attachments: readonly ParsedAttachment[]): ProfileMatch | null {
    const sender = extractAddressFromHeader(email.from)
    if (sender !== SENDER_ADDRESS) return null
    if (!/Daily\s+Financial\s+Market\s+Digest/i.test(email.subject)) return null
    return {
      profileId: 'jmfl_daily_digest',
      brokerId: asBrokerId('brk_jmfin'),
      confidenceReason: 'From jmfsebgresearch@jmfl.com + subject matches "Daily Financial Market Digest"',
    }
  },

  extract(input: ProfileInput): ProfileOutputs {
    const { email, orgId, brokerId, receivedAt, attachmentTexts } = input
    const messageId = email.messageId ?? `<jmfl-digest-${Date.now()}>`
    const emailId = emailIdOf(messageId)

    const attachmentRecords = buildAttachmentRecords({
      orgId, emailId, messageId,
      attachments: email.attachments,
      attachmentTexts,
    })

    const body = (email.bodyText && email.bodyText.length > 200)
      ? email.bodyText
      : (email.bodyHtml ? htmlToText(email.bodyHtml) : email.bodyText)

    const entries = splitDigestEntries(body)

    const candidates: ReportCandidate[] = []
    const reportIds: import('../../../../src/domain').ReportId[] = []

    entries.forEach((entry, idx) => {
      const slot = `dgt:${idx}:${slugify(entry.company)}`
      const reportId = reportIdOf(messageId, slot)
      const summaryId = summaryIdOf(messageId, slot)
      reportIds.push(reportId)

      const joinedText = `${entry.company} ${entry.summary}`
      const stock = inferStock(joinedText)
      const ticker = inferTicker(joinedText)
      const stance: Stance = entry.sentiment === 'Positive' ? 'bullish'
        : entry.sentiment === 'Negative' ? 'bearish'
        : 'neutral'
      const reportType = inferReportType(email.subject, entry.summary)

      // Single evidence sentence — the digest entry itself. Thesis-level.
      const ev = makeEvidence({
        orgId, reportId, summaryId,
        attachmentId: null,
        messageId, slot: `${slot}:thesis`,
        textSnippet: entry.summary.slice(0, 600),
        supportingField: 'thesis',
        fieldRef: '',
        pageNumber: 1,
      })
      const evidenceIds: readonly EvidenceId[] = [ev.id]

      const report = makeReport({
        orgId, brokerId, emailId,
        firstAttachmentId: null,
        messageId, slot,
        title: `${entry.company} — news flash`,
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
        stance, rating: null,
        targetPrice: null, priorTargetPrice: null,
        targetCurrency: null,
        thesis: entry.summary.slice(0, 420),
        keyPoints: [],
        themes: [],
        risks: [],
        confidence: 0.55,
        generatedAt: receivedAt,
        evidenceIds,
      })

      // No opinion — digest entries rarely carry a target price; keeping
      // the "never hallucinate a target" invariant.
      candidates.push({ report, summary, evidence: [ev], opinion: null })
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

// ── Digest entry splitter ────────────────────────────────────────

interface DigestEntry {
  readonly company: string
  readonly summary: string
  readonly sentiment: 'Positive' | 'Negative' | 'Neutral'
}

// Digest entries look like:
//
//   CompanyName: Sentence explaining the news. Positive
//
// (where "Positive" / "Negative" / "Neutral" is the trailing sentiment tag).
// Some entries span multiple sentences; the sentiment word always ends the
// paragraph. We split on the sentiment-word boundary.
function splitDigestEntries(body: string): DigestEntry[] {
  // Cut to the "Top Corporate News" region if present.
  const startIdx = body.search(/Top\s+Corporate\s+News/i)
  const trimmed = startIdx >= 0 ? body.slice(startIdx) : body

  const entries: DigestEntry[] = []
  // Regex captures:
  //   group 1: company name (up to colon)
  //   group 2: summary text (greedy but stops at sentiment tag)
  //   group 3: sentiment tag (Positive|Negative|Neutral)
  const re = /([A-Z][A-Za-z0-9&.,'\- ]{2,80}?):\s*([\s\S]{20,1200}?)\s+(Positive|Negative|Neutral)(?=\s|\.|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    const company = m[1]!.trim()
    // Skip entries that are actually sub-sections (e.g. "Top Corporate News").
    if (/^(Top|Daily|Market|Global|Economic|Sector|Company|Commodity|Currency|Fund|Monthly|Weekly|Source|Click)\b/i.test(company)) continue
    const summary = m[2]!.replace(/\s+/g, ' ').trim()
    const sentiment = m[3]! as DigestEntry['sentiment']
    if (summary.length < 20) continue
    entries.push({ company, summary, sentiment })
    if (entries.length >= 30) break
  }
  return entries
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32)
}
