// NephroPlus is a representative acceptance fixture, not a special-case parser.
//
// Runs the general, sector-agnostic note-insight extractor against the real
// NephroPlus broker email shipped in the preview fixture and asserts the
// structured output. Assertions match labels case-insensitively / by value so
// they verify the general extractor rather than a fitted parser.
//
// Run: npx tsx src/adapters/serverOutput/__tests__/noteInsight.ts

import { readFileSync } from 'node:fs'
import { extractNoteInsight } from '../noteInsight'

const fixtureUrl = new URL('../previewFixture/emailApiResponse.sample.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
  readonly data: { readonly emails: readonly { readonly subject: string; readonly text_body: string }[] }
}

const nephro = fixture.data.emails.find((e) => /nephroplus/i.test(e.subject))
if (!nephro) {
  console.error('FAIL — no NephroPlus email found in the preview fixture')
  process.exit(1)
}

const insight = extractNoteInsight({
  subject: nephro.subject,
  textBody: nephro.text_body,
  rating: 'Buy',
  reportType: 'earnings_review',
  companyName: 'NephroPlus',
  ticker: 'NEPHRO',
})

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

function hasNumber(labelRe: RegExp, valueRe: RegExp): boolean {
  return insight.keyNumbers.some((n) => labelRe.test(n.label) && valueRe.test(n.value))
}

console.log('extractNoteInsight — NephroPlus acceptance\n')

check('thesis is non-null', insight.thesis !== null, JSON.stringify(insight.thesis))
check('thesis names the company', !!insight.thesis && /nephroplus/i.test(insight.thesis))
check('keyNumbers — Revenue +32%', hasNumber(/revenue/i, /\+?32\s*%/))
check('keyNumbers — EBITDA +41%', hasNumber(/^ebitda$/i, /\+?41\s*%/))
check('keyNumbers — EBITDA margin 23.7%', hasNumber(/margin/i, /23\.7\s*%/))
check('keyNumbers — Rev/EBITDA/EPS CAGR 19/24/39%', hasNumber(/cagr/i, /19\/24\/39\s*%/))
check('upsidePct === 22', insight.upsidePct === 22, String(insight.upsidePct))

// No compliance / signature / footer boilerplate may leak into any field.
const FOOTER = /\bSEBI\b|\bcompliance\b|\bconfidential\b|\bregards\b|\+91[\s\d]/i
const allText = [
  insight.thesis ?? '',
  ...insight.keyNumbers.map((n) => `${n.label} ${n.value}`),
  ...insight.watchpoints,
].join(' || ')
check('no compliance / footer text in any field', !FOOTER.test(allText), allText)

console.log(`\nkeyNumbers:  ${insight.keyNumbers.map((n) => `${n.label} ${n.value}`).join('  ·  ') || '(none)'}`)
console.log(`watchpoints: ${insight.watchpoints.join('  ·  ') || '(none)'}`)
console.log(`actionLabel: ${insight.actionLabel ?? '(none)'}`)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
