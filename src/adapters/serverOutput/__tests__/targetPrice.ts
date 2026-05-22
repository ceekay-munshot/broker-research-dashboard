// Tests for the target-price hygiene helper.
// Run: npx tsx src/adapters/serverOutput/__tests__/targetPrice.ts

import { readFileSync } from 'node:fs'
import { validateOrRecoverTargetPrice, validateTargetPrices, parseTp } from '../targetPrice'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

/** Explicit-text recovery: no NER value, just text. */
function recover(text: string): number | null {
  return validateOrRecoverTargetPrice({ recoveryText: text, parsedNerTp: null })
}
/** NER-value handling: a raw NER tp plus optional confirming text. */
function nerVal(rawNerTp: string, text = ''): number | null {
  return validateOrRecoverTargetPrice({ recoveryText: text, parsedNerTp: parseTp(rawNerTp) })
}

console.log('target-price hygiene\n')

// ── Currency-backed explicit recovery ──────────────────────────────────────
check('TP Rs 745 (22% upside) → 745', recover('BUY. TP Rs 745 (22% upside).') === 745)
check('our TP of Rs745 → 745', recover('We maintain our TP of Rs745.') === 745)
check('target price to Rs 7,500 → 7500', recover('We raise our target price to Rs 7,500.') === 7500)
check('PT ₹2,940 → 2940', recover('Initiate with PT ₹2,940 on the stock.') === 2940)
check('fair value ₹414 → 414', recover('Fair value ₹414 implies limited upside.') === 414)
check('un-grouped TP Rs9700 → 9700', recover('BUY. TP Rs9700.') === 9700)

// ── No-currency explicit TP (≥₹100 gate) ───────────────────────────────────
check('TP 9700 → 9700', recover('Maintain BUY. TP 9700.') === 9700)
check('PT 2940 → 2940', recover('PT 2940 on the stock.') === 2940)
check('Target price 7500 → 7500', recover('Target price 7500.') === 7500)
check('TP 32 (no currency, below ₹100) → null', recover('TP 32.') === null)

// ── Non-TP context must NOT yield a number ─────────────────────────────────
check('4QFY26 result review → null', recover('Apollo (4QFY26) result review. 4QFY26 was strong.') === null)
check('24/7 expected to achieve … → null', recover('24/7 expected to achieve break-even in 1Q/3QFY27.') === null)
check('Revenue +32%, EBITDA +41%, margin 23.7% → null', recover('Revenue +32%, EBITDA +41%, margin 23.7%.') === null)
check('trading at 21/16x EBITDA → null', recover('The stock trades at 21/16x FY27/28 EBITDA.') === null)
check('19/24/39% CAGR → null', recover('We model 19/24/39% Rev/EBITDA/EPS CAGR.') === null)
check('target of … run-rate of Rs250bn → null', recover('mgmt reiterated its target of achieving annualised revenue run-rate of Rs250bn.') === null)

// ── NER value handling (suspicious threshold ₹100) ─────────────────────────
check('NER "4" + no text → null', nerVal('4') === null)
check('NER "32" + no text → null', nerVal('32') === null)
check('NER "32" + body "TP ₹32" → 32', nerVal('32', 'Reiterate BUY, TP ₹32.') === 32)
check('NER "10" + no text → null', nerVal('10') === null)
check('NER "10" + body "target price Rs10" → 10', nerVal('10', 'Our target price Rs10.') === 10)
check('NER "414" + no text → 414', nerVal('414') === 414)
check('NER "414" + body "TP ₹414" → 414', nerVal('414', 'Reiterate ADD, TP ₹414.') === 414)
check('NER "9700" + no text → 9700', nerVal('9700') === 9700)

// ── parseTp primitive ──────────────────────────────────────────────────────
check('parseTp("9,700") → 9700', parseTp('9,700') === 9700)
check('parseTp("N/A") → null', parseTp('N/A') === null)
check('parseTp("") → null', parseTp('') === null)
check('parseTp("0") → null', parseTp('0') === null)

// ── Candidate-scoped recovery (multi-stock emails) ─────────────────────────
const MULTI = 'Apollo Hospitals BUY TP Rs9,700.\nMax Healthcare BUY TP Rs1,450.\nKIMS BUY TP Rs740.'
const multiTps = validateTargetPrices([
  { companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '' },
  { companyName: 'Max Healthcare', ticker: 'MAXHEALTH', rawNerTp: '' },
  { companyName: 'KIMS', ticker: 'KIMS', rawNerTp: '' },
], MULTI, '')
check('multi-stock: Apollo → 9700', multiTps[0] === 9700, String(multiTps[0]))
check('multi-stock: Max → 1450', multiTps[1] === 1450, String(multiTps[1]))
check('multi-stock: KIMS → 740', multiTps[2] === 740, String(multiTps[2]))

check('single-company note → 9700', validateTargetPrices(
  [{ companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '4' }],
  'Apollo Hospitals BUY TP Rs9,700.', '')[0] === 9700)

// Wrong-scope guard — Apollo's TP must not bleed onto Max.
const GUARD = 'Apollo Hospitals BUY TP Rs9,700.\nMax Healthcare result review.'
const guardTps = validateTargetPrices([
  { companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '9700' },
  { companyName: 'Max Healthcare', ticker: 'MAXHEALTH', rawNerTp: '4' },
], GUARD, '')
check('wrong-scope guard: Apollo → 9700', guardTps[0] === 9700, String(guardTps[0]))
check('wrong-scope guard: Max (NER "4") → null, NOT 9700', guardTps[1] === null, String(guardTps[1]))

// Multi-stock NER fallback — KIMS has no explicit TP near it.
const NO_KIMS_TP = 'Apollo Hospitals BUY TP Rs9,700.\nKIMS result review, no rating change.'
check('multi-stock NER fallback: KIMS NER "740" → 740', validateTargetPrices([
  { companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '' },
  { companyName: 'KIMS', ticker: 'KIMS', rawNerTp: '740' },
], NO_KIMS_TP, '')[1] === 740)
check('multi-stock NER fallback: KIMS NER "32" → null', validateTargetPrices([
  { companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '' },
  { companyName: 'KIMS', ticker: 'KIMS', rawNerTp: '32' },
], NO_KIMS_TP, '')[1] === null)

// ── Apollo end-to-end against the real preview fixture ─────────────────────
const fixtureUrl = new URL('../previewFixture/emailApiResponse.sample.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
  readonly data: { readonly emails: readonly { readonly subject: string; readonly text_body: string }[] }
}
const apollo = fixture.data.emails.find((e) => /apollo hospitals.*strong execution/i.test(e.subject))
if (!apollo) {
  console.error('  FAIL Apollo "Strong execution" fixture email not found')
  failed++
} else {
  // The email's NER tagged the broker (IIFL) as entities alongside the real
  // stock — three candidates. Run-ownership must still recover ₹9,700 for
  // APOLLOHOSP from the body (NER gave it the bogus "4").
  const apolloTps = validateTargetPrices([
    { companyName: 'Apollo Hospitals', ticker: 'APOLLOHOSP', rawNerTp: '4' },
    { companyName: 'IIFL', ticker: 'IIFL', rawNerTp: 'N/A' },
    { companyName: 'IIFL Capital Services Ltd', ticker: 'IIFLCAPS', rawNerTp: 'N/A' },
  ], apollo.text_body, apollo.subject)
  check('Apollo fixture: APOLLOHOSP recovers ₹9,700 (NER said 4)', apolloTps[0] === 9700, String(apolloTps[0]))
  check('Apollo fixture: broker candidate IIFL gets no TP', apolloTps[1] === null, String(apolloTps[1]))
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
