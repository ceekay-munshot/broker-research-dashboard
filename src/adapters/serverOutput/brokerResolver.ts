// ─────────────────────────────────────────────────────────────────────────
// brokerResolver — recover a forwarded research note's broker/research house.
//
// Forwarded broker research names the *forwarder* (the person who relayed the
// mail) in its sender fields, never the research house. The house is recovered
// deterministically from scored evidence:
//
//   • a structured broker field (if the wire ever carries one)
//   • a `From:` header embedded in the forwarded body          (strongest)
//   • a research-house name / domain in the body or attachment filename
//   • the original sender's domain
//   • a `[IIFL]` / `Kotak:` subject prefix                      (weakest)
//
// Resolution is per source document: the attachment's own filename is tried
// first (report-specific); shared email-level evidence is the fallback. Every
// signal is evaluated, the highest-confidence one wins, and disagreeing
// signals are recorded (`brokerConflict` + `evidenceTrail`) for QA. When no
// catalogued house resolves, the note falls into one of three honest buckets —
// Unmapped Research House, Other Sources, or Unknown Broker — never a person.
//
// Pure functions: no React, no fetch. The catalog (src/mocks/brokers.ts) is
// the single extendable alias/domain map.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Broker, BrokerId, BrokerResolution, BrokerSource, ResolutionClass,
} from '../../domain'
import { asBrokerId } from '../../lib/ids'
import { brokers as BROKER_CATALOG } from '../../mocks/brokers'
import { stocks as STOCK_CATALOG } from '../../mocks/stocks'

// ── Synthetic bucket ids (not catalog research houses) ───────────────────

export const OTHER_SOURCES_BROKER_ID = asBrokerId('brk_other_sources')
export const UNKNOWN_BROKER_ID = asBrokerId('brk_unknown')
export const MIXED_SOURCES_BROKER_ID = asBrokerId('brk_mixed_sources')

const NEUTRAL_COLOR = '#6b7280'
const UNMAPPED_COLOR = '#94a3b8'

/** Catalog display order — real research houses first, then unmapped houses,
 *  then the non-broker / unresolved buckets last (Other Sources, Unknown). */
export const RESOLUTION_CLASS_ORDER: Record<ResolutionClass, number> = {
  mapped: 0,
  unmapped_research_house: 1,
  other_source: 2,
  unknown: 3,
}

// ── Inputs ────────────────────────────────────────────────────────────────

/** Email-level fields the resolver reads (built by the caller from RawEmail). */
export interface NoteBrokerInput {
  readonly subject: string
  readonly textBody: string
  readonly originalSenderEmail: string
  readonly originalSenderName: string
  readonly forwardedByEmail: string
  /** A structured broker string, when the wire ever carries one. */
  readonly structuredBroker?: string | null
}

/** One source document within an email — its own filename is report-specific. */
export interface NoteSourceInput {
  readonly filename: string
}

// ── Small helpers ─────────────────────────────────────────────────────────

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'yahoo.co.in', 'rediffmail.com', 'icloud.com', 'live.com', 'aol.com',
])

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
}

/** Lowercase, strip punctuation, collapse whitespace — for alias equality. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return ''
  return email.slice(at + 1).toLowerCase().replace(/[>,;\s].*$/, '').trim()
}

function localPartOf(email: string): string {
  const at = email.indexOf('@')
  return (at < 0 ? email : email.slice(0, at)).toLowerCase().trim()
}

// ── Catalog index ─────────────────────────────────────────────────────────

const CATALOG_BY_ID: ReadonlyMap<BrokerId, Broker> =
  new Map(BROKER_CATALOG.map((b) => [b.id, b]))

/** domain → broker, for every senderDomain in the catalog. */
const DOMAIN_INDEX: ReadonlyMap<string, Broker> = (() => {
  const m = new Map<string, Broker>()
  for (const b of BROKER_CATALOG) {
    for (const d of b.senderDomains) m.set(d.toLowerCase(), b)
  }
  return m
})()

