#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// emailApiTransform test harness.
//
// Verifies that stock identity is decoupled from broker opinion: a company
// with a ticker but no call still gets a report ticker, a note NER could not
// ticker is rescued from its title (and a sibling note's resolved ticker),
// and a research house tagged by NER never becomes a covered stock.
// Exits 0 on all-pass, 1 on any failure. Run via `npm run test:transform`.
// ─────────────────────────────────────────────────────────────────────────

import { emailApiResponseToServerOutput } from '../emailApiTransform'
import { extractSubjectName } from '../../../lib/reportSubject'

interface TestResult { readonly name: string; readonly ok: boolean; readonly message?: string }
const results: TestResult[] = []

function test(name: string, fn: () => void): void {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    results.push({ name, ok: false, message: msg })
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}
function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

/** Wrap forwarded emails in the canonical `/email/forwarded` envelope. */
function payload(emails: readonly unknown[]): unknown {
  return { data: { emails } }
}
function tickers(r: { tickers: readonly unknown[] }): string[] {
  return r.tickers.map((t) => String(t))
}

// ── Identity decoupled from opinion ───────────────────────────────────────

test('a stock with a ticker but no rating/TP still gets a report ticker, no opinion', () => {
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e1',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'research@kotak.com',
    original_sender_name: 'Research Desk',
    subject: 'Tata Steel: capacity ramp on track',
    text_body: '*From:* Research Desk <research@kotak.com>\n\nTata Steel capacity ramp continues on plan.',
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u1', type: 'BODY', filename: 'body.txt',
      metadata: { ner_results: { 'Tata Steel': { ticker: 'TATASTEEL', rating: 'N/A', tp: 'N/A' } } },
    }],
  }]))
  const rpt = out.reports.find((r) => r.title.toLowerCase().includes('tata steel'))
  assert(rpt, 'a report was created')
  assertEqual(tickers(rpt!).includes('TATASTEEL'), true, 'the report carries the ticker')
  assertEqual(rpt!.summaryId, null, 'no summary — the note carries no broker call')
  assertEqual(out.opinions.some((o) => String(o.ticker) === 'TATASTEEL'), false, 'no opinion created')
  assert(
    out.stocks.some((s) => String(s.ticker) === 'TATASTEEL' && s.name === 'Tata Steel'),
    'a named Stock exists for the ticker',
  )
})

// ── Title + payload cross-reference rescue ────────────────────────────────

test('a sibling note rescues a stock NER could not ticker (title cross-reference)', () => {
  const out = emailApiResponseToServerOutput(payload([
    {
      id: 'e-apollo-1',
      forwarded_by_email: 'ceekay@muns.io',
      original_sender_email: 'research@iiflcap.com',
      original_sender_name: 'IIFL Research',
      subject: 'Apollo Hospitals - strong execution continues - BUY',
      text_body: '*From:* IIFL Research <research@iiflcap.com>\n\nApollo Hospitals continues to execute well; we stay BUY.',
      received_at: '2026-05-22T08:00:00.000Z',
      uploads: [{
        id: 'u-a1', type: 'BODY', filename: 'body.txt',
        metadata: { ner_results: { 'Apollo Hospitals': { ticker: 'APOLLOHOSP', rating: 'BUY', tp: '9700' } } },
      }],
    },
    {
      id: 'e-apollo-2',
      forwarded_by_email: 'ceekay@muns.io',
      original_sender_email: 'research@iiflcap.com',
      original_sender_name: 'IIFL Research',
      subject: 'Apollo Hospitals (4QFY26): strong quarter',
      text_body: '*From:* IIFL Research <research@iiflcap.com>\n\nApollo posted a strong 4QFY26 result.',
      received_at: '2026-05-22T09:00:00.000Z',
      uploads: [{
        id: 'u-a2', type: 'BODY', filename: 'body.txt',
        metadata: { ner_results: { 'Apollo': { ticker: 'No match', rating: 'N/A', tp: 'N/A' } } },
      }],
    },
  ]))
  const r1 = out.reports.find((r) => r.title.includes('strong execution'))
  const r2 = out.reports.find((r) => r.title.includes('4QFY26'))
  assert(r1 && r2, 'both reports were created')
  assertEqual(tickers(r1!).includes('APOLLOHOSP'), true, 'the rated note resolves APOLLOHOSP')
  assertEqual(
    tickers(r2!).includes('APOLLOHOSP'), true,
    'the untickered note inherits APOLLOHOSP from the sibling via its title',
  )
  assert(r1!.summaryId, 'the rated note has a summary')
  assertEqual(r2!.summaryId, null, 'the untickered note has no summary — it carries no call')
})

