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

import { readFileSync } from 'node:fs'
import { emailApiResponseToServerOutput } from '../emailApiTransform'
import { extractSubjectName } from '../../../lib/reportSubject'

const fixtureUrl = new URL('../previewFixture/emailApiResponse.sample.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as {
  readonly data: { readonly emails: readonly { readonly subject: string; readonly text_body: string }[] }
}
function fixtureBody(re: RegExp): string {
  const e = fixture.data.emails.find((x) => re.test(x.subject))
  if (!e) throw new Error(`no fixture email matching ${re}`)
  return e.text_body
}

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

test('a stock with a ticker but no rating/TP gets a body-derived summary, but still no opinion', () => {
  // Policy: if NER missed rating/TP but the body has substantive prose, we
  // surface what's there (thesis from the body). Opinions remain gated on
  // NER rating/TP — no invented rating, no invented target.
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
  assert(rpt!.summaryId, 'summary exists — the body produced a thesis even without a broker call')
  const summary = out.summaries.find((s) => s.id === rpt!.summaryId)
  assert(summary, 'the summary was pushed')
  assertEqual(summary!.rating, null, 'summary rating stays null — NER said N/A')
  assertEqual(summary!.targetPrice, null, 'summary target stays null — NER said N/A')
  assert(summary!.thesis.length > 0, 'the body line became the thesis')
  assertEqual(out.opinions.some((o) => String(o.ticker) === 'TATASTEEL'), false, 'no opinion invented')
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

test('extractSubjectName rejects generic market / macro / strategy subjects', () => {
  assertEqual(extractSubjectName('Daily Summary: Fed concerns impact markets'), null, 'daily summary')
  assertEqual(extractSubjectName('Market Wrap: Banks rally'), null, 'market wrap')
  assertEqual(extractSubjectName('India Strategy: Election update'), null, 'india strategy')
  assertEqual(extractSubjectName('Morning Insight 24 April 2026'), null, 'morning insight + date')
  assertEqual(extractSubjectName('Sector Update: Hospitals'), null, 'sector update')
  assertEqual(extractSubjectName('Economy Update: RBI commentary'), null, 'economy update')
  assertEqual(extractSubjectName('Daily Note: market commentary'), null, 'daily note')
  // Real company titles still resolve.
  assertEqual(extractSubjectName('Apollo Hospitals (4QFY26): Strong quarter'), 'Apollo Hospitals', 'company kept')
  assertEqual(extractSubjectName('PI Industries: Operating miss - Hold'), 'PI Industries', 'company kept')
})

// ── New-policy regression: body-derived enrichment without an NER call ───
//
// These are the headline regression tests for the bug where notes from
// forwarders showed up as title-only in the Overview feed because the
// transform's summary gate required an NER rating or TP. The fix runs the
// extractor unconditionally and surfaces what it produces — but opinions
// stay correctly gated, so no rating or target is ever invented.

test('NephroPlus-shaped note: rich body + NER rating/TP both null still gets a summary', () => {
  // Mirrors the production NephroPlus payload: forwarder + IIFL upstream,
  // NER returned "No match" / "N/A" for the stock, but the body is rich.
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e-nephro',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'simran@beascapital.in',
    original_sender_name: 'Simran Thakkar',
    subject: 'Fwd: Fw: NephroPlus – Underappreciated healthcare play – BUY',
    text_body: fixtureBody(/nephroplus/i),
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u-nephro', type: 'BODY', filename: 'body.txt',
      metadata: {
        ner_results: {
          'NephroPlus': { ticker: 'No match', rating: 'N/A', tp: 'N/A' },
          // The broker also shows up — entityRole must filter it out before
          // it pollutes the primary identity.
          'IIFL': { ticker: 'IIFL', rating: 'BUY', tp: 'N/A' },
        },
      },
    }],
  }]))

  const rpt = out.reports.find((r) => r.title.toLowerCase().includes('nephroplus'))
  assert(rpt, 'a NephroPlus report was created')
  assert(rpt!.summaryId, 'summary exists — body produced surfacing-worth signal even without NER call')

  const summary = out.summaries.find((s) => s.id === rpt!.summaryId)
  assert(summary, 'the summary was pushed')
  assertEqual(summary!.rating, null, 'summary rating stays null — NER said N/A')
  assertEqual(summary!.targetPrice, null, 'summary target stays null — NER said N/A')

  // No fake opinions for NephroPlus or for IIFL (the broker).
  assertEqual(
    out.opinions.some((o) => /nephro/i.test(String(o.ticker))), false,
    'no opinion invented for NephroPlus despite the rich body',
  )
  assertEqual(
    out.opinions.some((o) => String(o.ticker) === 'IIFL'), false,
    'the broker house never becomes an opinion',
  )

  // The whole point of the fix — body enrichment now reaches the UI.
  assert(summary!.thesis.length > 0, 'thesis was extracted from the body')
  assert(/nephroplus/i.test(summary!.thesis), 'thesis names the company')
  assert(summary!.keyPoints.length >= 1, 'at least one supporting key-point paragraph')

  const labels = summary!.keyNumbers.map((n) => n.label).join(' || ')
  assert(/revenue/i.test(labels), `keyNumbers include Revenue — got: ${labels}`)
  assert(/ebitda/i.test(labels), `keyNumbers include EBITDA — got: ${labels}`)
  assert(/margin/i.test(labels), `keyNumbers include EBITDA margin — got: ${labels}`)

  assertEqual(summary!.upsidePct, 22, 'upside % was captured from the body')
  assertEqual(summary!.actionLabel, 'BUY idea', 'title-based BUY detector produces BUY idea')
})

