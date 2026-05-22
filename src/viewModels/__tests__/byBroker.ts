#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// By-Broker dedupe test harness.
//
// Verifies that dedupeReports collapses a re-forwarded copy of a note while
// keeping genuinely distinct same-day notes on the same stock, and that a
// By-Broker card's note count and latest-notes list reflect that collapse.
// Exits 0 on all-pass, 1 on any failure. Run via `npm run test:bybroker`.
// ─────────────────────────────────────────────────────────────────────────

import type { Broker, ResearchReport } from '../../domain'
import { dedupeReports } from '../shared'
import { buildByBrokerViewModel } from '../byBroker'
import { DEFAULT_FILTERS } from '../../app/filters'

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

/** Build a ResearchReport with sensible defaults — only the fields a test
 *  cares about need to be passed. */
function mkReport(over: Record<string, unknown> & { id: string }): ResearchReport {
  const base = {
    id: over.id,
    orgId: 'org_1',
    brokerId: 'brk_kotak',
    sourceEmailId: `email_${over.id}`,
    sourceAttachmentId: null,
    title: 'Untitled note',
    publishedAt: '2026-05-22T09:00:00.000Z',
    receivedAt: '2026-05-22T09:30:00.000Z',
    reportType: 'update',
    tickers: ['KIMS'],
    sectorIds: [],
    pageCount: null,
    language: 'en',
    status: 'ready',
    summaryId: null,
  }
  return { ...base, ...over } as unknown as ResearchReport
}

function mkBroker(id: string): Broker {
  return {
    id,
    name: 'Kotak Institutional Equities',
    shortName: 'Kotak',
    senderDomains: [], researchAliases: [], coverageTags: [],
    brandColor: null, website: null,
  } as unknown as Broker
}

// ── dedupeReports ─────────────────────────────────────────────────────────

test('dedupeReports collapses an identical re-forwarded copy', () => {
  const title = 'KIMS (CMP: Rs717, FV: Rs695, REDUCE): Still expensive'
  const out = dedupeReports([
    mkReport({ id: 'a', title }),
    mkReport({ id: 'b', title }),
  ])
  assertEqual(out.length, 1, 'the identical re-forward collapses to one')
})

test('dedupeReports keeps two distinct same-day notes on one stock', () => {
  const out = dedupeReports([
    mkReport({ id: 'a', title: 'KIMS (CMP: Rs717, FV: Rs695, REDUCE): Still expensive' }),
    mkReport({ id: 'b', title: 'Krishna Institute of Medical Sciences - 4QFY26 result' }),
  ])
  assertEqual(out.length, 2, 'distinct titles both survive')
})

test('dedupeReports keeps the copy that has a summary as canonical', () => {
  const out = dedupeReports([
    mkReport({ id: 'no-summary', title: 'KIMS result', summaryId: null }),
    mkReport({ id: 'with-summary', title: 'KIMS result', summaryId: 'sum_1' }),
  ])
  assertEqual(out.length, 1, 'the duplicate collapses')
  assertEqual(out[0]!.id as unknown as string, 'with-summary', 'the summary-bearing copy is kept')
})

// ── buildByBrokerViewModel integration ────────────────────────────────────

test('a By-Broker card collapses a re-forwarded note but keeps a distinct one', () => {
  const dupTitle = 'KIMS (CMP: Rs717, FV: Rs695, REDUCE): Still expensive'
  const vm = buildByBrokerViewModel({
    brokers: [mkBroker('brk_kotak')],
    reports: [
      mkReport({ id: 'r1', title: dupTitle }),
      mkReport({ id: 'r2', title: dupTitle }),
      mkReport({ id: 'r3', title: 'Krishna Institute of Medical Sciences - 4QFY26 result' }),
    ],
    summaries: [],
    filters: DEFAULT_FILTERS,
  })
  const card = vm.brokers[0]
  assert(card, 'the Kotak card exists')
  assertEqual(card!.reportCount, 2, 'the re-forward is collapsed — 2 distinct notes, not 3')
  assertEqual(card!.latestReports.length, 2, 'the latest-notes list shows each note once')
  assert(
    card!.latestReports.some((r) => r.headline.includes('Krishna Institute')),
    'the genuinely distinct same-day note still appears',
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
