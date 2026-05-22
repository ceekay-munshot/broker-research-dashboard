// ─────────────────────────────────────────────────────────────────────────
// entityRole — note-scoped broker-vs-stock classification.
//
// The extraction layer sometimes tags a broker's own name as a covered stock
// (an IIFL note's NER lists "IIFL" with a BUY rating). This classifies, FOR
// ONE NOTE, whether an extracted entity is the research source, the covered
// company, or both — using evidence, not a global blacklist. A research house
// stays a valid covered stock whenever a note is genuinely about that listed
// company; when both roles hold, the entity is kept and flagged, never deleted.
//
// Pure functions: no React, no fetch.
// ─────────────────────────────────────────────────────────────────────────

import type { BrokerResolution } from '../../domain'
import { stocks as STOCK_CATALOG } from '../../mocks/stocks'
import { brokerNameTokensFor, ALL_BROKER_NAME_TOKENS } from './brokerResolver'

export type EntityRole = 'broker_only' | 'covered_stock' | 'both' | 'unresolved'

export interface EntityRoleClassification {
  readonly role: EntityRole
  readonly brokerEvidence: readonly string[]
  readonly stockEvidence: readonly string[]
  readonly brokerConfidence: number
  readonly stockConfidence: number
  readonly brokerStockConflict: boolean
  readonly reason: string
}

/** One extracted entity to classify. */
export interface EntityCandidateInput {
  readonly entityName: string
  readonly ticker: string
  readonly hasRating: boolean
  readonly hasTargetPrice: boolean
}

/** The note's text, split so disclaimer-only mentions are distinguishable. */
export interface NoteEntityContext {
  readonly cleanTitle: string
  readonly proseText: string
  readonly disclaimerText: string
  readonly brokerPrefixTokens: readonly string[]
}

/** An `unresolved` entity surfaces as a covered stock only above this score. */
export const STOCK_DISPLAY_THRESHOLD = 0.3

// ── Helpers ───────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Case-insensitive, boundary-guarded "contains" — `IIFL` ≠ `IIFLe`. */
function appearsWord(haystack: string, needle: string): boolean {
  const n = needle.trim()
  if (n.length < 2) return false
  return new RegExp('(?:^|[^a-z0-9])' + escapeRegExp(n) + '(?![a-z0-9])', 'i').test(haystack)
}

const METRIC =
  '(?:target\\s*price|\\btp\\b|\\bcmp\\b|\\brating\\b|initiat\\w*\\s+coverage|' +
  'upgrad\\w*|downgrad\\w*|\\bbuy\\b|\\bsell\\b|\\bhold\\b|\\badd\\b|\\breduce\\b|' +
  '\\baccumulate\\b|overweight|underweight|outperform|underperform|rs\\.?\\s*\\d)'

/** A rating / target / CMP figure sits within ~80 chars of the entity. The
 *  entity is matched on word boundaries — `IIFL` must not match `IIFLe`. */
function metricNearEntity(prose: string, entity: string): boolean {
  const e = entity.trim()
  if (e.length < 2) return false
  const bounded = '(?:^|[^a-z0-9])' + escapeRegExp(e) + '(?![a-z0-9])'
  const re = new RegExp(`(?:${bounded}[\\s\\S]{0,80}${METRIC}|${METRIC}[\\s\\S]{0,80}${bounded})`, 'i')
  return re.test(prose)
}

const COMPANY_NAMES: ReadonlySet<string> =
  new Set(STOCK_CATALOG.map((s) => norm(s.name)))
const COMPANY_TICKERS: ReadonlySet<string> =
  new Set(STOCK_CATALOG.map((s) => (s.ticker as unknown as string).toUpperCase()))

/** Does this entity name / ticker denote the note's resolved research house? */
function matchesBroker(entity: string, ticker: string, tokens: readonly string[]): boolean {
  const e = norm(entity)
  const eTight = e.replace(/\s+/g, '')
  const t = ticker.toLowerCase().trim()
  for (const token of tokens) {
    const k = norm(token)
    if (!k) continue
    if (e === k || t === k) return true
    if (k.length >= 3 && (e.startsWith(k) || eTight.startsWith(k.replace(/\s+/g, '')))) return true
  }
  return false
}

// ── Classification ────────────────────────────────────────────────────────

/**
 * Classify one extracted entity within one note. `broker_only` entities are
 * dropped from the note's covered stocks; `both` is kept and flagged
 * (`brokerStockConflict`); `covered_stock` is kept; `unresolved` is kept only
 * when `stockConfidence` clears `STOCK_DISPLAY_THRESHOLD`.
 */