/** normalized name/shortName/alias → broker, for exact-token lookups. */
const ALIAS_INDEX: ReadonlyMap<string, Broker> = (() => {
  const m = new Map<string, Broker>()
  for (const b of BROKER_CATALOG) {
    for (const a of [b.name, b.shortName, ...b.researchAliases]) {
      const k = normalize(a)
      if (k && !m.has(k)) m.set(k, b)
    }
  }
  return m
})()

/** Multi-character house phrases for scanning free body / filename text. */
const BODY_PHRASES: readonly { broker: Broker; phrase: string; norm: string }[] = (() => {
  const out: { broker: Broker; phrase: string; norm: string }[] = []
  for (const b of BROKER_CATALOG) {
    for (const a of [b.name, ...b.researchAliases]) {
      const norm = normalize(a)
      if (norm.length >= 5) out.push({ broker: b, phrase: a, norm })
    }
  }
  return out
})()

const KNOWN_TICKERS: ReadonlySet<string> =
  new Set(STOCK_CATALOG.map((s) => (s.ticker as unknown as string).toUpperCase()))

/** Resolve an email domain to a catalog broker — exact, then parent-domain. */
function brokerByDomain(domain: string): Broker | null {
  if (!domain) return null
  const exact = DOMAIN_INDEX.get(domain)
  if (exact) return exact
  for (const [d, b] of DOMAIN_INDEX) {
    if (domain.endsWith('.' + d)) return b
  }
  return null
}

/** Resolve a free-text token (subject prefix, header name) to a catalog broker. */
function brokerByAlias(token: string): Broker | null {
  return ALIAS_INDEX.get(normalize(token)) ?? null
}

/** Scan a blob of text for catalog domains and house phrases. */
function scanTextForBrokers(
  text: string,
): { broker: Broker; count: number; evidence: string }[] {
  const lower = text.toLowerCase()
  const normText = ' ' + normalize(text) + ' '
  const hits = new Map<BrokerId, { broker: Broker; count: number; evidence: string }>()
  const bump = (b: Broker, evidence: string): void => {
    const prev = hits.get(b.id)
    if (prev) prev.count += 1
    else hits.set(b.id, { broker: b, count: 1, evidence })
  }
  // Domains — boundary-guarded so `gs.com` never matches inside `drugs.com`.
  for (const [domain, broker] of DOMAIN_INDEX) {
    const re = new RegExp('(?:^|[^a-z0-9-])' + escapeRegExp(domain) + '(?![a-z0-9-])', 'i')
    if (re.test(lower)) bump(broker, domain)
  }
  // Multi-character house phrases.
  for (const { broker, phrase, norm } of BODY_PHRASES) {
    if (normText.includes(' ' + norm + ' ')) bump(broker, phrase)
  }
  return [...hits.values()].sort((a, b) => b.count - a.count)
}

// ── Subject-prefix stripping ──────────────────────────────────────────────

/**
 * Strip leading reply noise (`Fwd:`/`Re:`) and broker labels (`[IIFL]`,
 * `Kotak:`) from a subject. A `[X]` / `X:` token is treated as a broker label
 * only when it resolves to a catalog house — so company-named subjects like
 * "Zydus Lifescience: …" are left intact.
 */
