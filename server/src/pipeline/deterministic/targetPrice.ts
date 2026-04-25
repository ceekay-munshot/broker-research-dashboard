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
const RE_TARGET_PRIMARY = new RegExp(
  `(?:TP|PT|price[\\s-]?target|target[\\s-]?price|target)\\s*(?:of|:|—|-|to|at|is|now)?\\s*${CCY}${NUM}`,
  'i',
)
const RE_TARGET_RAISE = new RegExp(
  `(?:rais(?:e|ed|es) (?:TP|PT|target)|new (?:TP|PT|target)|revised (?:TP|PT|target))\\s*(?:to)?\\s*${CCY}${NUM}`,
  'i',
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

  const candidates: number[] = []
  const m1 = text.match(RE_TARGET_RAISE)
  if (m1) candidates.push(parseNumber(m1[1]!))
  const m2 = text.match(RE_TARGET_PRIMARY)
  if (m2) candidates.push(parseNumber(m2[1]!))

  // De-duplicate close-enough candidates (within 0.1% of each other).
  const distinct: number[] = []
  for (const c of candidates) {
    if (!distinct.some((d) => Math.abs(d - c) / Math.max(1, c) < 0.001)) distinct.push(c)
  }

  // The first candidate wins (raise > primary). Conflict only when two
  // distinct meaningful values both fire.
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
