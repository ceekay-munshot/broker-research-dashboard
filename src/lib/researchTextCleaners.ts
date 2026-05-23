// ─────────────────────────────────────────────────────────────────────────
// Display-only cleaner for broker-note key points.
//
// The note-insight extractor in src/adapters/serverOutput/noteInsight.ts
// already stops at the first signature / disclaimer line via its
// `TAIL_MARKER` regex, but the cleanup still misses real-world boilerplate
// that creeps into earlier paragraphs — contact blocks, jurisdictional
// addresses, unsubscribe lines, "this communication forms part of"
// disclaimer continuations. Those bullets reach the drawer and read like
// real analyst takeaways.
//
// This module filters them at render time so the existing extractor output
// stays untouched and the Source-of-truth data is preserved. The filter is
// deliberately conservative: each pattern is anchored to a clear shape so
// a legitimate prose bullet that *contains* a phone number or an email
// isn't pruned. Never throws.
//
// Mirrors patterns from noteInsight.ts (`FOOTER` / `TAIL_MARKER`) plus the
// canonical noise lines observed in production screenshots.
// ─────────────────────────────────────────────────────────────────────────

const BOILERPLATE_PATTERNS: readonly RegExp[] = [
  // ── Mirror noteInsight TAIL_MARKER family (sign-offs / footer headers) ──
  /^(?:best|warm|kind)\s+regards\b/i,
  /^(?:regards|thanks|thank\s+you|cheers)\b/i,
  /^please\s+(?:find|follow|refer|see)\b/i,
  /^disclaimer\b/i,
  /this\s+(?:message|e-?mail|communication)\b[^.]{0,80}confidential/i,
  /sebi\s+research\s+analyst\s+reg/i,
  /compliance\s+officer/i,
  /investments?\s+in\s+securities\s+market\s+are\s+subject/i,
  /mutual\s+funds?\b[^.]{0,40}market\s+risk/i,

  // ── Screenshot-derived additions (the canonical noise lines we want
  //    out of the new "Key takeaways" section)
  /^contact\s+[A-Z][\w\s.]+\+?\d/i,                       // "Contact Aditya Jhawar +91 (22) 6849 7415"
  /this\s+communication\s+forms\s+part\s+of/i,            // disclaimer body
  /the\s+disclaimer\s+is\s+deemed\s+to\s+form\s+part/i,   // disclaimer continuation
  /click\s+here\s+to\s+unsubscribe/i,                     // unsubscribe lines
  /^--\s*$/,                                              // bare "--" separator
  /^[\w.+-]+@[\w-]+\.[\w.-]+(?:\s|$)/i,                   // bullet that STARTS with an email
  /\bin\s+the\s+case\s+of\s+(?:SA|UK|Australia)\b/i,      // jurisdiction disclaimer
  /please\s+obtain\s+a\s+copy\s+thereof/i,                // "please obtain a copy thereof from us"
]

/** True when the bullet clearly matches a boilerplate / footer pattern.
 *  Conservative by design: each regex is anchored or context-rich enough
 *  that a legitimate analyst takeaway that *happens* to mention an email
 *  / phone / disclaimer keyword isn't pruned. */
export function isBoilerplateKeyPoint(text: string): boolean {
  if (typeof text !== 'string') return false
  const trimmed = text.trim()
  if (trimmed === '') return true   // empty bullets are noise too
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(trimmed)) return true
  }
  return false
}

/** Filter a list of key-point bullets to drop boilerplate. Order is
 *  preserved so the index-based evidence lookup in the drawer still
 *  resolves when the caller keeps the original indices. */
export function cleanDisplayKeyPoints(points: readonly string[]): readonly string[] {
  return points.filter((p) => !isBoilerplateKeyPoint(p))
}