export function stripBrokerPrefixes(
  subject: string,
): { cleanTitle: string; prefixTokens: string[] } {
  let s = (subject ?? '').trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^\s*(?:fwd?|fw|re)\s*:\s*/i, '')
  }
  const tokens: string[] = []
  // Bracketed labels — may repeat: "[IIFL] [Update] …".
  for (;;) {
    const m = s.match(/^\s*\[([^\]]{1,28})\]\s*/)
    if (!m) break
    const tok = m[1].trim()
    if (brokerByAlias(tok)) { tokens.push(tok); s = s.slice(m[0].length) }
    else break
  }
  // A single leading "House: …" / "House - …" / "House_…" label — research
  // PDFs are commonly named "<House>_<Stock>_<…>" or "<House> - <Stock> - …".
  // The separator is explicit (`:`, a spaced dash, or `_`), so the token is a
  // whole field and "Axis Bank …" is never mistaken for the broker "Axis".
  const cm = s.match(/^\s*([A-Za-z][A-Za-z0-9 .&'-]{1,26}?)(?:\s*:\s+|\s+[-–—]\s+|\s*_+\s*)/)
  if (cm) {
    const tok = cm[1].trim()
    if (brokerByAlias(tok)) { tokens.push(tok); s = s.slice(cm[0].length) }
  }
  return { cleanTitle: s.trim(), prefixTokens: tokens }
}

// ── Email body parsing ────────────────────────────────────────────────────

interface FromHeader {
  readonly raw: string
  readonly display: string
  readonly email: string
  readonly domain: string
}

/** Parse every `From:` / `*From:*` header embedded in a forwarded body, in
 *  document order (outermost forward first, original sender last). */
function parseFromHeaders(body: string): FromHeader[] {
  const out: FromHeader[] = []
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*\*?\s*from\s*:\*?\s*(.+?)\s*$/i)
    if (!m) continue
    const rest = m[1]
    const angle = rest.match(/<\s*([^<>\s]+@[^<>\s]+?)\s*>/)
    const bare = angle ? null : rest.match(/[^\s<>"]+@[^\s<>"]+/)
    const email = (angle?.[1] ?? bare?.[0] ?? '').replace(/[.,;]+$/, '')
    const display = rest.replace(/<[^>]*>/g, '').replace(/[",]/g, ' ').trim()
    out.push({ raw: line.trim(), display, email, domain: domainOf(email) })
  }
  return out
}

const DISCLAIMER_MARKER =
  /^(?:disclaimer\b|important\s+disclosures?|this\s+(?:message|e-?mail|communication)\b|regd?\.?\s+office|registered\s+office|compliance\s+officer\b|sebi\s+research\s+analyst)/i

/** Split a body into research prose and the trailing disclaimer/signature. */
function splitBody(body: string): { prose: string; disclaimer: string } {
  const lines = body.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (DISCLAIMER_MARKER.test(lines[i].trim())) {
      return { prose: lines.slice(0, i).join('\n'), disclaimer: lines.slice(i).join('\n') }
    }
  }
  return { prose: body, disclaimer: '' }
}

// ── Email broker context (parsed once per email) ──────────────────────────

export interface EmailBrokerContext {
  readonly subject: string
  readonly cleanTitle: string
  readonly brokerPrefixTokens: readonly string[]
  readonly textBody: string
  readonly proseText: string
  readonly disclaimerText: string
  readonly hasForwardedHeaders: boolean
  readonly originalSenderEmail: string
  readonly originalSenderName: string
  readonly forwardedByEmail: string
  readonly structuredBroker: string | null
  // Pre-resolved signals shared by every source in the email.
  readonly headerBrokers: readonly { broker: Broker; depth: number; evidence: string }[]
  readonly bodyBrokers: readonly { broker: Broker; count: number; evidence: string }[]
  readonly senderDomainBroker: Broker | null
  readonly subjectPrefixBrokers: readonly { broker: Broker; token: string }[]
  readonly fromHeaders: readonly FromHeader[]
}

export function buildEmailBrokerContext(input: NoteBrokerInput): EmailBrokerContext {
  const body = input.textBody ?? ''
  const fromHeaders = parseFromHeaders(body)
  const { cleanTitle, prefixTokens } = stripBrokerPrefixes(input.subject ?? '')
  const { prose, disclaimer } = splitBody(body)

  const headerBrokers: { broker: Broker; depth: number; evidence: string }[] = []
  fromHeaders.forEach((h, idx) => {
    const b = brokerByDomain(h.domain)
    if (b) headerBrokers.push({ broker: b, depth: idx, evidence: h.raw })
  })

  const subjectPrefixBrokers: { broker: Broker; token: string }[] = []
  for (const token of prefixTokens) {
    const b = brokerByAlias(token)
    if (b && !KNOWN_TICKERS.has(token.toUpperCase())) {
      subjectPrefixBrokers.push({ broker: b, token })
    }
  }

  const hasForwardedHeaders =
    fromHeaders.length > 0 ||
    /-{3,}\s*forwarded message|begin forwarded message/i.test(body)

  return {
    subject: input.subject ?? '',
    cleanTitle,
    brokerPrefixTokens: prefixTokens,
    textBody: body,
    proseText: prose,
    disclaimerText: disclaimer,
    hasForwardedHeaders,
    originalSenderEmail: input.originalSenderEmail ?? '',
    originalSenderName: input.originalSenderName ?? '',
    forwardedByEmail: input.forwardedByEmail ?? '',
    structuredBroker: input.structuredBroker ?? null,
    headerBrokers,
    bodyBrokers: scanTextForBrokers(body),
    senderDomainBroker: brokerByDomain(domainOf(input.originalSenderEmail ?? '')),
    subjectPrefixBrokers,
    fromHeaders,
  }
}

// ── Resolution ────────────────────────────────────────────────────────────

interface Signal {
  readonly broker: Broker
  readonly source: BrokerSource
  readonly confidence: number
  readonly evidence: string
  /** A passing body-text mention (e.g. a competitor named in prose) — kept in
   *  the evidence trail but never counted toward a conflict. */
  readonly incidental?: boolean
}

/** Source priority — a deterministic tie-break when confidences are equal. */
const SOURCE_RANK: Record<BrokerSource, number> = {
  metadata: 6,
  forwarded_body_header: 5,
  signature_or_disclaimer: 4,
  original_sender_domain: 3,
  subject_prefix: 2,
  llm_extraction: 1,
  unknown: 0,
}

/** Reject obvious human names so a stray metadata value never becomes a house. */
function looksLikeResearchHouse(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/\b(?:capital|securit|research|financial|equit|invest|bank|broking|broker|institutional|global|markets|sachs|stanley|morgan|nomura|jefferies|partners|advisor|asset|wealth|llc|ltd|inc|llp)\b/i.test(t)) {
    return true
  }
  const words = t.split(/\s+/)
  return !(words.length <= 3 && words.every((w) => /^[A-Z][a-z'.-]+$/.test(w)))
}

const RESEARCH_SIGNAL =
  /\b(?:sebi\s+research\s+analyst|research\s+analyst\s+reg|institutional\s+equit|equity\s+research|investment\s+research|global\s+research|research\s+analyst)\b/i

const NON_BROKER_LOCALPART =
  /^(?:investors?|investor[._-]?relations?|ir|newsletters?|news|digest|noreply|no-reply|donotreply|do-not-reply|updates?|mailer|notifications?)$/i

const MACRO_KEYWORDS =
  /\b(?:daily summary|morning brief|market wrap|macro (?:note|update|brief)|newsletter|weekly (?:wrap|digest))\b/i

function isNonBrokerSource(ctx: EmailBrokerContext): boolean {
  const localParts = [
    localPartOf(ctx.originalSenderEmail),
    ...ctx.fromHeaders.map((h) => localPartOf(h.email)),
  ]
  if (localParts.some((lp) => lp && NON_BROKER_LOCALPART.test(lp))) return true
  return MACRO_KEYWORDS.test(ctx.subject)
}

/** A forwarded `From:` with a real corporate domain — used to flag an
 *  unmapped research house (and to label its synthetic card). */
function corporateFromHeader(ctx: EmailBrokerContext): FromHeader | null {
  const forwarders = new Set(
    [domainOf(ctx.forwardedByEmail), domainOf(ctx.originalSenderEmail)].filter(Boolean),
  )
  let best: FromHeader | null = null
  for (const h of ctx.fromHeaders) {
    if (!h.domain || FREEMAIL.has(h.domain) || forwarders.has(h.domain)) continue
    best = h // last one wins — deepest in the forward chain
  }
  return best
}

function hasResearchHouseSignal(ctx: EmailBrokerContext): boolean {
  return RESEARCH_SIGNAL.test(ctx.textBody) || corporateFromHeader(ctx) !== null
}

/** Resolve the broker for one source document within an email. */
export function resolveBrokerForNote(
  source: NoteSourceInput,
  ctx: EmailBrokerContext,
): BrokerResolution {
  // 1 — report-specific evidence: this attachment's own filename.
  const filenameHit = scanTextForBrokers(source.filename ?? '')[0] ?? null
  const reportSignal: Signal | null = filenameHit
    ? {
        broker: filenameHit.broker,
        source: 'signature_or_disclaimer',
        confidence: 0.9,
        evidence: `filename names ${filenameHit.evidence}`,
      }
    : null

  // 2 — email-level signals, shared across the email's source documents.
  const emailSignals: Signal[] = []

  if (ctx.structuredBroker && looksLikeResearchHouse(ctx.structuredBroker)) {
    const b = brokerByAlias(ctx.structuredBroker)
    if (b) {
      emailSignals.push({
        broker: b, source: 'metadata', confidence: 0.95,
        evidence: `metadata broker "${ctx.structuredBroker}"`,
      })
    }
  }

  // Forwarded `From:` headers — the deepest broker header is the original
  // research sender; shallower ones still feed conflict detection.
  ctx.headerBrokers.forEach((h, i) => {
    const isDeepest = i === ctx.headerBrokers.length - 1
    emailSignals.push({
      broker: h.broker, source: 'forwarded_body_header',
      confidence: isDeepest ? 0.92 : 0.915,
      evidence: h.evidence,
    })
  })

  for (const hit of ctx.bodyBrokers) {
    emailSignals.push({
      broker: hit.broker, source: 'signature_or_disclaimer',
      confidence: hit === ctx.bodyBrokers[0] ? 0.74 : 0.73,
      evidence: `body mentions ${hit.evidence}`,
      incidental: true,
    })
  }

  if (ctx.senderDomainBroker) {
    emailSignals.push({
      broker: ctx.senderDomainBroker, source: 'original_sender_domain',
      confidence: ctx.hasForwardedHeaders ? 0.7 : 0.9,
      evidence: `sender ${ctx.originalSenderEmail}`,
    })
  }

  for (const sp of ctx.subjectPrefixBrokers) {
    emailSignals.push({
      broker: sp.broker, source: 'subject_prefix', confidence: 0.55,
      evidence: `subject prefix [${sp.token}]`,
    })
  }

  // 3 — pick the winner: report-specific evidence wins outright when present,
  //     otherwise the highest-confidence email-level signal.
  const allSignals = reportSignal ? [reportSignal, ...emailSignals] : emailSignals
  if (allSignals.length > 0) {
    const winner = reportSignal ?? pickWinner(emailSignals)
    // A conflict is structural disagreement only — an incidental body-text
    // mention of a competing house never flags a note for QA.
    const structuralBrokers = new Set(
      allSignals.filter((s) => !s.incidental).map((s) => s.broker.id),
    )
    const brokerConflict = structuralBrokers.size > 1
    const reason = brokerConflict
      ? `Resolved ${winner.broker.name} from ${winner.source} (${winner.evidence}); conflicting signals also seen — flagged for QA.`
      : `Resolved ${winner.broker.name} from ${winner.source} (${winner.evidence}).`
    return {
      brokerId: winner.broker.id,
      brokerCanonicalName: winner.broker.name,
      brokerRawName: winner.evidence,
      brokerSource: winner.source,
      brokerConfidence: winner.confidence,
      brokerEvidence: winner.evidence,
      resolutionClass: 'mapped',
      isMapped: true,
      isUnresolved: false,
      brokerConflict,
      evidenceTrail: allSignals.map((s) => ({
        source: s.source, brokerName: s.broker.name,
        confidence: s.confidence, evidence: s.evidence,
      })),
      resolutionReason: reason,
    }
  }

  // 4 — no catalogued house: classify the fallback honestly.
  if (isNonBrokerSource(ctx)) {
    return fallback('other_source', OTHER_SOURCES_BROKER_ID, 'Other Sources', 0,
      `Sender identified as a non-research source (IR / newsletter / internal).`)
  }
  const corp = corporateFromHeader(ctx)
  if (hasResearchHouseSignal(ctx)) {
    const rawName = corp?.display || corp?.domain || 'Unmapped Research House'
    const domain = corp?.domain ?? ''
    return {
      brokerId: asBrokerId('brk_unmapped_' + (domain ? slug(domain) : slug(rawName))),
      brokerCanonicalName: cleanHouseName(rawName),
      brokerRawName: domain || rawName,
      brokerSource: 'unknown',
      brokerConfidence: 0.5,
      brokerEvidence: corp ? corp.raw : 'research-house disclaimer language',
      resolutionClass: 'unmapped_research_house',
      isMapped: false,
      isUnresolved: false,
      brokerConflict: false,
      evidenceTrail: [],
      resolutionReason:
        `Research-house evidence found but ${domain || rawName} is not in the broker catalog — shown as an unmapped research house.`,
    }
  }
  return fallback('unknown', UNKNOWN_BROKER_ID, 'Unknown Broker', 0,
    `Looks like broker research but no research house could be resolved.`)
}

function pickWinner(signals: readonly Signal[]): Signal {
  return [...signals].sort((a, b) =>
    b.confidence - a.confidence || SOURCE_RANK[b.source] - SOURCE_RANK[a.source],
  )[0]
}

function fallback(
  resolutionClass: ResolutionClass, brokerId: BrokerId,
  name: string, confidence: number, reason: string,
): BrokerResolution {
  return {
    brokerId,
    brokerCanonicalName: name,
    brokerSource: 'unknown',
    brokerConfidence: confidence,
    resolutionClass,
    isMapped: false,
    isUnresolved: resolutionClass === 'unknown',
    brokerConflict: false,
    evidenceTrail: [],
    resolutionReason: reason,
  }
}

/** Trim a forwarded display name down to a house label ("Naman, IIFLCAP" stays
 *  verbatim only when it carries no cleaner signal). */
function cleanHouseName(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (t.includes('@') || t.includes('.')) return t // a domain — keep as-is
  return t
}

// ── Broker records for the dashboard catalog ──────────────────────────────

function shortLabelFor(res: BrokerResolution): string {
  switch (res.resolutionClass) {
    case 'other_source': return 'Other'
    case 'unknown':      return 'Unknown'
    case 'unmapped_research_house':
      return res.brokerCanonicalName.split(/\s+/)[0].slice(0, 10) || 'Unmapped'
    default:             return res.brokerCanonicalName.slice(0, 10)
  }
}

/** The `Broker` catalog entry for a resolution — the real catalog entry for a
 *  mapped house, else a synthetic neutral-coloured bucket. */
export function brokerRecordForResolution(res: BrokerResolution): Broker {
  if (res.isMapped) {
    const cat = CATALOG_BY_ID.get(res.brokerId)
    if (cat) return cat
  }
  return {
    id: res.brokerId,
    name: res.brokerCanonicalName,
    shortName: shortLabelFor(res),
    senderDomains: [],
    researchAliases: [],
    coverageTags: [],
    brandColor: res.resolutionClass === 'unmapped_research_house' ? UNMAPPED_COLOR : NEUTRAL_COLOR,
    website: null,
  }
}

/** Every research-house name / short name / alias in the catalog — used to
 *  tell when an extracted entity is *any* broker's name (so it needs title or
 *  company-master evidence, not a passing prose mention, to be a stock). */
export const ALL_BROKER_NAME_TOKENS: readonly string[] =
  BROKER_CATALOG.flatMap((b) => [b.name, b.shortName, ...b.researchAliases])

/** Name/alias tokens to match a covered-entity candidate against, when
 *  deciding whether an extracted entity is really just the note's broker. */
export function brokerNameTokensFor(res: BrokerResolution): string[] {
  if (res.isMapped) {
    const c = CATALOG_BY_ID.get(res.brokerId)
    if (c) return [c.name, c.shortName, ...c.researchAliases]
  }
  if (res.resolutionClass === 'unmapped_research_house') {
    return [res.brokerCanonicalName, res.brokerRawName].filter((x): x is string => !!x)
  }
  return []
}
