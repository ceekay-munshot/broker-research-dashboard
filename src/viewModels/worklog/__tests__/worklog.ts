#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Worklog dedupe + builder test harness.
//
// Verifies that distinct same-day notes on one stock are not collapsed by
// dedupe, that a true re-forward still is, and that the builder groups every
// note about a company under one stock identity — including a tickerless
// note, which keeps the company name from its title.
// Exits 0 on all-pass, 1 on any failure. Run via `npm run test:worklog`.
// ─────────────────────────────────────────────────────────────────────────

import { dedupeWorklogItems } from '../dedupe'
import { buildDailyWorklogViewModel } from '../builder'
import { DEFAULT_WORKLOG_FILTERS, type WorklogItem } from '../types'
import { emailApiResponseToServerOutput } from '../../../adapters/serverOutput/emailApiTransform'

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

/** Build a WorklogItem with sensible defaults — only the fields a test
 *  cares about need to be passed. */
function mkItem(over: Record<string, unknown> & { id: string }): WorklogItem {
  const base = {
    reportId: `rpt_${over.id}`,
    ticker: null,
    brokerId: 'brk_x',
    brokerName: 'Broker X', brokerShortName: 'BX', brokerColor: null,
    sectorId: null, sectorName: null, stockName: null,
    receivedAt: '2026-05-22T09:00:00.000Z',
    publishedAt: '2026-05-22T09:00:00.000Z',
    utcDate: '2026-05-22',
    reportType: 'update', title: 'Untitled', headline: 'Untitled', summaryShort: '',
    thesis: null, keyNumbers: [], watchpoints: [], upsidePct: null, actionLabel: null,
    stance: 'neutral', rating: null, targetPrice: null, priorTargetPrice: null,
    targetCurrency: null, targetChangeAbs: null, targetChangePct: null,
    origin: 'direct_body',
    source: {
      parentEmailId: null, parentSubject: null, isSplitFromDigest: false,
      collapsedIds: [], duplicateCount: 0,
    },
    hasAttachment: false, evidenceCount: 0, hasDivergence: false,
    priority: { bucket: 'medium', score: 50, reasons: [] },
    change: null, book: null, adaptive: null,
  }
  return { ...base, ...over } as unknown as WorklogItem
}

// ── Dedupe ────────────────────────────────────────────────────────────────

test('dedupe keeps two distinct same-day notes on one stock', () => {
  const { canonical, collapsedCount } = dedupeWorklogItems([
    mkItem({ id: 'a', ticker: 'APOLLOHOSP', brokerId: 'iifl', title: 'Apollo Hospitals - strong execution' }),
    mkItem({ id: 'b', ticker: 'APOLLOHOSP', brokerId: 'iifl', title: 'Apollo Hospitals (4QFY26) result' }),
  ])
  assertEqual(canonical.length, 2, 'both distinct notes survive')
  assertEqual(collapsedCount, 0, 'nothing is collapsed')
})

test('dedupe collapses a re-forwarded copy with an identical title', () => {
  const { canonical, collapsedCount } = dedupeWorklogItems([
    mkItem({ id: 'a', ticker: 'APOLLOHOSP', brokerId: 'iifl', title: 'Apollo Hospitals (4QFY26) result' }),
    mkItem({ id: 'b', ticker: 'APOLLOHOSP', brokerId: 'iifl', title: 'Apollo Hospitals (4QFY26) result' }),
  ])
  assertEqual(canonical.length, 1, 'the identical re-forward collapses')
  assertEqual(collapsedCount, 1, 'one item is collapsed')
  assertEqual(canonical[0]!.source.duplicateCount, 1, 'the duplicate is recorded on the survivor')
})

// ── Builder — one company group, notes nested ─────────────────────────────

test('two notes about one stock build into a single stock group; a tickerless note keeps a name', () => {
  const NOW = new Date('2026-05-22T12:00:00.000Z')
  const out = emailApiResponseToServerOutput({
    data: {
      emails: [
        {
          id: 'e1', forwarded_by_email: 'ceekay@muns.io',
          original_sender_email: 'research@iiflcap.com', original_sender_name: 'IIFL Research',
          subject: 'Apollo Hospitals - strong execution - BUY',
          text_body: '*From:* IIFL Research <research@iiflcap.com>\n\nApollo Hospitals stays BUY.',
          received_at: '2026-05-22T08:00:00.000Z',
          uploads: [{
            id: 'u1', type: 'BODY', filename: 'body.txt',
            metadata: { ner_results: { 'Apollo Hospitals': { ticker: 'APOLLOHOSP', rating: 'BUY', tp: '9700' } } },
          }],
        },
        {
          id: 'e2', forwarded_by_email: 'ceekay@muns.io',
          original_sender_email: 'research@iiflcap.com', original_sender_name: 'IIFL Research',
          subject: 'Apollo Hospitals (4QFY26): strong quarter',
          text_body: '*From:* IIFL Research <research@iiflcap.com>\n\nApollo posted a strong quarter.',
          received_at: '2026-05-22T09:00:00.000Z',
          uploads: [{
            id: 'u2', type: 'BODY', filename: 'body.txt',
            metadata: { ner_results: { 'Apollo': { ticker: 'No match', rating: 'N/A', tp: 'N/A' } } },
          }],
        },
        {
          id: 'e3', forwarded_by_email: 'ceekay@muns.io',
          original_sender_email: 'research@investec.com', original_sender_name: 'Investec Research',
          subject: 'First Take: Whirlpool of India - tough year',
          text_body: '*From:* Investec Research <research@investec.com>\n\nA tough year for the company.',
          received_at: '2026-05-22T07:00:00.000Z',
          uploads: [{
            id: 'u3', type: 'BODY', filename: 'body.txt',
            metadata: { ner_results: { 'ISPL': { ticker: 'No match', rating: 'N/A', tp: 'N/A' } } },
          }],
        },
      ],
    },
  })
  const vm = buildDailyWorklogViewModel({
    reports: out.reports, summaries: out.summaries, evidence: out.evidence,
    opinions: out.opinions, closures: out.conflictClosures, brokerEmails: out.emails,
    brokers: out.brokers, sectors: out.sectors, stocks: out.stocks,
    filters: { ...DEFAULT_WORKLOG_FILTERS, grouping: 'stock', dateWindow: 'all' },
    now: NOW,
  })
  const apollo = vm.groups.find((g) => g.label.includes('Apollo'))
  assert(apollo, 'an Apollo Hospitals stock group exists')
  assertEqual(apollo!.items.length, 2, 'both Apollo notes nest under one group')

  const whirl = vm.items.find((i) => (i.stockName ?? '').includes('Whirlpool'))
  assert(whirl, 'the tickerless Whirlpool note carries a stockName, not null')
  assertEqual(whirl!.ticker, null, 'the Whirlpool note has no ticker')
  assertEqual(whirl!.stockName, 'Whirlpool of India', 'its name comes from the title')
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
