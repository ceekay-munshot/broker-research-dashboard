// NephroPlus and Eris are representative acceptance fixtures, not special-case
// parsers.
//
// Each runs the general, sector-agnostic note-insight extractor against a real
// forwarded broker email shipped in the preview fixture and asserts the
// structured output. Assertions match labels case-insensitively / by value so
// they verify the general extractor rather than a fitted parser. Eris is the
// regression guard for a line-wrapped forwarded Subject leaking into the thesis.
//
// Run: npx tsx src/adapters/serverOutput/__tests__/noteInsight.ts

import { readFileSync } from 'node:fs'
import { extractNoteInsight, type NoteInsight } from '../noteInsight'

const fixtureUrl = new URL('../previewFixture/emailApiResponse.sample.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
  readonly data: { readonly emails: readonly { readonly subject: string; readonly text_body: string }[] }
}

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

/** First fixture email whose subject matches — fails the run when absent. */
function emailMatching(re: RegExp) {
  const email = fixture.data.emails.find((e) => re.test(e.subject))
  if (!email) {
    console.error(`FAIL — no email matching ${re} in the preview fixture`)
    process.exit(1)
  }
  return email
}

function hasNumber(insight: NoteInsight, labelRe: RegExp, valueRe: RegExp): boolean {
  return insight.keyNumbers.some((n) => labelRe.test(n.label) && valueRe.test(n.value))
}

// No signature / disclaimer / footer boilerplate may leak into any field —
// thesis, keyPoints, keyNumbers or watchpoints. Matched on footer-specific
// phrasing ("Compliance Officer", not bare "compliance") so legitimate
// research prose like "EU-GMP non-compliance" does not false-positive.
const FOOTER = /\bSEBI\b|compliance\s+officer|\bconfidential\b|\bregards\b|\+91[\s\d]/i
function allText(insight: NoteInsight): string {
  return [
    insight.thesis ?? '',
    ...insight.keyPoints,
    ...insight.keyNumbers.map((n) => `${n.label} ${n.value}`),
    ...insight.watchpoints,
  ].join(' || ')
}

function report(insight: NoteInsight): void {
  console.log(`\nthesis:      ${insight.thesis ? `${insight.thesis.length} chars` : '(none)'}`)
  console.log(`keyPoints:   ${insight.keyPoints.length}`)
  console.log(`keyNumbers:  ${insight.keyNumbers.map((n) => `${n.label} ${n.value}`).join('  ·  ') || '(none)'}`)
  console.log(`watchpoints: ${insight.watchpoints.join('  ·  ') || '(none)'}`)
  console.log(`actionLabel: ${insight.actionLabel ?? '(none)'}`)
}

// ── NephroPlus — representative acceptance ──────────────────────────────────

const nephroEmail = emailMatching(/nephroplus/i)
const nephro = extractNoteInsight({
  subject: nephroEmail.subject,
  textBody: nephroEmail.text_body,
  rating: 'Buy',
  reportType: 'earnings_review',
  companyName: 'NephroPlus',
  ticker: 'NEPHRO',
})

console.log('extractNoteInsight — NephroPlus acceptance\n')
check('thesis is non-null', nephro.thesis !== null, JSON.stringify(nephro.thesis))
check('thesis names the company', !!nephro.thesis && /nephroplus/i.test(nephro.thesis))
check('keyPoints — supporting paragraphs present', nephro.keyPoints.length >= 1, String(nephro.keyPoints.length))
check('keyNumbers — Revenue +32%', hasNumber(nephro, /revenue/i, /\+?32\s*%/))
check('keyNumbers — EBITDA +41%', hasNumber(nephro, /^ebitda$/i, /\+?41\s*%/))
check('keyNumbers — EBITDA margin 23.7%', hasNumber(nephro, /margin/i, /23\.7\s*%/))
check('keyNumbers — Rev/EBITDA/EPS CAGR 19/24/39%', hasNumber(nephro, /cagr/i, /19\/24\/39\s*%/))
check('upsidePct === 22', nephro.upsidePct === 22, String(nephro.upsidePct))
check('no compliance / footer text in any field', !FOOTER.test(allText(nephro)), allText(nephro))
report(nephro)

// ── Eris — the line-wrapped-Subject regression ──────────────────────────────
// The Eris email's forwarded Subject header wraps onto a second physical line
// ("growth – BUY"). That fragment must never leak into the thesis, and the
// thesis must be the analyst's complete opening paragraph — not a clamped
// sentence cut off mid-thought.

const erisEmail = emailMatching(/eris/i)
const eris = extractNoteInsight({
  subject: erisEmail.subject,
  textBody: erisEmail.text_body,
  rating: 'Buy',
  reportType: 'earnings_review',
  companyName: 'Eris Lifesciences',
  ticker: 'ERIS',
})
// Normalise curly apostrophes so the prefix assertion is quote-style agnostic.
const erisThesis = (eris.thesis ?? '').replace(/[‘’]/g, "'")

console.log('\nextractNoteInsight — Eris acceptance\n')
check('thesis is non-null', eris.thesis !== null, JSON.stringify(eris.thesis))
check('thesis has no leaked "growth – BUY" header fragment',
  !/growth\s*[–-]\s*BUY/i.test(erisThesis), JSON.stringify(erisThesis.slice(0, 50)))
check('thesis starts with the opening summary line',
  erisThesis.startsWith("Eris' overall grew only 7%"), JSON.stringify(erisThesis.slice(0, 50)))
check('thesis is complete — keeps the closing valuation line',
  /2YF ex-amort EPS/i.test(erisThesis), JSON.stringify(erisThesis.slice(-50)))
check('keyPoints — at least two supporting paragraphs', eris.keyPoints.length >= 2, String(eris.keyPoints.length))
check('no compliance / footer text in any field', !FOOTER.test(allText(eris)), allText(eris))
report(eris)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
