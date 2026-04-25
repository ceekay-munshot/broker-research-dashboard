// Target-price + prior-target extraction.
//
// Conservative regex-based extractor. We deliberately accept a handful
// of canonical patterns rather than try to match every phrasing:
//
//   "TP ₹4,200"
//   "Price target of Rs 4200"
//   "target price: 4,200"
//   "raises TP to ₹4,200 from ₹4,050"
//   "prior target ₹4,050"
//
// When multiple candidates appear, pick the *latest* number after a
// "to" / "raises to" / "TP" anchor — that matches analyst phrasing.

const NUM = '([0-9][0-9,]{0,7}(?:\\.[0-9]+)?)'
const CCY = '(?:₹|Rs\\.?|INR)?\\s?'

// Target-price phrasing accepted: TP / PT / target price / price target /
// target. Both `PT` and `TP` are observed in real Indian-broker copy.
//
// Two regexes — RAISE phrasing (preferred when present) and PRIMARY
// (anchored to the keyword) — are scanned globally so we collect every
// candidate target in the text. The first RAISE match wins as the
// primary; conflict detection compares the full distinct set across
// both regexes.
const RE_TARGET_PRIMARY = new RegExp(
  `(?:TP|PT|price[\\s-]?target|target[\\s-]?price|target)\\s*(?:of|:|—|-|to|at|is|now)?\\s*${CCY}${NUM}`,
  'gi',
)
const RE_TARGET_RAISE = new RegExp(
  `(?:rais(?:e|ed|es) (?:TP|PT|target)|new (?:TP|PT|target)|revised (?:TP|PT|target))\\s*(?:to)?\\s*${CCY}${NUM}`,
  'gi',
)
const RE_PRIOR_FROM = new RegExp(`\\bfrom\\s+${CCY}${NUM}`, 'i')
const RE_PRIOR_EXPLICIT = new RegExp(`\\bprior\\s+(?:TP|PT|target)\\s*(?:of|:|—|-)?\\s*${CCY}${NUM}`, 'i')

export interface TargetExtraction {
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly conflicting: boolean
}

export function detectTargetPrice(text: string): TargetExtraction {
  if (!text) return { targetPrice: null, priorTargetPrice: null, conflicting: false }

  // Collect every match across the text. matchAll requires the regex
  // to be global; we reset lastIndex defensively in case the regex
  // object is reused.
  RE_TARGET_RAISE.lastIndex = 0
  RE_TARGET_PRIMARY.lastIndex = 0
  const raiseMatches = [...text.matchAll(RE_TARGET_RAISE)].map((m) => parseNumber(m[1]!))
  const primaryMatches = [...text.matchAll(RE_TARGET_PRIMARY)].map((m) => parseNumber(m[1]!))

  // Prefer the order: first raise, then primary. The first raise wins as
  // the primary target; the full distinct set across both regexes drives
  // the conflict detection.
  const ordered: number[] = [...raiseMatches, ...primaryMatches]
  const distinct: number[] = []
  for (const c of ordered) {
    if (!Number.isFinite(c)) continue
    if (!distinct.some((d) => Math.abs(d - c) / Math.max(1, c) < 0.001)) distinct.push(c)
  }

  const targetPrice = distinct.length >= 1 ? distinct[0]! : null
  const conflicting = distinct.length > 1

  // Prior target: explicit pattern wins over "from ₹X" anchor.
  const priorM = text.match(RE_PRIOR_EXPLICIT) ?? text.match(RE_PRIOR_FROM)
  const priorTargetPrice = priorM ? parseNumber(priorM[1]!) : null

  return { targetPrice, priorTargetPrice, conflicting }
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}