test('a Hold-in-title note with no NER call gets the Hold / monitor action label', () => {
  // PI Industries shape: subject ends with "- Hold", NER says nothing.
  // We want the display label to read the title and surface "Hold / monitor"
  // without ever creating a Hold opinion.
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e-pi',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'simran@beascapital.in',
    original_sender_name: 'Simran Thakkar',
    subject: 'PI Industries: Operating miss, recovery some time away - Hold',
    text_body: '*From:* Investec Research <research@investec.com>\n\n'
      + 'PI Industries 4QFY26 result review: operating performance came in '
      + 'below estimates, with margin pressure across the agrochem export '
      + 'business. Management commentary on the timing of the recovery '
      + 'remains cautious. We maintain our rating; valuation looks fair.',
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u-pi', type: 'BODY', filename: 'body.txt',
      metadata: { ner_results: { 'PI Industries': { ticker: 'No match', rating: 'N/A', tp: 'N/A' } } },
    }],
  }]))

  const rpt = out.reports.find((r) => r.title.toLowerCase().includes('pi industries'))
  assert(rpt, 'a PI Industries report was created')
  assert(rpt!.summaryId, 'summary exists — body has prose worth surfacing')

  const summary = out.summaries.find((s) => s.id === rpt!.summaryId)
  assert(summary, 'the summary was pushed')
  assertEqual(summary!.rating, null, 'no Hold opinion is invented from the title')
  assertEqual(summary!.targetPrice, null, 'no target invented')
  assertEqual(summary!.actionLabel, 'Hold / monitor', 'title-detector produces Hold / monitor')
  assertEqual(out.opinions.length, 0, 'no opinion created despite the title-derived label')
})

test('a truly empty / header-only email stays summary-less', () => {
  // The safety boundary: when the body has nothing usable AND the title
  // carries no standalone rating, do not invent a summary. Locks in that
  // the new policy did not open the floodgates on noise.
  const out = emailApiResponseToServerOutput(payload([{
    id: 'e-empty',
    forwarded_by_email: 'ceekay@muns.io',
    original_sender_email: 'simran@beascapital.in',
    original_sender_name: 'Simran Thakkar',
    subject: 'Tata Steel: capacity ramp on track',  // no standalone rating at end
    text_body: '*From:* Research Desk <research@kotak.com>\n*Sent:* 22 May 2026\n*Subject:* Update',
    received_at: '2026-05-22T09:00:00.000Z',
    uploads: [{
      id: 'u-empty', type: 'BODY', filename: 'body.txt',
      metadata: { ner_results: { 'Tata Steel': { ticker: 'TATASTEEL', rating: 'N/A', tp: 'N/A' } } },
    }],
  }]))

  const rpt = out.reports.find((r) => r.title.toLowerCase().includes('tata steel'))
  assert(rpt, 'a report was still created (identity decoupled from summary)')
  assertEqual(rpt!.summaryId, null, 'no summary — body is header-only and title has no standalone rating')
  assertEqual(out.opinions.length, 0, 'no opinion invented')
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
