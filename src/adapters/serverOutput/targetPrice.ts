// Target-price hygiene for the forwarded-email adapter.
//
// Server-side NER sometimes mis-extracts a stray digit as the target price
// (e.g. "4" lifted from "24/7" or "4QFY27"). This module is the single gate
// before a target price reaches summaries, opinions, the Stocks table, the
// report drawer, or the ARB engine. It prefers an explicit "TP Rs X" stated
// in the email, rejects unconfirmed 1-2 digit NER noise, and returns null
// rather than surfacing a wrong number.
//
// Explicit recovery is candidate-scoped by *run-ownership* of the email text:
// each sentence belongs to the candidate most recently named, so one stock's
// stated TP can never be assigned to another in a multi-stock email — while a
// single-stock note (even one where NER also tagged the broker as an entity)
// still recovers its TP from a sentence that names no company.
//
// Pure, deterministic, never throws. INR-only path.

/** Parse a raw NER target-price string: strips ₹, commas and spaces, then
 *  takes the first numeric run. `","`, `""`, `"N/A"`, non-positive → null. */
export function parseTp(raw: string): number | null {
  const m = raw.replace(/[,\s₹]/g, '').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

// Currency-backed explicit TP: "TP Rs9,700", "our TP of Rs745", "PT ₹745",
// "fair value ₹745", "raised target price to Rs 7,500". Currency required.
const EXPLICIT_TP_RE =
  /\b(?:tp|pt|target\s*price|price\s*target|fair\s*value)\b\s*(?:(?:raised|revised|cut|lowered|increased|reduced)?\s*(?:of|to|at)\b|[:=\-–—])?\s*(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)(?![%xX]|\s?(?:bn|mn|cr|crore|k|bps|lakh|lac|qfy|fy|q[1-4]|h[12])\b)/i

// Bare "target of/to/at" — a currency token must follow immediately, so
// "target of achieving … run-rate of Rs250bn" cannot match.
const BARE_TARGET_RE =
  /\btarget\b\s+(?:of|to|at)\s+(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)(?![%xX]|\s?(?:bn|mn|cr|crore|k|bps|lakh|lac|qfy|fy|q[1-4]|h[12])\b)/i

// No-currency fallback: "TP 9700", "PT 2940", "Target price 7500". Weaker
// evidence — the caller accepts a match only when the value is >= 100.
const NO_CURRENCY_TP_RE =
  /\b(?:tp|pt|target\s*price|price\s*target)\b\s*(?:(?:raised|revised|cut|lowered|increased|reduced)?\s*(?:of|to|at)\b|[:=\-–—])?\s*(\d+(?:,\d+)*(?:\.\d+)?)(?![%xX]|\s?(?:bn|mn|cr|crore|k|bps|lakh|lac|qfy|fy|q[1-4]|h[12])\b)/i

export interface TargetPriceInput {
  /** The text this candidate is allowed to recover an explicit TP from
   *  (the whole note for a single-candidate email, or the candidate's owned
   *  run of sentences for a multi-stock one). */
  readonly recoveryText: string
  /** parseTp() of the raw NER tp, or null. */
  readonly parsedNerTp: number | null
}

/** Decide one candidate's trustworthy INR target price. Explicit "TP Rs X"
 *  language in `recoveryText` wins over NER (recovers the real value, kept
 *  even when small); a no-currency "TP 9700" is accepted only at >= 100;
 *  otherwise the NER value is trusted only when >= 100, else null. The
 *  < ₹100 floor is INR-scoped (this adapter path is always INR). */
export function validateOrRecoverTargetPrice(input: TargetPriceInput): number | null {
  const haystack = input.recoveryText.replace(/\s+/g, ' ')

  // 1. Explicit, currency-backed TP wins over NER.
  const currencyMatch = haystack.match(EXPLICIT_TP_RE) ?? haystack.match(BARE_TARGET_RE)
  if (currencyMatch) {
    const tp = parseTp(currencyMatch[1])
    if (tp !== null) return tp
  }

  // 2. No-currency explicit TP — weaker evidence, accepted only when >= 100.
  const bareMatch = haystack.match(NO_CURRENCY_TP_RE)
  if (bareMatch) {
    const tp = parseTp(bareMatch[1])
    if (tp !== null && tp >= 100) return tp
  }

  // 3. Fall back to the raw NER value, distrusting unconfirmed small numbers.
  if (input.parsedNerTp === null) return null
  if (input.parsedNerTp < 100) return null
  return input.parsedNerTp
}

export interface TpCandidate {
  readonly companyName: string
  readonly ticker: string
  /** The raw, untrusted NER tp string for this candidate ("4", "9,700", …). */
  readonly rawNerTp: string
}

/** Validate every candidate's target price for one email in a single pass.
 *  Explicit-TP recovery is scoped per candidate by run-ownership of the email
 *  text, so one stock's stated TP is never assigned to another. Returns a
 *  parallel array — `result[i]` is the validated tp for `candidates[i]`. */
export function validateTargetPrices(
  candidates: readonly TpCandidate[],
  textBody: string,
  subject: string,
): (number | null)[] {
  const full = `${subject}\n${textBody}`

  // One candidate (or none) owns the whole note — no scoping needed.
  if (candidates.length <= 1) {
    return candidates.map((c) =>
      validateOrRecoverTargetPrice({ recoveryText: full, parsedNerTp: parseTp(c.rawNerTp) }))
  }

  const needles = buildNeedleSets(candidates)
  const segments = full.split(/(?<=[.!?])\s+|\n+/)

  // Run-ownership: each segment belongs to the candidate most recently named.
  // A segment naming nobody inherits the current owner; one naming two or more
  // candidates is left unowned (its TP, if any, is assigned to no one).
  const ownerOf = new Array<number>(segments.length).fill(-1)
  let owner = -1
  for (let s = 0; s < segments.length; s++) {
    const lc = segments[s].toLowerCase()
    let named = -1
    let namedCount = 0
    for (let c = 0; c < needles.length; c++) {
      if (needles[c].some((n) => lc.includes(n))) { named = c; namedCount++ }
    }
    if (namedCount === 1) owner = named
    else if (namedCount > 1) owner = -1
    ownerOf[s] = owner
  }

  return candidates.map((c, ci) => {
    const owned = segments.filter((_, s) => ownerOf[s] === ci).join('  ')
    return validateOrRecoverTargetPrice({ recoveryText: owned, parsedNerTp: parseTp(c.rawNerTp) })
  })
}

/** Per-candidate lowercased match needles: the company name, the ticker, and
 *  the first distinctive word of the name when it is collision-free against
 *  every other candidate (so "Apollo" can match a body that never repeats the
 *  full "Apollo Hospitals"). */
function buildNeedleSets(candidates: readonly TpCandidate[]): string[][] {
  const base = candidates.map((c) =>
    [c.companyName, c.ticker].map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3))
  return candidates.map((c, i) => {
    const set = [...base[i]]
    const fw = firstWord(c.companyName)
    if (fw) {
      const collides = base.some((b, j) => j !== i && b.some((n) => n.includes(fw) || fw.includes(n)))
      if (!collides && !set.includes(fw)) set.push(fw)
    }
    return set
  })
}

/** First word of a company name with length >= 4 (skips short tokens like
 *  "The" or "Max"). Lowercased. Null when there is none. */
function firstWord(name: string): string | null {
  for (const w of name.trim().toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 4) return w
  }
  return null
}
