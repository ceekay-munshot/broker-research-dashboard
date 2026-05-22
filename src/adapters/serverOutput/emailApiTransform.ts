// ─────────────────────────────────────────────────────────────────────────
// emailApiTransform — the /email/forwarded response → DashboardServerOutput.
//
// The forwarded-email API returns a paginated list of inbound emails. Each
// email carries `uploads` (one body + N attachments) and, on the uploads it
// could process, a `metadata.ner_results` map — entity name →
// { ticker, rating, tp } extracted server-side.
//
// The dashboard consumes a single `DashboardServerOutput` envelope. These
// pure functions bridge the two: they derive brokers, stocks, reports,
// summaries and per-(broker,ticker) opinions from the extracted output.
//
// Source-of-truth rules:
//   • Broker identity — recovered per source document by ./brokerResolver
//     from scored evidence (forwarded headers, domains, disclaimers, subject
//     prefixes), never the forwarder. Unresolved notes fall into honest
//     Unmapped Research House / Other Sources / Unknown Broker buckets.
//   • One report == one deduped document. Re-forwarded PDFs (same filename)
//     collapse; email bodies become their own reports.
//   • An extracted row is kept only when it carries a real rating or a real
//     target price. A short denylist drops obviously-wrong ticker matches
//     and non-company entities (regulators, accounting terms).
//   • Every documented response shape is accepted; pages are merged, emails
//     deduped by id, and sorted by received_at descending.
//
// Pure transforms: no React, no adapter, no fetch.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Organization, User, OrgScope, Iso8601,
  Broker, BrokerId, BrokerEmail, Attachment, Sector, Stock,
  ResearchReport, ReportSummary, ReportType, BrokerStockOpinion,
  KpiSnapshot, Rating, Stance, StockTicker, BrokerResolution,
} from '../../domain'
import {
  asOrgId, asUserId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asSectorId, asTicker,
} from '../../lib/ids'
import type { ConflictClosure } from '../../engine/types'
import { buildConflictClosure } from '../../engine/conflictClosure'
import type { DashboardServerOutput, FeedStatusPayload } from './types'
import { extractNoteInsight } from './noteInsight'
import { parseTp, validateTargetPrices } from './targetPrice'
import {
  buildEmailBrokerContext, resolveBrokerForNote, stripBrokerPrefixes,
  brokerRecordForResolution, mixedSourcesBroker, MIXED_SOURCES_BROKER_ID,
} from './brokerResolver'
import { classifyNoteEntity, STOCK_DISPLAY_THRESHOLD } from './entityRole'

// ── Raw wire shape ───────────────────────────────────────────────────────

interface RawNer { readonly tp?: unknown; readonly rating?: unknown; readonly ticker?: unknown }
interface RawDocument { readonly document_id?: unknown; readonly title?: unknown; readonly signed_url?: unknown }
interface RawUpload {
  readonly id?: unknown
  readonly type?: unknown
  readonly filename?: unknown
  readonly mime_type?: unknown
  readonly size_bytes?: unknown
  readonly metadata?: unknown
  readonly document?: RawDocument | null
}
interface RawEmail {
  readonly id?: unknown
  readonly forwarded_by_email?: unknown
  readonly original_sender_email?: unknown
  readonly original_sender_name?: unknown
  readonly subject?: unknown
  readonly text_body?: unknown
  readonly received_at?: unknown
  readonly uploads?: unknown
}

export interface EmailApiTransformOptions {
  /** Shift every timestamp so the newest email maps onto `now`, keeping the
   *  relative spacing of the rest. Lets the date-filtered "Today" surface
   *  show the freshest batch instead of rendering empty for an old sample. */
  readonly anchorToNow?: boolean
  /** Clock anchor. Defaults to `new Date()`. */
  readonly now?: Date
}

// ── Tenant constants (the raw feed has no org/user record) ───────────────