// ── Tickerless title identity ─────────────────────────────────────────────

test('a note NER cannot ticker, with no cross-reference, stays an untickered report', () => {
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e-wh',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'research@investec.com',
    original_sender_name: 'Investec Research',
    subject: 'First Take: Whirlpool of India - tough end to a challenging year',
    text_body: '*From:* Investec Research <research@investec.com>\n\nA tough end to a challenging year for the company.',
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u-wh', type: 'BODY', filename: 'body.txt',
      metadata: { ner_results: { 'ISPL': { ticker: 'No match', rating: 'N/A', tp: 'N/A' } } },
    }],
  }]))
  const rpt = out.reports.find((r) => r.title.includes('Whirlpool'))
  assert(rpt, 'a report was created')
  assertEqual(rpt!.tickers.length, 0, 'no ticker is invented when none can be resolved')
  assertEqual(out.stocks.length, 0, 'no Stock is invented')
  assertEqual(out.opinions.length, 0, 'no opinion is invented')
})

// ── Broker name is never a covered stock ──────────────────────────────────

test('NER tagging the broker house as a rated stock never creates a stock', () => {
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e-d',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'research@iiflcap.com',
    original_sender_name: 'IIFL Research',
    subject: 'Sansera Engineering: order wins - BUY',
    text_body: '*From:* IIFL Research <research@iiflcap.com>\n\nSansera Engineering won new orders; we stay BUY.',
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u-d', type: 'BODY', filename: 'body.txt',
      metadata: {
        ner_results: {
          'Sansera Engineering': { ticker: 'SANSERA', rating: 'BUY', tp: '1900' },
          'IIFL': { ticker: 'IIFL', rating: 'BUY', tp: '500' },
        },
      },
    }],
  }]))
  assert(out.stocks.some((s) => String(s.ticker) === 'SANSERA'), 'the covered stock is kept')
  assertEqual(
    out.stocks.some((s) => String(s.ticker) === 'IIFL'), false,
    'the research house is not surfaced as a stock',
  )
  assertEqual(
    out.opinions.some((o) => String(o.ticker) === 'IIFL'), false,
    'the research house gets no opinion',
  )
})

// ── Title parser ──────────────────────────────────────────────────────────

test('extractSubjectName isolates the company from a note title', () => {
  assertEqual(
    extractSubjectName('Apollo Hospitals (4QFY26): Strong quarter'), 'Apollo Hospitals',
    'cut at the opening parenthesis',
  )
  assertEqual(
    extractSubjectName('First Take: Whirlpool of India - Tough end to a challenging year'),
    'Whirlpool of India', 'strip the prefix, cut at the spaced dash',
  )
  assertEqual(
    extractSubjectName('PI Industries: Operating miss, recovery some time away - Hold'),
    'PI Industries', 'cut at the colon',
  )
  assertEqual(
    extractSubjectName('NephroPlus – Underappreciated healthcare play – BUY'), 'NephroPlus',
    'cut at the spaced en-dash',
  )
})

// ── Summary ───────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length
const failed = results.length - passed
for (const r of results) {
  if (r.ok) console.log(`  ok   ${r.name}`)
  else console.error(`  FAIL ${r.name}\n       ${r.message}`)
}
console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''}`)
process.exit(failed ? 1 : 0)
