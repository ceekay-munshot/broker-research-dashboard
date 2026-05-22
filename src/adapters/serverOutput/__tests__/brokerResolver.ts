#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// brokerResolver / entityRole test harness.
//
// Verifies that forwarded broker research is attributed to the real research
// house — never the forwarder — and that a broker's own name is not mistaken
// for a covered stock. Exits 0 on all-pass, 1 on any failure with a summary.
// Run via `npm run test:resolver`.
// ─────────────────────────────────────────────────────────────────────────

import { buildEmailBrokerContext, resolveBrokerForNote } from '../brokerResolver'
import { classifyNoteEntity, type NoteEntityContext } from '../entityRole'
import { emailApiResponseToServerOutput } from '../emailApiTransform'

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

// ── Fixtures ──────────────────────────────────────────────────────────────

const IIFL_DISCLAIMER =
  'This message (including any attachments) is confidential and may be privileged. ' +
  'Neither IIFL nor its group companies shall be liable. ' +
  'IIFL Capital Services Limited, SEBI Research Analyst Reg no: INH000000248.'

/** A forwarded IIFL note — Simran forwarded an IIFL analyst's email. */
const iiflCtx = buildEmailBrokerContext({
  subject: 'Fwd: Fw: NephroPlus – Underappreciated healthcare play – BUY',
  textBody: [
    '---------- Forwarded message ---------',
    'From: Simran Thakkar <simran@beascapital.in>',
    'Date: Thu, May 21, 2026 at 8:12 PM',
    'To: Chiraag Kapil <ceekay@muns.io>',
    '------------------------------',
    '*From:* Naman Bagrecha, IIFLCAP <naman.bagrecha@iiflcap.com>',
    '*Sent:* Wednesday, May 20, 2026',
    '*Subject:* NephroPlus – Underappreciated healthcare play – BUY',
    '',
    'NephroPlus delivered strong revenue growth of 32% YoY. Maintain BUY.',
    IIFL_DISCLAIMER,
  ].join('\n'),
  originalSenderEmail: 'simran@beascapital.in',
  originalSenderName: 'Simran Thakkar',
  forwardedByEmail: 'ceekay@muns.io',
})

// ── Broker resolution ─────────────────────────────────────────────────────

test('forwarded IIFL note resolves to IIFL Securities, not the forwarder', () => {
  const res = resolveBrokerForNote({ filename: 'body.txt' }, iiflCtx)
  assertEqual(res.brokerCanonicalName, 'IIFL Securities', 'canonical name')
  assertEqual(res.resolutionClass, 'mapped', 'resolution class')
  assertEqual(res.brokerSource, 'forwarded_body_header', 'winning source')
  assert(res.isMapped, 'isMapped true')
  assert(!res.isUnresolved, 'isUnresolved false')
})

