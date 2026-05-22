// ─────────────────────────────────────────────────────────────────────────
// reportSubject — derive a covered-company identity from a broker-note title.
//
// Broker NER frequently fails to resolve a ticker for the company a note is
// about — it returns "No match", or omits the company entirely. The note
// title, however, almost always names its subject up front:
//   "Apollo Hospitals (4QFY26): Strong quarter…"   → Apollo Hospitals
//   "First Take: Whirlpool of India - Tough year"  → Whirlpool of India
//   "PI Industries: Operating miss - Hold"         → PI Industries
//
// This module isolates that leading company phrase with conservative,
// delimiter-based rules — no hardcoded company names, no LLM. The title is
// evidence the entity-role classifier already trusts most (a name in the
// report title is its single strongest stock signal), so reading it for
// identity is consistent, not a guess.
//
// Pure functions: no React, no fetch.
// ─────────────────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace — a stable comparison
 *  key for matching company names and titles across notes. */
export function normalizeKey(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Generic throat-clearing prefixes that precede the company in a subject
// line. Stripped only when followed by an explicit separator, so a company
// whose name happens to start with one of these words is never truncated.
const SUBJECT_PREFIXES: readonly string[] = [
  'first take', 'quick take', 'flash note', 'flash', 'morning note',
  'morning brief', 'company update', 'event update', 'result update',
  'results', 'result', 'update', 'initiation',
]

/**
 * Extract the covered-company name from a (broker-prefix-stripped) note
 * title. Returns null when nothing that plausibly looks like a company name
 * can be isolated — callers then degrade to an honest "no identity" rather
 * than surfacing a guess.
 */
export function extractSubjectName(title: string): string | null {
  let s = (title ?? '').trim()
  if (!s) return null

  // Strip leading generic prefixes ("First Take: …", "Update - …"), repeating
  // so stacked prefixes ("Flash: Update: …") are all removed.
  for (let changed = true; changed; ) {
    changed = false
    for (const p of SUBJECT_PREFIXES) {
      const re = new RegExp(`^${p.replace(/ /g, '\\s+')}\\s*[:\\-–—]\\s*`, 'i')
      if (re.test(s)) { s = s.replace(re, ''); changed = true; break }
    }
  }

  // The company sits before the first commentary delimiter: a spaced dash,
  // a colon, or an opening parenthesis ("(4QFY26)").
  const cut = s.search(/\s[-–—]\s|[:(]/)
  if (cut > 0) s = s.slice(0, cut)
  s = s.replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '').trim()

  // Quality gate — a real company name is short, starts with a letter or
  // digit, and contains a letter. Anything else is treated as no identity.
  if (s.length < 2 || s.length > 60) return null
  if (!/[A-Za-z]/.test(s)) return null
  if (!/^[A-Za-z0-9]/.test(s)) return null
  if (s.split(/\s+/).length > 7) return null
  return s
}

/**
 * A stable grouping key for one stock identity: the ticker when present,
 * else the normalized display name, else a per-report fallback so a note
 * with no identity at all still stands on its own.
 */
export function stockIdentityKey(
  ticker: string | null,
  stockName: string | null,
  reportId: string,
): string {
  if (ticker) return `t:${ticker}`
  const n = stockName ? normalizeKey(stockName) : ''
  return n ? `n:${n}` : `r:${reportId}`
}
