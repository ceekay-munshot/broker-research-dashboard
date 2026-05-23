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
// With NER rating = Buy, the signal mirrors the formal rating. The transform
// will suppress the chip via the non-duplication rule before render — but
// the extractor still tags the source so the suppression has something to act on.
check('noteSignalKind === bullish_signal (NER Buy)', nephro.noteSignalKind === 'bullish_signal',
  String(nephro.noteSignalKind))
check('noteSignalSource === formal_rating (came from NER, not title)',
  nephro.noteSignalSource === 'formal_rating', String(nephro.noteSignalSource))
check('legacy actionLabel kept as "BUY idea" for back-compat',
  nephro.actionLabel === 'BUY idea', String(nephro.actionLabel))
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

// ── Title-only rating detectors — bullish / cautious / bearish ──────────────
// These are the new code path that the prior PR's "BUY idea" rule kicked off,
// now lifted into the typed NoteSignalKind enum + a NoteSignalSource.

console.log('\nextractNoteInsight — title-only rating detectors\n')

// NephroPlus title ends in "– BUY" but NER returned null rating.
const nephroNoRating = extractNoteInsight({
  subject: nephroEmail.subject,
  textBody: nephroEmail.text_body,
  rating: null,
  reportType: 'earnings_review',
  companyName: 'NephroPlus',
  ticker: 'NEPHRO',
})
check('NephroPlus title-only: noteSignalKind === bullish_signal',
  nephroNoRating.noteSignalKind === 'bullish_signal', String(nephroNoRating.noteSignalKind))
check('NephroPlus title-only: noteSignalSource === title (no formal rating)',
  nephroNoRating.noteSignalSource === 'title', String(nephroNoRating.noteSignalSource))

// PI Industries-shaped subject ending with "- Hold".
const piHold = extractNoteInsight({
  subject: 'PI Industries: Operating miss, recovery some time away - Hold',
  textBody: 'PI Industries 4QFY26 result review: operating performance came in below estimates, with margin pressure across the agrochem export business. Management commentary on the timing of the recovery remains cautious. We maintain our rating; valuation looks fair.',
  rating: null,
  reportType: 'earnings_review',
  companyName: 'PI Industries',
  ticker: 'PIIND',
})
check('Hold title: noteSignalKind === cautious_signal',
  piHold.noteSignalKind === 'cautious_signal', String(piHold.noteSignalKind))
check('Hold title: noteSignalSource === title',
  piHold.noteSignalSource === 'title', String(piHold.noteSignalSource))
check('Hold title: legacy actionLabel === "Hold / monitor"',
  piHold.actionLabel === 'Hold / monitor', String(piHold.actionLabel))

// Bearish title — symmetric with bullish/neutral.
const sellTitle = extractNoteInsight({
  subject: 'Acme Inc — derate on margin pressure — Sell',
  textBody: 'Acme Inc faces sustained margin pressure across its core categories. Multiple expansion looks limited. We move our rating cautious.',
  rating: null,
  reportType: 'earnings_review',
  companyName: 'Acme Inc',
  ticker: 'ACME',
})
check('Sell title: noteSignalKind === bearish_signal',
  sellTitle.noteSignalKind === 'bearish_signal', String(sellTitle.noteSignalKind))
check('Sell title: noteSignalSource === title',
  sellTitle.noteSignalSource === 'title', String(sellTitle.noteSignalSource))

// Underweight + Underperform + Reduce all also map to bearish_signal.
for (const word of ['Underweight', 'Underperform', 'Reduce']) {
  const out = extractNoteInsight({
    subject: `Some Company - thesis recap - ${word}`,
    textBody: 'Some Company posted a soft quarter and we see continued pressure on near-term earnings. Maintaining our cautious view through the upcoming guidance cycle.',
    rating: null, reportType: 'update', companyName: 'Some Company', ticker: 'SOMECO',
  })
  check(`title ending "- ${word}" → bearish_signal`,
    out.noteSignalKind === 'bearish_signal', String(out.noteSignalKind))
}

// ── Negative space: false-positive guards ───────────────────────────────────
// "we maintain Buy" in the body must NOT trigger the title detector — it
// runs on the subject only.
const bodyOnlyBuy = extractNoteInsight({
  subject: 'Generic update',  // no standalone rating at end
  textBody: 'We maintain Buy at current levels. Earnings growth continues to track in line.',
  rating: null, reportType: 'update', companyName: 'X Co', ticker: 'X',
})
check('body-only "Buy" prose does NOT trigger title detector',
  bodyOnlyBuy.noteSignalSource !== 'title', String(bodyOnlyBuy.noteSignalSource))

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