const ORG_ID = asOrgId('org_preview')
const USER_ID = asUserId('usr_preview')
const SECTOR_ID = asSectorId('sec_research_coverage')
const SCOPE: OrgScope = { orgId: ORG_ID, actingUserId: USER_ID }

// ── Extraction-noise filters ─────────────────────────────────────────────

/** Resolved tickers that the fuzzy matcher clearly got wrong. */
const BAD_TICKERS = new Set(['DEFENCE', 'SBISENSEX'])

/** NER entity names that are not companies (regulators, accounting terms,
 *  generic nouns the matcher latched onto). */
const ENTITY_STOPLIST = new Set([
  'RBI', 'SEBI', 'SEC', 'US SEC', 'NSE', 'BSE', 'BSE Ltd', 'AMFI', 'NISM',
  'BASL', 'EBITDA', 'OCF', 'AIF', 'AMC', 'Exchange', 'Stock Exchange',
  'Mutual Fund', 'Research Team', 'Securities',
])

// ── Small helpers ────────────────────────────────────────────────────────

function str(v: unknown): string { return typeof v === 'string' ? v : '' }

/** Map the NER rating vocabulary onto the dashboard's canonical Rating. */
function mapRating(raw: string): Rating | null {
  switch (raw.trim().toUpperCase()) {
    case 'BUY':        return 'Buy'
    case 'ADD':        return 'Overweight'
    case 'ACCUMULATE': return 'Overweight'
    case 'HOLD':       return 'Hold'
    case 'NEUTRAL':    return 'Hold'
    case 'REDUCE':     return 'Underweight'
    case 'SELL':       return 'Sell'
    default:           return null
  }
}

function stanceFromRating(r: Rating | null): Stance {
  if (r === 'Buy' || r === 'Overweight') return 'bullish'
  if (r === 'Sell' || r === 'Underweight') return 'bearish'
  return 'neutral'
}

/** Filename → human-readable report title. */
function cleanTitle(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s*\bbody\b\s*$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Keys the forwarded-email list can appear under, per the API doc's
 *  "alternate shapes" section. */
const EMAIL_LIST_KEYS = ['emails', 'forwarded_emails', 'forwardedEmails', 'items', 'results'] as const

/**
 * Pull the ForwardedEmail[] out of one `/email/forwarded` response,
 * accepting every documented shape:
 *   • canonical        `{ data: { emails: [...] } }`
 *   • root pagination  `{ data: { emails: [...] }, pagination: {...} }`
 *   • array in data    `{ data: [...] }`
 *   • bare array       `[...]`
 *   • alternate keys   `emails` / `forwarded_emails` / `forwardedEmails` /
 *                      `items` / `results`, at the root or under `data`.
 * An unrecognised shape yields `[]` — the dashboard then renders an honest
 * empty state rather than throwing.
 */
function extractForwardedEmails(raw: unknown): RawEmail[] {
  if (Array.isArray(raw)) return raw as RawEmail[]
  if (!raw || typeof raw !== 'object') return []

  const obj = raw as Record<string, unknown>
  const data = obj.data

  if (Array.isArray(data)) return data as RawEmail[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const k of EMAIL_LIST_KEYS) {
      if (Array.isArray(d[k])) return d[k] as RawEmail[]
    }
  }
  for (const k of EMAIL_LIST_KEYS) {
    if (Array.isArray(obj[k])) return obj[k] as RawEmail[]
  }
  return []
}

/** Dedupe forwarded emails by `id` (first occurrence wins) and sort by
 *  `received_at` descending — newest first. Emails with no id are kept
 *  (they cannot be deduped) and ordered last within the sort. */
function dedupeAndSortEmails(emails: readonly RawEmail[]): RawEmail[] {
  const byId = new Map<string, RawEmail>()
  const noId: RawEmail[] = []
  for (const e of emails) {
    const id = str(e.id).trim()
    if (!id) { noId.push(e); continue }
    if (!byId.has(id)) byId.set(id, e)
  }
  const receivedMs = (e: RawEmail): number => {
    const t = Date.parse(str(e.received_at))
    return Number.isFinite(t) ? t : 0
  }
  return [...byId.values(), ...noId].sort((a, b) => receivedMs(b) - receivedMs(a))
}