test('forwarders (Simran / Rahul / Chiraag) never become the broker', () => {
  for (const ctx of [iiflCtx]) {
    const res = resolveBrokerForNote({ filename: 'body.txt' }, ctx)
    const lc = res.brokerCanonicalName.toLowerCase()
    assert(!lc.includes('simran') && !lc.includes('rahul') && !lc.includes('chiraag'),
      `broker is a research house, got "${res.brokerCanonicalName}"`)
  }
  // A bare forwarder note with no research evidence must NOT name a person.
  const bare = buildEmailBrokerContext({
    subject: 'Fwd: have a look',
    textBody: 'From: Rahul Mehta <rahul@beascapital.in>\n\nThoughts?',
    originalSenderEmail: 'rahul@beascapital.in',
    originalSenderName: 'Rahul Mehta',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const res = resolveBrokerForNote({ filename: 'body.txt' }, bare)
  assert(!res.isMapped, 'unresolved, not a mapped broker')
  assert(!res.brokerCanonicalName.toLowerCase().includes('rahul'), 'never the forwarder name')
})

test('report-level resolution — two attachments resolve to their own houses', () => {
  const ctx = buildEmailBrokerContext({
    subject: 'Fwd: Few Emails and Reports',
    textBody: 'Hi, please find a couple of reports attached.\nThanks',
    originalSenderEmail: 'chiraag@vimanacapital.com',
    originalSenderName: 'Chiraag Kapil',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const gs = resolveBrokerForNote({ filename: 'Goldman Sachs - TCS Strategy.pdf' }, ctx)
  const ambit = resolveBrokerForNote({ filename: 'Ambit Capital - Infosys Update.pdf' }, ctx)
  assertEqual(gs.brokerCanonicalName, 'Goldman Sachs', 'attachment 1 → GS')
  assertEqual(ambit.brokerCanonicalName, 'Ambit Capital', 'attachment 2 → Ambit')
  assert(gs.brokerId !== ambit.brokerId, 'two attachments → two distinct brokers')
})

test('an email bundling two houses gets emails[].brokerId = brk_mixed_sources', () => {
  const out = emailApiResponseToServerOutput({
    data: { emails: [{
      id: 'mix-1',
      forwarded_by_email: 'ceekay@muns.io',
      original_sender_email: 'chiraag@vimanacapital.com',
      original_sender_name: 'Chiraag Kapil',
      subject: 'Fwd: Few Emails and Reports',
      text_body: 'Two reports attached.',
      received_at: '2026-05-21T10:00:00.000Z',
      uploads: [
        { id: 'u-gs', type: 'ATTACHMENT', filename: 'Goldman Sachs - TCS Strategy.pdf',
          metadata: { ner_results: { TCS: { ticker: 'TCS', rating: 'BUY', tp: '4500' } } } },
        { id: 'u-ambit', type: 'ATTACHMENT', filename: 'Ambit Capital - Infosys Update.pdf',
          metadata: { ner_results: { Infosys: { ticker: 'INFY', rating: 'ADD', tp: '1800' } } } },
      ],
    }] },
  })
  assertEqual(out.emails.length, 1, 'one email')
  assertEqual(out.emails[0].brokerId as unknown as string, 'brk_mixed_sources', 'email is mixed')
  const brokerIds = new Set(out.reports.map((r) => r.brokerId as unknown as string))
  assertEqual(out.reports.length, 2, 'two reports')
  assertEqual(brokerIds.size, 2, 'two distinct report brokers')
  assert(!out.brokers.some((b) => b.name === 'Mixed Sources'),
    'Mixed Sources is an email-level label only — never in the broker catalog')
})

test('an unmapped research-house domain → unmapped_research_house', () => {
  const ctx = buildEmailBrokerContext({
    subject: 'Fwd: Some Stock — Initiating Coverage',
    textBody: [
      'From: Chiraag Kapil <ceekay@muns.io>',
      '------------------------------',
      '*From:* Research Desk <research@antiquelimited.com>',
      '*Subject:* Some Stock — Initiating Coverage',
      '',
      'We initiate coverage with a BUY.',
      'Antique Stock Broking Limited. SEBI Research Analyst Reg no: INH000001234.',
    ].join('\n'),
    originalSenderEmail: 'ceekay@muns.io',
    originalSenderName: 'Chiraag Kapil',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const res = resolveBrokerForNote({ filename: 'body.txt' }, ctx)
  assertEqual(res.resolutionClass, 'unmapped_research_house', 'class')
  assert(!res.isMapped, 'not mapped')
  assert(!res.isUnresolved, 'unmapped is not the same as unknown')
})

test('a company IR address and a newsletter → other_source (not Unknown)', () => {
  const wework = buildEmailBrokerContext({
    subject: 'Fwd: WeWork India Q4 FY26 Results',
    textBody: '*From:* Vinayak Parameswaran <investor.relations@wework.co.in>\n\nQ4 results.',
    originalSenderEmail: 'ceekay@muns.io',
    originalSenderName: 'Chiraag Kapil',
    forwardedByEmail: 'ceekay@muns.io',
  })
  assertEqual(resolveBrokerForNote({ filename: 'body.txt' }, wework).resolutionClass,
    'other_source', 'WeWork IR → other_source')

  const macro = buildEmailBrokerContext({
    subject: 'Fwd: Daily Summary: Fed Concerns Impact Markets',
    textBody: 'From: MacroGlide <newsletter@macroglide.com>\n\nMarket wrap for the day.',
    originalSenderEmail: 'newsletter@macroglide.com',
    originalSenderName: 'MacroGlide',
    forwardedByEmail: 'ceekay@muns.io',
  })
  assertEqual(resolveBrokerForNote({ filename: 'body.txt' }, macro).resolutionClass,
    'other_source', 'newsletter → other_source')
})

test('research-looking note with no resolvable house → unknown', () => {
  const ctx = buildEmailBrokerContext({
    subject: 'Fwd: a stock idea',
    textBody: 'I think this stock is a buy. Target price 500.',
    originalSenderEmail: 'someone@gmail.com',
    originalSenderName: 'Some One',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const res = resolveBrokerForNote({ filename: 'body.txt' }, ctx)
  assertEqual(res.resolutionClass, 'unknown', 'class')
  assert(res.isUnresolved, 'isUnresolved true')
})

test('disagreeing signals set brokerConflict with a populated evidenceTrail', () => {
  const ctx = buildEmailBrokerContext({
    subject: 'Fwd: [Kotak] Some note',
    textBody: '*From:* Analyst <analyst@iiflcap.com>\n\nNote body.',
    originalSenderEmail: 'ceekay@muns.io',
    originalSenderName: 'Chiraag Kapil',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const res = resolveBrokerForNote({ filename: 'body.txt' }, ctx)
  assert(res.brokerConflict, 'conflict flagged')
  assertEqual(res.brokerCanonicalName, 'IIFL Securities', 'higher-confidence header wins')
  assert(res.evidenceTrail.length >= 2, 'evidence trail records every signal')
})

// ── Broker-vs-stock entity role ───────────────────────────────────────────

const iiflRes = resolveBrokerForNote({ filename: 'body.txt' }, iiflCtx)
const nephroNote: NoteEntityContext = {
  cleanTitle: 'NephroPlus – Underappreciated healthcare play – BUY',
  proseText: 'NephroPlus delivered strong revenue growth of 32% YoY. Maintain BUY.',
  disclaimerText: IIFL_DISCLAIMER,
  brokerPrefixTokens: [],
}

test('NER tagging the broker (IIFL) as a stock → broker_only, dropped', () => {
  const cls = classifyNoteEntity(
    { entityName: 'IIFL', ticker: 'IIFL', hasRating: true, hasTargetPrice: false },
    nephroNote, iiflRes,
  )
  assertEqual(cls.role, 'broker_only', 'IIFL is the research house here')
})

test('the genuine subject company stays a covered stock', () => {
  const cls = classifyNoteEntity(
    { entityName: 'NephroPlus', ticker: 'NEPHRO', hasRating: true, hasTargetPrice: true },
    nephroNote, iiflRes,
  )
  assertEqual(cls.role, 'covered_stock', 'NephroPlus is the covered company')
})

test('a broker-named listed company stays a stock when the note is about it', () => {
  // Resolved house is IIFL; the note is about ICICI Securities the listed co.
  const note: NoteEntityContext = {
    cleanTitle: 'ICICI Securities: strong quarter, target raised',
    proseText: 'ICICI Securities reported a strong quarter; we raise the target price.',
    disclaimerText: IIFL_DISCLAIMER,
    brokerPrefixTokens: [],
  }
  const cls = classifyNoteEntity(
    { entityName: 'ICICI Securities', ticker: 'ISEC', hasRating: true, hasTargetPrice: true },
    note, iiflRes,
  )
  assertEqual(cls.role, 'covered_stock', 'kept as a covered stock — no global blacklist')
})

test('a brokerage merely mentioned in prose is not a covered stock', () => {
  // Resolved house is IIFL; "Ambit" only appears in passing in the body.
  const cls = classifyNoteEntity(
    { entityName: 'Ambit', ticker: 'AMBIT', hasRating: true, hasTargetPrice: true },
    {
      cleanTitle: 'Pricol — Q4FY26 Result Update',
      proseText: 'Our estimates are ahead of Ambit and we maintain BUY on Pricol.',
      disclaimerText: '',
      brokerPrefixTokens: [],
    },
    iiflRes,
  )
  assert(cls.role !== 'covered_stock' && cls.role !== 'both',
    `a passing brokerage mention is not a covered stock — got "${cls.role}"`)
})

test('a house writing about itself → both, flagged brokerStockConflict', () => {
  const isecCtx = buildEmailBrokerContext({
    subject: 'ICICI Securities: strong quarter',
    textBody: '*From:* Research <research@icicisecurities.com>\n\n'
      + 'ICICI Securities reported a strong quarter; we raise our target price.',
    originalSenderEmail: 'ceekay@muns.io',
    originalSenderName: 'Chiraag Kapil',
    forwardedByEmail: 'ceekay@muns.io',
  })
  const isecRes = resolveBrokerForNote({ filename: 'body.txt' }, isecCtx)
  assertEqual(isecRes.brokerCanonicalName, 'ICICI Securities', 'resolved house')
  const cls = classifyNoteEntity(
    { entityName: 'ICICI Securities', ticker: 'ISEC', hasRating: true, hasTargetPrice: true },
    {
      cleanTitle: 'ICICI Securities: strong quarter',
      proseText: 'ICICI Securities reported a strong quarter; we raise our target price.',
      disclaimerText: '',
      brokerPrefixTokens: [],
    },
    isecRes,
  )
  assertEqual(cls.role, 'both', 'both the house and the covered company')
  assert(cls.brokerStockConflict, 'brokerStockConflict flagged — kept, never deleted')
})

test('a bare NER ticker with no title / master / prose evidence → unresolved', () => {
  const cls = classifyNoteEntity(
    { entityName: 'Zydus Lifesciences', ticker: 'ZYDUSLIFE', hasRating: false, hasTargetPrice: false },
    {
      cleanTitle: 'Pricol — Q4FY26 Result Update',
      proseText: 'We maintain BUY on Pricol after a steady quarter.',
      disclaimerText: '',
      brokerPrefixTokens: [],
    },
    iiflRes,
  )
  assertEqual(cls.role, 'unresolved', 'no title / master / prose hit → unresolved, not a covered stock')
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
