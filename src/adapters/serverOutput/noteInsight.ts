// Adapter-level MVP enrichment from forwarded email text.
// Production backend should eventually provide these structured fields directly.
//
// A general, sector-agnostic broker-note insight extractor. It recognises
// standard financial vocabulary that recurs across banks, pharma, hospitals,
// capital goods, consumer, chemicals, IT, autos and real estate — no company
// or sector names are hardcoded. Deterministic regex only: never an LLM,
// never invents a number. When a pattern does not match, the field is left
// null / empty. Every emitted value is a verbatim substring of the email.

import type { Rating, ReportType, ReportKeyNumber } from '../../domain'

export interface NoteInsight {
  readonly thesis: string | null
  readonly keyPoints: readonly string[]
  readonly keyNumbers: readonly ReportKeyNumber[]
  readonly watchpoints: readonly string[]
  readonly upsidePct: number | null
  readonly actionLabel: string | null
}

export const EMPTY_NOTE_INSIGHT: NoteInsight = {
  thesis: null, keyPoints: [], keyNumbers: [], watchpoints: [], upsidePct: null, actionLabel: null,
}

export interface NoteInsightInput {
  readonly subject: string
  readonly textBody: string
  readonly rating: Rating | null
  readonly reportType: ReportType
  readonly companyName: string
  readonly ticker: string
}

/** Extract a structured insight from one forwarded broker email. Total —
 *  never throws; returns EMPTY_NOTE_INSIGHT-shaped data when nothing matches. */
export function extractNoteInsight(input: NoteInsightInput): NoteInsight {
  const paragraphs = cleanText(input.textBody)
  const body = paragraphs.join(' ')
  if (body.length < 40) {
    return { ...EMPTY_NOTE_INSIGHT, actionLabel: pickActionLabel(input, '', [], null) }
  }
  const keyNumbers = extractKeyNumbers(body)
  const upsidePct = extractUpside(body)
  const watchpoints = extractWatchpoints(body)
  const pick = extractThesis(paragraphs, input)
  const thesis = pick.text.trim() || null
  const keyPoints = pick.paragraphIndex !== null
    ? paragraphs.slice(pick.paragraphIndex + 1).filter((p) => p.length >= 40)
    : []
  const actionLabel = pickActionLabel(input, body, keyNumbers, upsidePct)
  return { thesis, keyPoints, keyNumbers, watchpoints, upsidePct, actionLabel }
}

// ── Cleaning ───────────────────────────────────────────────────────────────
// Split the forwarded email into clean prose *paragraphs*. Forwarded-metadata
// blocks — dividers, From/Sent/To/Subject headers AND their wrapped
// continuation lines — are dropped whole, as are greetings and client noise.
// Blank lines mark paragraph boundaries. Extraction stops at the first
// signature / disclaimer line so compliance boilerplate never reaches it.