// ── Broker resolution ────────────────────────────────────────────────────
//
// Broker identity is recovered per source document by the deterministic
// resolver in ./brokerResolver — from scored evidence, never the forwarder.
// See that module for the evidence tiers and the Unmapped Research House /
// Other Sources / Unknown Broker fallback buckets.

/** The forwarder's display name for a forwarded email — surfaced as
 *  "Received via" in the UI, never used as the broker identity. */
function resolveSenderName(e: RawEmail): string {
  return str(e.original_sender_name).trim()
    || str(e.original_sender_email).trim()
    || str(e.forwarded_by_email).trim()
    || 'Unknown sender'
}

// ── Per-report extracted call ────────────────────────────────────────────

interface Candidate {
  readonly ticker: string
  readonly entityName: string
  readonly rating: Rating | null
  readonly tp: number | null
}

/** A candidate before target-price validation — carries the raw NER tp. */
interface RawCandidate {
  readonly ticker: string
  readonly entityName: string
  readonly rating: Rating | null
  readonly rawNerTp: string
  readonly parsedNerTp: number | null
}

/** Collapse a report's NER map into at most one Candidate per ticker.
 *  Two passes: collect raw candidates first so the candidate count is known,
 *  then validate each target price — explicit-TP recovery is scoped per
 *  candidate when the upload covers more than one stock. */
function candidatesFor(
  ner: Record<string, RawNer>,
  textBody: string,
  subject: string,
): Candidate[] {
  // Pass 1 — raw candidates (NER tp parsed, not yet validated), deduped by ticker.
  const byTicker = new Map<string, RawCandidate>()
  for (const [entityName, row] of Object.entries(ner)) {
    if (ENTITY_STOPLIST.has(entityName)) continue
    const ticker = str(row.ticker).trim()
    const tl = ticker.toLowerCase()
    if (!ticker || tl === 'no match' || tl === 'n/a' || BAD_TICKERS.has(ticker.toUpperCase())) continue
    const rating = mapRating(str(row.rating))
    const rawNerTp = str(row.tp)
    const parsedNerTp = parseTp(rawNerTp)
    if (rating === null && parsedNerTp === null) continue

    const prev = byTicker.get(ticker)
    if (!prev) {
      byTicker.set(ticker, { ticker, entityName, rating, rawNerTp, parsedNerTp })
    } else {
      const keepPrevTp = prev.parsedNerTp !== null
      byTicker.set(ticker, {
        ticker,
        entityName: entityName.length > prev.entityName.length ? entityName : prev.entityName,
        rating: prev.rating ?? rating,
        rawNerTp: keepPrevTp ? prev.rawNerTp : rawNerTp,
        parsedNerTp: prev.parsedNerTp ?? parsedNerTp,
      })
    }
  }

  // Pass 2 — validate target prices. Explicit-TP recovery is scoped per
  // candidate (run-ownership of the email text) so one stock's stated TP is
  // never assigned to another in a multi-stock email.
  const rawCandidates = [...byTicker.values()]
  const tps = validateTargetPrices(
    rawCandidates.map((rc) => ({
      companyName: rc.entityName,
      ticker: rc.ticker,
      rawNerTp: rc.rawNerTp,
    })),
    textBody,
    subject,
  )
  return rawCandidates.map((rc, i) => ({
    ticker: rc.ticker,
    entityName: rc.entityName,
    rating: rc.rating,
    tp: tps[i],
  }))
}

function inferReportType(title: string, isBody: boolean, isDigest: boolean): ReportType {
  if (isDigest) return 'morning_note'
  const t = title.toLowerCase()
  if (/morning|india daily|stock reco|daily/.test(t)) return 'morning_note'
  if (/result|earnings|[1-4]\s?q|q[1-4]/.test(t))     return 'earnings_review'
  if (/initiat/.test(t))                               return 'initiation'
  if (/preview/.test(t))                               return 'earnings_preview'
  if (isBody)                                          return 'flash'
  return 'update'
}