export function classifyNoteEntity(
  candidate: EntityCandidateInput,
  note: NoteEntityContext,
  resolution: BrokerResolution,
): EntityRoleClassification {
  const { entityName, ticker, hasRating, hasTargetPrice } = candidate
  const tickerUpper = ticker.toUpperCase()

  // ── Stock evidence ──────────────────────────────────────────────────────
  // The decisive signal is the (broker-prefix-stripped) title; the company
  // master and a rating discussed in prose next to the entity are also
  // strong. A bare NER ticker / rating is weak — it is exactly what the
  // broker-name-as-stock bug produces, so it cannot carry a candidate alone.
  const inTitle =
    appearsWord(note.cleanTitle, entityName) ||
    (!!ticker && appearsWord(note.cleanTitle, ticker))
  const inMaster =
    COMPANY_NAMES.has(norm(entityName)) || COMPANY_TICKERS.has(tickerUpper)
  const inProse = appearsWord(note.proseText, entityName)
  const metricInProse = inProse && metricNearEntity(note.proseText, entityName)
  const realTicker = !!ticker && !['no match', 'n/a'].includes(ticker.toLowerCase())

  // Any research-house name (not just this note's) — broker names recur in
  // research prose ("ahead of Ambit's estimate"), so for them only the title
  // or the company master is trustworthy stock evidence, never a prose hit.
  const isBrokerName = matchesBroker(entityName, ticker, ALL_BROKER_NAME_TOKENS)

  // Strong stock evidence — enough to call the entity a covered company even
  // when its name is also a research house's.
  const strongStock = inTitle || inMaster || (metricInProse && !isBrokerName)

  const stockEvidence: string[] = []
  if (inTitle) stockEvidence.push('named as the subject of the report title')
  if (inMaster) stockEvidence.push('matches the company master')
  if (metricInProse && !isBrokerName) stockEvidence.push('rating / target / CMP attached in prose')
  else if (inProse) stockEvidence.push('mentioned in the note body')
  if (realTicker) stockEvidence.push('NER matched a ticker (weak)')

  const stockConfidence = isBrokerName
    ? Math.min(1, (inTitle ? 0.6 : 0) + (inMaster ? 0.5 : 0))
    : Math.min(1,
        (inTitle ? 0.6 : 0) + (inMaster ? 0.45 : 0) +
        (metricInProse ? 0.3 : 0) + (inProse ? 0.15 : 0) +
        (realTicker ? 0.1 : 0) + (hasRating || hasTargetPrice ? 0.05 : 0))

  // ── Broker evidence ─────────────────────────────────────────────────────
  // The entity's name IS the note's resolved research house.
  const brokerEvidence: string[] = []
  const brokerMatch = matchesBroker(entityName, ticker, brokerNameTokensFor(resolution))
  let brokerConfidence = 0
  if (brokerMatch) {
    brokerConfidence = Math.min(1, 0.55 + 0.4 * resolution.brokerConfidence)
    brokerEvidence.push(`matches the resolved research house "${resolution.brokerCanonicalName}"`)
    if (appearsWord(note.disclaimerText, entityName) && !inProse) {
      brokerEvidence.push('appears only in the disclaimer / signature')
    }
    if (note.brokerPrefixTokens.some((p) => norm(p) === norm(entityName))) {
      brokerEvidence.push('appears as a broker subject prefix')
    }
  }

  // ── Decision ────────────────────────────────────────────────────────────
  // brokerMatch is the "high broker evidence" gate; strongStock is the "high
  // stock evidence" gate. A broker-named entity is the covered company only
  // when the note is genuinely about it (title / master / rating-in-prose) —
  // a bare NER row or a stray disclaimer mention is never enough.
  let role: EntityRole
  let brokerStockConflict = false
  if (brokerMatch && strongStock) {
    role = 'both'; brokerStockConflict = true
  } else if (brokerMatch) {
    role = 'broker_only'
  } else if (strongStock) {
    role = 'covered_stock'
  } else {
    role = 'unresolved'
  }

  const reason =
    role === 'broker_only'
      ? `"${entityName}" is the research house, not a covered stock — dropped from this note's stocks.`
      : role === 'both'
        ? `"${entityName}" is both the research house and a covered company in this note — kept and flagged for QA.`
        : role === 'covered_stock'
          ? `"${entityName}" is a covered company in this note.`
          : `"${entityName}" has weak evidence either way — surfaced only above the display threshold.`

  return {
    role,
    brokerEvidence,
    stockEvidence,
    brokerConfidence,
    stockConfidence,
    brokerStockConflict,
    reason,
  }
}
