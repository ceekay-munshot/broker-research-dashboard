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
//   • Broker identity — a research house is used only when the attachment
//     filename names it unambiguously (Ambit, Goldman Sachs, Kotak).
//     Otherwise the report is attributed honestly to whoever forwarded the
//     email (sender name → sender address → forwarding mailbox), keyed by
//     sender address so one sender stays one stable source. Never an
//     invented placeholder label.
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
  KpiSnapshot, Rating, Stance, StockTicker,
} from '../../domain'
import {
  asOrgId, asUserId, asBrokerId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asSectorId, asTicker,
} from '../../lib/ids'
import type { ConflictClosure } from '../../engine/types'
import { buildConflictClosure } from '../../engine/conflictClosure'
import type { DashboardServerOutput, FeedStatusPayload } from './types'

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
function slug(s: string): string { return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() }

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

/** Parse a target-price string: strips ₹, commas and spaces, then takes the
 *  first numeric run. `","`, `""`, `"N/A"`, non-positive values → null. */
function parseTp(raw: string): number | null {
  const m = raw.replace(/[,\s₹]/g, '').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) && n > 0 ? n : null
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

// ── Broker registry ──────────────────────────────────────────────────────
//
// Broker identity for one source document is resolved in priority order:
//   1. A research house recognised unambiguously from the attachment
//      filename (Ambit, Goldman Sachs, Kotak).
//   2. Otherwise the forwarded email's own sender — display name, then
//      sender address, then forwarding mailbox — keyed by sender address
//      so every report from one sender groups under a single source.
// No synthetic labels: an unrecognised source is shown honestly as whoever
// forwarded it.

interface BrokerRec {
  readonly id: BrokerId
  readonly name: string
  readonly shortName: string
  readonly color: string
}

const KNOWN_BROKERS: readonly {
  readonly test: RegExp
  readonly key: string
  readonly name: string
  readonly short: string
  readonly color: string
}[] = [
  { test: /ambit/i,                      key: 'ambit',     name: 'Ambit Capital',                short: 'Ambit',     color: '#d97757' },
  { test: /_gs_|\bgs\b/i,                key: 'gs',        name: 'Goldman Sachs',                short: 'GS',        color: '#6699cc' },
  { test: /morning insight|stock reco/i, key: 'kotak_sec', name: 'Kotak Securities',             short: 'Kotak Sec', color: '#e0a458' },
  { test: /india[ _]daily/i,             key: 'kie',       name: 'Kotak Institutional Equities', short: 'KIE',       color: '#c44e6b' },
]

/** A fixed palette for sender-resolved sources, so By Stock columns and
 *  broker dots stay visually distinct from one another. */
const SENDER_COLORS = ['#6b8e9e', '#9e8b6b', '#7d9e6b', '#9e6b8b', '#6b6b9e', '#8b9e6b'] as const

/** A forwarded email's sender identity, resolved once per email. */
interface SenderIdentity {
  /** Stable key — sender address where available; one sender = one source. */
  readonly key: string
  /** Display name: sender name → sender address → forwarding mailbox. */
  readonly name: string
}

/** Resolve a forwarded email's sender. Display falls back name → address →
 *  forwarding mailbox → "Unknown sender"; the key prefers the address so the
 *  same sender stays one stable source. */
function resolveSender(e: RawEmail): SenderIdentity {
  const senderEmail = str(e.original_sender_email).trim()
  const senderName  = str(e.original_sender_name).trim()
  const forwardedBy = str(e.forwarded_by_email).trim()
  return {
    key:  (senderEmail || forwardedBy || senderName || 'unknown').toLowerCase(),
    name: senderName || senderEmail || forwardedBy || 'Unknown sender',
  }
}

/** A tidy short label for a sender-resolved source: the email domain's
 *  first label where the display name is an address, else the name. */
function senderShortName(name: string): string {
  const at = name.indexOf('@')
  if (at < 0) return name
  const label = name.slice(at + 1).split('.')[0]
  return label || name.slice(0, at) || name
}

function makeBrokerRegistry() {
  const recs = new Map<string, BrokerRec>()
  let senderColorIdx = 0

  function ensure(key: string, make: () => BrokerRec): BrokerRec {
    const existing = recs.get(key)
    if (existing) return existing
    const rec = make()
    recs.set(key, rec)
    return rec
  }

  return {
    /** Resolve the broker for one source document within an email. */
    resolve(filename: string, sender: SenderIdentity): BrokerRec {
      // 1 — a research house named unambiguously by the filename.
      for (const k of KNOWN_BROKERS) {
        if (k.test.test(filename)) {
          return ensure(`house:${k.key}`, () => ({
            id: asBrokerId(`brk_${slug(k.key)}`),
            name: k.name, shortName: k.short, color: k.color,
          }))
        }
      }
      // 2 — otherwise the forwarding sender, keyed so one sender stays one
      //     source across every email and every attachment.
      return ensure(`sender:${sender.key}`, () => ({
        id: asBrokerId(`brk_sender_${slug(sender.key)}`),
        name: sender.name,
        shortName: senderShortName(sender.name),
        color: SENDER_COLORS[senderColorIdx++ % SENDER_COLORS.length],
      }))
    },
    all(): readonly BrokerRec[] { return [...recs.values()] },
  }
}