// ── A resolved report source, pre-assembly ───────────────────────────────

interface ReportSource {
  readonly reportId: ReturnType<typeof asReportId>
  readonly emailId: ReturnType<typeof asEmailId>
  readonly attachmentId: ReturnType<typeof asAttachmentId> | null
  readonly brokerId: BrokerId
  readonly brokerResolution: BrokerResolution
  readonly brokerStockConflict: boolean
  readonly title: string
  readonly receivedAt: Iso8601
  readonly isBody: boolean
  readonly candidates: readonly Candidate[]
  readonly reportType: ReportType
}

// ── Main transform ───────────────────────────────────────────────────────

/** Transform a single `/email/forwarded` response (any documented shape)
 *  into the dashboard envelope. */
export function emailApiResponseToServerOutput(
  raw: unknown,
  options: EmailApiTransformOptions = {},
): DashboardServerOutput {
  return buildServerOutputFromEmails(
    dedupeAndSortEmails(extractForwardedEmails(raw)),
    options,
  )
}

/** Transform the paginated loader's page responses into the dashboard
 *  envelope: every page is parsed, emails are merged, deduped by id, and
 *  sorted newest-first. */
export function emailApiPagesToServerOutput(
  rawPages: readonly unknown[],
  options: EmailApiTransformOptions = {},
): DashboardServerOutput {
  const merged = rawPages.flatMap((page) => extractForwardedEmails(page))
  return buildServerOutputFromEmails(dedupeAndSortEmails(merged), options)
}