const FWD_DIVIDER = /^[-_=]{5,}/
const FWD_HEADER  = /^\*?\s*(?:from|sent|to|date|cc|bcc|reply-to|subject)\s*:/i
const GREETING    = /^(?:hi|hello|hey|dear)\b[^.!?]{0,40}$/i
const NOISE_LINE  = /^(?:get outlook|sent from my|download outlook|\[image:|<?https?:\/\/)/i
const TAIL_MARKER =
  /^(?:best\s+regards|warm\s+regards|kind\s+regards|regards|thanks|thank\s+you|cheers)\b|^please\s+(?:find|follow|refer|see)\b|^disclaimer\b|this\s+(?:message|e-?mail|communication)\b[^.]{0,60}confidential|sebi\s+research\s+analyst\s+reg|compliance\s+officer|investments?\s+in\s+securities\s+market\s+are\s+subject|mutual\s+funds?\b[^.]{0,40}market\s+risk/i

/** Split a forwarded broker email into clean prose paragraphs. A forwarded
 *  header block (opened by a From/Sent/To/Subject line) is dropped in full —
 *  including wrapped continuation lines — until the next blank line or
 *  divider, so a line-wrapped Subject can never leak into the prose. */
function cleanText(raw: string): string[] {
  if (!raw) return []
  const paragraphs: string[] = []
  let current: string[] = []
  let inHeaderBlock = false

  const flush = (): void => {
    if (current.length === 0) return
    const para = current.join(' ')
      .replace(/<[^>\s]+>/g, ' ')   // inline <url> angle-bracket links
      .replace(/[*_`]/g, ' ')       // markdown emphasis
      .replace(/\s+/g, ' ')
      .trim()
    if (para) paragraphs.push(para)
    current = []
  }

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (TAIL_MARKER.test(t)) { flush(); break }                          // signature / disclaimer — stop
    if (!t)                  { inHeaderBlock = false; flush(); continue } // blank — ends paragraph + header block
    if (FWD_DIVIDER.test(t)) { inHeaderBlock = false; flush(); continue }
    if (FWD_HEADER.test(t))  { flush(); inHeaderBlock = true; continue }  // header line — open block, drop
    if (inHeaderBlock) continue                                          // wrapped header continuation — drop
    if (GREETING.test(t)) continue
    if (NOISE_LINE.test(t)) continue
    current.push(t.replace(/^#+\s*/, ''))                                // strip a leading markdown heading marker
  }
  flush()
  return paragraphs
}

// ── Sentences ──────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 400)
}

// ── Thesis ─────────────────────────────────────────────────────────────────
// The thesis is the analyst's own opening summary — the first substantial
// prose paragraph, returned verbatim and complete (never clamped). The
// paragraphs after it become keyPoints. When no paragraph reads as a lede,
// fall back to the single best keyword-scored sentence.

const RISK_HINT = /\b(?:risk|headwind|pressure|slowdown|weak|concern|overhang|decelerat|de-?growth)/i

interface ThesisPick {
  readonly text: string
  /** Index of the paragraph the thesis was taken from, or null when it came
   *  from the sentence-scoring fallback — then keyPoints stays empty. */
  readonly paragraphIndex: number | null
}

/** Pick the note's thesis: the first substantial prose paragraph (the
 *  analyst's lede), else the best keyword-scored sentence across the note. */
function extractThesis(paragraphs: readonly string[], input: NoteInsightInput): ThesisPick {
  for (let i = 0; i < paragraphs.length; i++) {
    const text = stripLeadingTitle(paragraphs[i], input.subject)
    if (text.length >= 80 && /[.!?]/.test(text) && !/^https?:\/\//i.test(text)) {
      return { text, paragraphIndex: i }
    }
  }
  return { text: bestScoredSentence(paragraphs, input) ?? '', paragraphIndex: null }
}

/** Drop a leading echo of the note headline — some analysts paste the subject
 *  line into the body, and it must never prefix the thesis. */
function stripLeadingTitle(para: string, subject: string): string {
  const p = para.trim()
  const words = subject.toLowerCase().match(/[a-z0-9]+/g)
  if (!words || words.length < 4) return p
  return p.replace(new RegExp(`^\\W*${words.join('\\W+')}\\W*`, 'i'), '').trim()
}

/** Fallback for notes with no clear lede paragraph: the highest keyword-scored
 *  sentence across the whole note. */
function bestScoredSentence(paragraphs: readonly string[], input: NoteInsightInput): string | null {
  const sentences = splitSentences(paragraphs.join(' '))
  const company = input.companyName.trim().toLowerCase()
  const ticker = input.ticker.trim().toLowerCase()
  let best: { score: number; text: string } | null = null
  for (let idx = 0; idx < sentences.length; idx++) {
    const s = sentences[idx]
    const lc = s.toLowerCase()
    let score = 0
    if ((company.length >= 3 && lc.includes(company)) || (ticker.length >= 2 && lc.includes(ticker))) score += 3
    if (/\b(?:initiat|upgrad|downgrad|maintain|reiterat)/i.test(s)) score += 2
    if (/%|\bgrowth\b|\bmargin/i.test(s)) score += 2
    if (idx < 3) score += 1
    if (RISK_HINT.test(s)) score -= 3
    if (/https?:\/\//i.test(s)) score -= 5
    if (score > 0 && (best === null || score > best.score)) best = { score, text: s }
  }
  return best ? best.text : null
}

// ── Key numbers — generic metric dictionary ────────────────────────────────
// Each entry is a canonical label + generic synonym keywords. Sector-agnostic:
// banks → NII / AUM, capital goods → order book, consumer → volume, all → the
// rest. A number is emitted only when found adjacent to its keyword.

const GROWTH_METRICS: readonly (readonly [string, string])[] = [
  ['Revenue',    'revenue|net sales|sales|topline|top-line|turnover'],
  ['NII',        'nii|net interest income'],
  ['AUM',        'aum|assets under management'],
  ['Order book', 'order ?book|order ?inflow|order ?intake'],
  ['Volume',     'volumes?'],
  ['EBITDA',     'ebitda'],
  ['PAT',        'pat|net profit|profit after tax'],
  ['EPS',        'eps|earnings per share'],
]

const MARGIN_METRICS: readonly (readonly [string, string])[] = [
  ['EBITDA margin', 'ebitda margins?'],
  ['EBIT margin',   'ebit margins?'],
  ['Gross margin',  'gross margins?'],
  ['PAT margin',    '(?:pat|net) margins?'],
]

function extractKeyNumbers(body: string): ReportKeyNumber[] {
  const out: ReportKeyNumber[] = []
  const seen = new Set<string>()
  const push = (label: string, value: string): void => {
    const k = label.toLowerCase()
    if (seen.has(k) || out.length >= 6) return
    seen.add(k)
    out.push({ label, value })
  }

  // Growth metrics → "+N%".
  for (const [label, words] of GROWTH_METRICS) {
    const v = firstGrowth(body, words)
    if (v) push(label, v)
  }

  // Profitability margins → "N%".
  for (const [label, words] of MARGIN_METRICS) {
    const re = new RegExp(`\\b(?:${words})\\b.{0,80}?(\\d+(?:\\.\\d+)?)\\s*%`, 'i')
    const m = body.match(re)
    if (m) push(label, `${m[1]}%`)
  }

  // Return ratios — point estimates only (skip "improving from X to Y").
  const roe = body.match(/\bRo(E|CE|IC)\b[^.]{0,24}?(?:of|at|:)\s*~?(\d+(?:\.\d+)?)\s*%/i)
  if (roe) push(`Ro${roe[1].toUpperCase()}`, `${roe[2]}%`)

  // CAGR — multi-metric slash form first, else single metric.
  const slashCagr = body.match(
    /\b((?:revenue|rev|sales|ebitda|eps|pat|earnings)(?:\s*\/\s*(?:revenue|rev|sales|ebitda|eps|pat|earnings)){1,3})\s+Cagr\s+of\s+(\d+(?:\s*\/\s*\d+){1,3})\s*%/i,
  )
  if (slashCagr) push('Rev/EBITDA/EPS CAGR', `${slashCagr[2].replace(/\s+/g, '')}%`)
  else {
    const oneCagr = body.match(/\b(revenue|sales|ebitda|eps|pat|earnings)\s+Cagr\s+of\s+~?(\d+(?:\.\d+)?)\s*%/i)
    if (oneCagr) push(`${capitalize(oneCagr[1])} CAGR`, `${oneCagr[2]}%`)
  }

  // Valuation multiple.
  const val = body.match(
    /\b(?:trading at|valued at|valuations? of|based on)\s+(\d[\d.\/]*\s?x)\b[^.]{0,32}?\b(EV\s*\/\s*E[Bb]itda|E[Bb]itda|EV\s*\/\s*Sales|P\s*\/\s*E|P\s*\/\s*B|book\s+value|earnings)/i,
  )
  if (val) push('Valuation', `${val[1].replace(/\s+/g, '')} ${val[2].replace(/ebitda/i, 'EBITDA').replace(/\s+/g, '')}`)

  // Management guidance figure.
  const guide = body.match(/\bguidance of\s+~?(\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%)/i)
  if (guide) push('Guidance', guide[1].replace(/\s+/g, ''))

  return out
}

/** Find a growth figure for a metric — "<metric> growth of N%", "<metric>
 *  grew N%", or "N% YoY <metric> growth". Returns a "+N%" string. */
function firstGrowth(body: string, words: string): string | null {
  const w = `(?:${words})`
  const patterns: readonly RegExp[] = [
    new RegExp(`\\b${w}\\s+growth\\s+of\\s+~?(\\d+(?:\\.\\d+)?)\\s*%`, 'i'),
    new RegExp(`\\b${w}\\s+(?:grew|rose|grow|increased|expanded)\\s+(?:by\\s+)?~?(\\d+(?:\\.\\d+)?)\\s*%`, 'i'),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:YoY\\s+)?${w}\\s+growth`, 'i'),
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (m) return `+${m[1]}%`
  }
  return null
}

// ── Upside ─────────────────────────────────────────────────────────────────

function extractUpside(body: string): number | null {
  const m = body.match(/\(?\s*(\d+(?:\.\d+)?)\s*%\s*(?:potential\s+)?upside\s*\)?/i)
    ?? body.match(/\bupside of\s+~?(\d+(?:\.\d+)?)\s*%/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : null
}

// ── Watchpoints — generic monitorable-topic dictionary ─────────────────────
// Drivers and risks. A label is emitted only when its generic trigger
// literally appears. No sector-specific phrasing.

const WATCH_TOPICS: readonly (readonly [string, RegExp])[] = [
  ['Margin trajectory',       /\bmargins?\s+(?:expansion|expanding|expand|compression|contraction|pressure|decline)/i],
  ['Capacity additions',      /\b(?:capacity|store|cent(?:er|re)|plant|bed|branch|outlet|clinic|warehouse)\s+additions?\b|\bcapacity\s+addition/i],
  ['Utilization / occupancy', /\b(?:utili[sz]ation|occupancy)\b/i],
  ['Pricing',                 /\b(?:price\s+hikes?|price\s+increases?|pricing|reali[sz]ation)\b/i],
  ['Market share',            /\bmarket\s+share\b/i],
  ['Management guidance',     /\b(?:guidance|guided)\b/i],
  ['Forward estimates',       /\bFY\s?2\d[^.]{0,20}?(?:estimate|forecast)|estimate\s+(?:upgrade|cut|revision)/i],
  ['Execution',               /\bexecution\b/i],
  ['Demand environment',      /\bdemand\s+(?:slowdown|weakness|environment|recovery|outlook)|\bslowdown\b/i],
  ['Regulatory',              /\bregulat(?:ory|ion)\b/i],
  ['Competition',             /\bcompetiti(?:on|ve)\b/i],
  ['Working capital',         /\bworking\s+capital\b/i],
  ['Leverage / debt',         /\b(?:net\s+debt|deleverag|leverage|debt[- ]to[- ]equity)\b/i],
  ['Input costs',             /\b(?:input\s+cost|raw\s+material|commodity\s+(?:cost|price))/i],
  ['Currency / FX',           /\b(?:currency|forex|foreign\s+exchange)\b/i],
]

function extractWatchpoints(body: string): string[] {
  const out: string[] = []
  for (const [label, re] of WATCH_TOPICS) {
    if (out.length >= 5) break
    if (re.test(body)) out.push(label)
  }
  return out
}

// ── Action label — one tag, first match wins ───────────────────────────────

function pickActionLabel(
  input: NoteInsightInput,
  body: string,
  keyNumbers: readonly ReportKeyNumber[],
  upsidePct: number | null,
): string | null {
  const hay = `${input.subject} ${body}`
  if (input.reportType === 'initiation' || /\binitiat\w*\s+coverage\b|\bcoverage\s*[:,-]?\s*initiat/i.test(hay)) {
    return 'Initiation'
  }
  if (/\bupgrad(?:e|ed|ing)\b(?![\s-]*(?:cycle|capex))/i.test(hay)) return 'Upgrade'
  if (/\bdowngrad(?:e|ed|ing)\b/i.test(hay)) return 'Downgrade'
  if (input.rating === 'Buy' || input.rating === 'Overweight') return 'BUY idea'
  // Title-only standalone-rating detector. Display-only — no opinion is
  // ever created from this. The opinion path is gated independently on NER
  // rating/TP in emailApiTransform.ts. Subjects like
  //   "NephroPlus – Underappreciated healthcare play – BUY"
  //   "PI Industries: Operating miss, recovery some time away - Hold"
  // carry the broker's call where NER missed it.
  const titleRating = detectStandaloneTitleRating(input.subject)
  if (titleRating === 'bullish') return 'BUY idea'
  if (titleRating === 'neutral') return 'Hold / monitor'
  if (upsidePct !== null && upsidePct >= 15) return 'Big upside'
  if (keyNumbers.length >= 3) return 'High-signal note'
  return null
}

/** Subject-only detector for a standalone rating word at the end of the
 *  title, optionally after a separator and optional trailing punctuation.
 *  We deliberately do NOT scan the body — prose like "we maintain Buy at
 *  current levels" is too common as false-positive bait. */
const TITLE_RATING_END =
  /(?:[\s\-–—:|·])(buy|overweight|outperform|add|hold|neutral)\s*[!.]?\s*$/i

function detectStandaloneTitleRating(subject: string): 'bullish' | 'neutral' | null {
  const m = TITLE_RATING_END.exec(subject)
  if (!m) return null
  const word = m[1].toLowerCase()
  return (word === 'hold' || word === 'neutral') ? 'neutral' : 'bullish'
}

// ── Small helpers ──────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase()
}