// ── Per-report extracted call ────────────────────────────────────────────

interface Candidate {
  readonly ticker: string
  readonly entityName: string
  readonly rating: Rating | null
  readonly tp: number | null
}

/** Collapse a report's NER map into at most one Candidate per ticker. */
function candidatesFor(ner: Record<string, RawNer>): Candidate[] {
  const byTicker = new Map<string, Candidate>()
  for (const [entityName, row] of Object.entries(ner)) {
    if (ENTITY_STOPLIST.has(entityName)) continue
    const ticker = str(row.ticker).trim()
    const tl = ticker.toLowerCase()
    if (!ticker || tl === 'no match' || tl === 'n/a' || BAD_TICKERS.has(ticker.toUpperCase())) continue
    const rating = mapRating(str(row.rating))
    const tp = parseTp(str(row.tp))
    if (rating === null && tp === null) continue

    const prev = byTicker.get(ticker)
    if (!prev) {
      byTicker.set(ticker, { ticker, entityName, rating, tp })
    } else {
      byTicker.set(ticker, {
        ticker,
        entityName: entityName.length > prev.entityName.length ? entityName : prev.entityName,
        rating: prev.rating ?? rating,
        tp: prev.tp ?? tp,
      })
    }
  }
  return [...byTicker.values()]
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
  readonly broker: BrokerRec
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

  const brokers = makeBrokerRegistry()

  const emails: BrokerEmail[] = []
  const attachments: Attachment[] = []
  const sources: ReportSource[] = []
  const seenAttachmentFiles = new Set<string>()

  for (const e of rawEmails) {
    const emailId = asEmailId(`eml_${str(e.id)}`)
    const receivedAt = anchorIso(str(e.received_at))
    const rawUploads = Array.isArray(e.uploads) ? (e.uploads as RawUpload[]) : []
    const sender = resolveSender(e)

    const emailAttachmentIds: ReturnType<typeof asAttachmentId>[] = []

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

      const candidates = candidatesFor(ner as Record<string, RawNer>)
      const isDigest = candidates.length >= 6
      const title = isBody ? (str(e.subject) || 'Email note') : cleanTitle(filename)
      const broker = brokers.resolve(filename, sender)

      sources.push({
        reportId: asReportId(`rpt_${uploadId}`),
        emailId,
        attachmentId: isBody ? null : attachmentId,
        broker,
        title,
        receivedAt,
        isBody,
        candidates,
        reportType: inferReportType(title, isBody, isDigest),
      })
    }

    emails.push({
      id: emailId,
      orgId: ORG_ID,
      brokerId: null,
      senderAddress: str(e.original_sender_email),
      senderName: sender.name,
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
      brokerId: src.broker.id,
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
    })

    if (summaryId && primary) {
      summaries.push({
        id: summaryId,
        orgId: ORG_ID,
        reportId: src.reportId,
        stance: stanceFromRating(primary.rating),
        rating: primary.rating,
        targetPrice: primary.tp,
        priorTargetPrice: null,
        targetCurrency: 'INR',
        thesis: '',
        keyPoints: [],
        themes: [],
        risks: [],
        catalysts: [],
        confidence: 0.6,
        generatedAt: src.receivedAt,
        generatorVersion: 'email-api-preview',
        evidenceIds: [],
      })
    }

    const list = reportIdsByEmail.get(src.emailId as unknown as string) ?? []
    list.push(src.reportId)
    reportIdsByEmail.set(src.emailId as unknown as string, list)

    // Every rated/priced candidate contributes an opinion for this broker.
    for (const c of src.candidates) {
      if (c.rating === null && c.tp === null) continue
      const key = `${src.broker.id}|${c.ticker}`
      const prev = opinionAccum.get(key)
      if (!prev || src.receivedAt > prev.receivedAt) {
        opinionAccum.set(key, {
          brokerId: src.broker.id,
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

  const brokerList: Broker[] = brokers.all().map((b) => ({
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    senderDomains: [],
    researchAliases: [],
    coverageTags: [],
    brandColor: b.color,
    website: null,
  }))

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
    brokersTracked: brokerList.length,
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