function buildServerOutputFromEmails(
  rawEmails: readonly RawEmail[],
  options: EmailApiTransformOptions = {},
): DashboardServerOutput {
  const now = options.now ?? new Date()

  // Timestamp anchor: shift the whole set so the newest email lands on `now`.
  let delta = 0
  if (options.anchorToNow) {
    let newest = Number.NEGATIVE_INFINITY
    for (const e of rawEmails) {
      const ms = Date.parse(str(e.received_at))
      if (Number.isFinite(ms) && ms > newest) newest = ms
    }
    if (Number.isFinite(newest)) delta = now.getTime() - newest
  }
  const anchorIso = (iso: string): Iso8601 => {
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms)) return now.toISOString()
    return new Date(ms + delta).toISOString()
  }

  // Set true when an email's source documents resolve to more than one
  // research house — that email's brokerId becomes brk_mixed_sources.
  let anyMixedEmail = false

  const emails: BrokerEmail[] = []
  const attachments: Attachment[] = []
  const sources: ReportSource[] = []
  const seenAttachmentFiles = new Set<string>()
  // emailId → raw text_body, for deterministic note-insight extraction at
  // ReportSummary-construction time (the source loop below has no `text_body`).
  const textBodyByEmail = new Map<string, string>()

  for (const e of rawEmails) {
    const emailId = asEmailId(`eml_${str(e.id)}`)
    textBodyByEmail.set(emailId as unknown as string, str(e.text_body))
    const receivedAt = anchorIso(str(e.received_at))
    const rawUploads = Array.isArray(e.uploads) ? (e.uploads as RawUpload[]) : []
    const senderName = resolveSenderName(e)
    const brokerCtx = buildEmailBrokerContext({
      subject: str(e.subject),
      textBody: str(e.text_body),
      originalSenderEmail: str(e.original_sender_email),
      originalSenderName: str(e.original_sender_name),
      forwardedByEmail: str(e.forwarded_by_email),
    })

    const emailAttachmentIds: ReturnType<typeof asAttachmentId>[] = []
    // Broker ids resolved for this email's source documents.
    const emailBrokerIds: BrokerId[] = []

    for (const u of rawUploads) {
      const uploadId = str(u.id)
      if (!uploadId) continue
      const attachmentId = asAttachmentId(`att_${uploadId}`)
      const filename = str(u.filename)
      const isBody = str(u.type).toUpperCase() === 'BODY'

      attachments.push({
        id: attachmentId,
        orgId: ORG_ID,
        emailId,
        filename,
        mimeType: str(u.mime_type),
        sizeBytes: typeof u.size_bytes === 'number' ? u.size_bytes : 0,
        checksumSha256: '',
        storageRef: str(u.document?.document_id) || uploadId,
        sourceUrl: str(u.document?.signed_url) || null,
        pageCount: null,
        language: null,
        parseStatus: 'ready',
        parseErrorMessage: null,
      })
      emailAttachmentIds.push(attachmentId)

      // Does this upload carry extraction output worth a report?
      const meta = u.metadata
      const ner = meta && typeof meta === 'object'
        ? (meta as { ner_results?: unknown }).ner_results
        : undefined
      if (!ner || typeof ner !== 'object') continue

      // Dedupe re-forwarded attachments by filename; bodies are unique per
      // email, so they are never deduped.
      const fileKey = filename.trim().toLowerCase()
      if (!isBody) {
        if (seenAttachmentFiles.has(fileKey)) continue
        seenAttachmentFiles.add(fileKey)
      }

      const rawCandidates = candidatesFor(ner as Record<string, RawNer>, str(e.text_body), str(e.subject))
      const isDigest = rawCandidates.length >= 6
      // Strip the extension, then a leading broker label (research PDFs are
      // named "<House>_<Stock>_…"), then normalise underscores to spaces.
      const filenameNoExt = filename.replace(/\.[a-z0-9]+$/i, '')
      const filenameTitle =
        cleanTitle(stripBrokerPrefixes(filenameNoExt).cleanTitle || filenameNoExt)
      const title = isBody
        ? (stripBrokerPrefixes(str(e.subject)).cleanTitle || 'Email note')
        : (filenameTitle || cleanTitle(filename))

      // Resolve this source's broker — report-specific evidence (its own
      // filename) first, shared email-level evidence as fallback.
      const resolution = resolveBrokerForNote({ filename }, brokerCtx)
      emailBrokerIds.push(resolution.brokerId)

      // Note-scoped broker-vs-stock role: drop entities that are really the
      // research house; keep real companies (flag broker/stock overlaps).
      const noteCtx = {
        cleanTitle: title,
        proseText: brokerCtx.proseText,
        disclaimerText: brokerCtx.disclaimerText,
        brokerPrefixTokens: brokerCtx.brokerPrefixTokens,
      }
      let brokerStockConflict = false
      const candidates = rawCandidates.filter((c) => {
        const cls = classifyNoteEntity(
          {
            entityName: c.entityName, ticker: c.ticker,
            hasRating: c.rating !== null, hasTargetPrice: c.tp !== null,
          },
          noteCtx, resolution,
        )
        if (cls.role === 'broker_only') return false
        if (cls.role === 'unresolved' && cls.stockConfidence < STOCK_DISPLAY_THRESHOLD) return false
        if (cls.brokerStockConflict) brokerStockConflict = true
        return true
      })

      sources.push({
        reportId: asReportId(`rpt_${uploadId}`),
        emailId,
        attachmentId: isBody ? null : attachmentId,
        brokerId: resolution.brokerId,
        brokerResolution: resolution,
        brokerStockConflict,
        title,
        receivedAt,
        isBody,
        candidates,
        reportType: inferReportType(title, isBody, isDigest),
      })
    }

    // Email-level brokerId: the shared house when every source agrees, else
    // brk_mixed_sources. Downstream grouping uses report.brokerId, not this.
    const distinctEmailBrokers = new Set(emailBrokerIds)
    const emailBrokerId: BrokerId | null =
      distinctEmailBrokers.size === 0 ? null
      : distinctEmailBrokers.size === 1 ? emailBrokerIds[0]
      : MIXED_SOURCES_BROKER_ID
    if (distinctEmailBrokers.size > 1) anyMixedEmail = true

    emails.push({
      id: emailId,
      orgId: ORG_ID,
      brokerId: emailBrokerId,
      senderAddress: str(e.original_sender_email),
      senderName,
      recipientAddress: '',
      subject: str(e.subject),
      bodyPreview: str(e.text_body).slice(0, 240),
      receivedAt,
      forwardedFrom: str(e.forwarded_by_email) ? [str(e.forwarded_by_email)] : [],
      attachmentIds: emailAttachmentIds,
      reportIds: [],            // back-filled below
      status: 'ready',
      statusMessage: null,
      sourceMessageId: str(e.id),
    })
  }

  // ── Reports + summaries ────────────────────────────────────────────────

  const reports: ResearchReport[] = []
  const summaries: ReportSummary[] = []
  const reportIdsByEmail = new Map<string, ReturnType<typeof asReportId>[]>()

  // Opinion candidates: (broker, ticker) → latest call.
  interface OpinionAccum {
    readonly brokerId: BrokerId
    readonly ticker: string
    rating: Rating | null
    tp: number | null
    reportId: ReturnType<typeof asReportId>
    receivedAt: Iso8601
  }
  const opinionAccum = new Map<string, OpinionAccum>()
  const stockNames = new Map<string, string>()

  for (const src of sources) {
    const isDigest = src.reportType === 'morning_note' || src.reportType === 'sector_note'

    // Best stock name seen per ticker (longest entity name that isn't the
    // bare ticker itself).
    for (const c of src.candidates) {
      const prev = stockNames.get(c.ticker)
      const cand = c.entityName.trim()
      const usable = cand && cand.toUpperCase() !== c.ticker.toUpperCase()
      if (usable && (!prev || cand.length > prev.length)) stockNames.set(c.ticker, cand)
      else if (!prev) stockNames.set(c.ticker, c.ticker)
    }

    // Primary subject: the candidate whose name/ticker appears in the title,
    // preferring one that carries a rating; else the first rated candidate.
    const titleLc = src.title.toLowerCase()
    const inTitle = src.candidates.filter((c) =>
      titleLc.includes(c.entityName.toLowerCase()) || titleLc.includes(c.ticker.toLowerCase()),
    )
    const primary =
      inTitle.find((c) => c.rating !== null)
      ?? inTitle[0]
      ?? src.candidates.find((c) => c.rating !== null)
      ?? src.candidates[0]
      ?? null

    const reportTickers: StockTicker[] = isDigest
      ? src.candidates.map((c) => asTicker(c.ticker))
      : primary
        ? [asTicker(primary.ticker)]
        : []

    const summaryId = (!isDigest && primary && (primary.rating !== null || primary.tp !== null))
      ? asSummaryId(`sum_${src.reportId}`)
      : null

    reports.push({
      id: src.reportId,
      orgId: ORG_ID,
      brokerId: src.brokerId,
      sourceEmailId: src.emailId,
      sourceAttachmentId: src.attachmentId,
      title: src.title,
      publishedAt: src.receivedAt,
      receivedAt: src.receivedAt,
      reportType: src.reportType,
      tickers: reportTickers,
      sectorIds: [SECTOR_ID],
      pageCount: null,
      language: 'en',
      status: 'ready',
      summaryId,
      brokerResolution: src.brokerResolution,
      brokerStockConflict: src.brokerStockConflict,
    })

    if (summaryId && primary) {
      // Adapter-level MVP enrichment: mine the forwarded email body for a
      // thesis, key numbers, watchpoints and an action label. rating / TP
      // stay sourced from NER — the extractor only *adds* fields.
      const insight = extractNoteInsight({
        subject: src.title,
        textBody: textBodyByEmail.get(src.emailId as unknown as string) ?? '',
        rating: primary.rating,
        reportType: src.reportType,
        companyName: stockNames.get(primary.ticker) ?? primary.entityName,
        ticker: primary.ticker,
      })
      summaries.push({
        id: summaryId,
        orgId: ORG_ID,
        reportId: src.reportId,
        stance: stanceFromRating(primary.rating),
        rating: primary.rating,
        targetPrice: primary.tp,
        priorTargetPrice: null,
        targetCurrency: 'INR',
        thesis: insight.thesis ?? '',
        keyPoints: [],
        themes: [],
        risks: [],
        catalysts: [],
        confidence: 0.6,
        generatedAt: src.receivedAt,
        generatorVersion: 'email-api-preview',
        evidenceIds: [],
        keyNumbers: insight.keyNumbers,
        watchpoints: insight.watchpoints,
        upsidePct: insight.upsidePct,
        actionLabel: insight.actionLabel,
      })
    }

    const list = reportIdsByEmail.get(src.emailId as unknown as string) ?? []
    list.push(src.reportId)
    reportIdsByEmail.set(src.emailId as unknown as string, list)

    // Every rated/priced candidate contributes an opinion for this broker.
    for (const c of src.candidates) {
      if (c.rating === null && c.tp === null) continue
      const key = `${src.brokerId}|${c.ticker}`
      const prev = opinionAccum.get(key)
      if (!prev || src.receivedAt > prev.receivedAt) {
        opinionAccum.set(key, {
          brokerId: src.brokerId,
          ticker: c.ticker,
          rating: c.rating,
          tp: c.tp,
          reportId: src.reportId,
          receivedAt: src.receivedAt,
        })
      }
    }
  }

  // Back-fill each email's reportIds.
  for (const e of emails) {
    const ids = reportIdsByEmail.get(e.id as unknown as string)
    if (ids) (e as { reportIds: readonly ReturnType<typeof asReportId>[] }).reportIds = ids
  }

  // ── Opinions ───────────────────────────────────────────────────────────

  const opinions: BrokerStockOpinion[] = [...opinionAccum.values()].map((o) => ({
    orgId: ORG_ID,
    brokerId: o.brokerId,
    ticker: asTicker(o.ticker),
    rating: o.rating,
    stance: stanceFromRating(o.rating),
    targetPrice: o.tp,
    priorTargetPrice: null,
    targetCurrency: 'INR',
    lastReportId: o.reportId,
    lastUpdatedAt: o.receivedAt,
    impliedUpsidePct: null,
  }))

  // ── Stocks + sector ────────────────────────────────────────────────────

  const tickerSet = new Set(opinions.map((o) => o.ticker as unknown as string))
  const stocks: Stock[] = [...tickerSet].sort().map((t) => ({
    ticker: asTicker(t),
    name: stockNames.get(t) ?? t,
    sectorId: SECTOR_ID,
    currency: 'INR',
    exchange: 'NSE',
    lastPrice: null,
    lastPriceAsOf: null,
  }))

  const sectors: Sector[] = [{
    id: SECTOR_ID,
    name: 'Research Coverage',
    parentId: null,
    tickers: stocks.map((s) => s.ticker),
  }]

  // ── Broker catalog ─────────────────────────────────────────────────────
  // One entry per research house referenced by a report (the real catalog
  // entry for mapped houses, a synthetic neutral bucket for Unmapped Research
  // House / Other Sources / Unknown Broker), plus a zero-report Mixed Sources
  // entry when an email bundled several houses.

  const resolutionByBrokerId = new Map<string, BrokerResolution>()
  for (const src of sources) {
    const key = src.brokerId as unknown as string
    if (!resolutionByBrokerId.has(key)) resolutionByBrokerId.set(key, src.brokerResolution)
  }
  const brokerList: Broker[] = [...resolutionByBrokerId.values()].map(brokerRecordForResolution)
  if (anyMixedEmail) brokerList.push(mixedSourcesBroker())

  // KPI "brokers tracked" counts only genuine research houses.
  const researchHouseCount = [...resolutionByBrokerId.values()].filter(
    (r) => r.resolutionClass === 'mapped' || r.resolutionClass === 'unmapped_research_house',
  ).length

  // ── Conflict closures ──────────────────────────────────────────────────
  // Run the deterministic closure engine over every multi-broker ticker.
  // The Disagreements tab reads these directly (it does not infer from
  // opinions), so KIMS — covered by 5 houses — surfaces its Buy-vs-Sell
  // split here.

  const opinionsByTicker = new Map<string, BrokerStockOpinion[]>()
  for (const o of opinions) {
    const k = o.ticker as unknown as string
    const list = opinionsByTicker.get(k) ?? []
    list.push(o)
    opinionsByTicker.set(k, list)
  }
  const conflictClosures: ConflictClosure[] = []
  for (const [tkr, ops] of opinionsByTicker) {
    if (ops.length < 2) continue
    conflictClosures.push(buildConflictClosure({
      ticker: asTicker(tkr),
      opinions: ops,
      summaries,
      brokers: brokerList,
      evidence: [],
      asOf: now.toISOString(),
    }))
  }

  // ── KPI ────────────────────────────────────────────────────────────────

  const bullishTickers = new Set<string>()
  const bearishTickers = new Set<string>()
  for (const o of opinions) {
    if (o.stance === 'bullish') bullishTickers.add(o.ticker as unknown as string)
    if (o.stance === 'bearish') bearishTickers.add(o.ticker as unknown as string)
  }
  const divergenceFlags = [...bullishTickers].filter((t) => bearishTickers.has(t)).length

  const kpi: KpiSnapshot = {
    orgId: ORG_ID,
    asOf: now.toISOString(),
    brokersTracked: researchHouseCount,
    reportsIngested: reports.length,
    stocksCovered: stocks.length,
    divergenceFlags,
    windowDeltas: {
      brokersTracked:  { value: 0, windowDays: 30 },
      reportsIngested: { value: 0, windowDays: 7 },
      stocksCovered:   { value: 0, windowDays: 30 },
      divergenceFlags: { value: 0, windowDays: 7 },
    },
  }

  // ── Feed status ────────────────────────────────────────────────────────

  const todayKey = now.toISOString().slice(0, 10)
  const itemsToday = reports.filter((r) => r.receivedAt.slice(0, 10) === todayKey).length
  const feedStatus: FeedStatusPayload = {
    status: 'live',
    itemsToday,
    lastExtractionReceivedAt: reports.reduce<string | null>(
      (max, r) => (max === null || r.receivedAt > max ? r.receivedAt : max), null,
    ),
    lastSuccessfulSyncAt: now.toISOString(),
    message: null,
  }

  // ── Tenant ─────────────────────────────────────────────────────────────

  const organization: Organization = {
    id: ORG_ID,
    name: 'Vimana Capital Management',
    shortName: 'Vimana',
    forwardingAddress: '',
    createdAt: now.toISOString(),
    enabledBrokerIds: brokerList.map((b) => b.id),
    timeZone: 'Asia/Kolkata',
    defaultCurrency: 'INR',
  }
  const currentUser: User = {
    id: USER_ID,
    orgId: ORG_ID,
    email: 'ceekay@muns.io',
    displayName: 'Chiraag Kapil',
    role: 'admin',
    createdAt: now.toISOString(),
  }

  return {
    feedStatus,
    generatedAt: now.toISOString(),
    sessionScope: SCOPE,
    organization,
    currentUser,
    brokers: brokerList,
    sectors,
    stocks,
    kpi,
    emails,
    attachments,
    reports,
    summaries,
    evidence: [],
    opinions,
    conflictClosures,
    sectorIntelligence: [],
    portfolio: null,
    alerts: [],
    digests: [],
    calibrationSnapshot: null,
    brokerCalibrations: [],
    alertEffectiveness: [],
    coverageSignals: [],
    catalysts: [],
    preEventBriefs: [],
    postEventReviews: [],
    deliveries: [],
    orgUsageSnapshot: null,
    pilotRoiSnapshot: null,
    orgSettings: null,
    configAuditEntries: [],
    sessionSafety: null,
  }
}
