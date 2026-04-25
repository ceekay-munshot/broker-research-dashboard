#!/usr/bin/env tsx
// Module 15 — eval harness end-to-end tests.
//
// Runs every gold fixture through the live pipeline (no LLM) and
// asserts the eval harness produces the expected scores + scorecards.
// Also exercises the snapshot diff path.

import { runEvalSuite } from '../runner'
import { aggregateScorecards } from '../scorecard'
import { compareToGold, type MaterializedRunOutputs } from '../compare'
import { diffSnapshots } from '../diff'

interface TestResult { readonly name: string; readonly ok: boolean; readonly message?: string }
const results: TestResult[] = []
function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name, ok: true }) })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      results.push({ name, ok: false, message: msg })
    })
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`assertion failed: ${msg}`) }
function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

async function run() {
  await test('runEvalSuite loads + scores every gold fixture', async () => {
    const evals = await runEvalSuite()
    assert(evals.length >= 8, `expected ≥ 8 evals, got ${evals.length}`)
    // Every eval should have an outcome and a non-empty fields list.
    for (const e of evals) {
      assert(e.fields.length > 0, `${e.fixture.name}: fields not empty`)
      assert(typeof e.score === 'number', `${e.fixture.name}: score is number`)
    }
  })

  await test('happy-path fixtures pass cleanly', async () => {
    const happy = ['kotak-tcs-direct-pdf', 'forwarded-chain-iifl-maruti', 'linked-webpage-supports-body']
    const evals = await runEvalSuite()
    for (const name of happy) {
      const e = evals.find((x) => x.fixture.name === name)
      assert(e, `eval for ${name} present`)
      assert(e!.outcomeOk, `${name}: outcomeOk`)
      // No `wrong` outcomes on the primary fields.
      const wrong = e!.fields.filter((f) => f.outcome === 'wrong')
      assertEq(wrong.length, 0, `${name}: no wrong fields (got ${wrong.map((f) => f.field).join(',')})`)
    }
  })

  await test('digest fixture splits into ≥3 reports', async () => {
    const evals = await runEvalSuite({ nameFilter: 'digest' })
    const e = evals.find((x) => x.fixture.name === 'jmfl-morning-digest-multi-ticker')
    assert(e, 'digest eval present')
    const minReportsField = e!.fields.find((f) => f.field === 'minReports')
    assert(minReportsField, 'minReports field comparison present')
    assertEq(minReportsField!.outcome, 'match', 'minReports met')
  })

  await test('conflicting ratings fixture surfaces CONFLICTING_RATINGS review', async () => {
    const evals = await runEvalSuite({ nameFilter: 'conflicting-ratings' })
    const e = evals[0]!
    assert(e.reviewCategories.includes('CONFLICTING_RATINGS'),
      `expected CONFLICTING_RATINGS in review, got ${e.reviewCategories.join(',')}`)
    const reviewField = e.fields.find((f) => f.field === 'reviewCategories')
    assertEq(reviewField?.outcome, 'match', 'reviewCategories satisfied')
  })

  await test('multiple-targets fixture surfaces CONFLICTING_TARGETS review', async () => {
    const evals = await runEvalSuite({ nameFilter: 'multiple-targets' })
    const e = evals[0]!
    assert(e.reviewCategories.includes('CONFLICTING_TARGETS'),
      `expected CONFLICTING_TARGETS in review, got ${e.reviewCategories.join(',')}`)
  })

  await test('linked-pdf-authoritative: linked artifact contributes evidence', async () => {
    const evals = await runEvalSuite({ nameFilter: 'linked-pdf-authoritative' })
    const e = evals[0]!
    const linkedField = e.fields.find((f) => f.field === 'linkedArtifactsContributed')
    assertEq(linkedField?.outcome, 'match', 'linked artifact contributed')
  })

  await test('aggregateScorecards groups by broker / profile / source / report-type / enrichment', async () => {
    const evals = await runEvalSuite()
    const cards = aggregateScorecards(evals)
    assert(cards.byBroker.length >= 2, 'multiple brokers represented')
    assert(cards.byProfile.length >= 2, 'multiple profiles represented')
    assert(cards.bySourceType.length >= 2, 'multiple source types represented')
    // No-LLM run ⇒ enrichment mode bucket should be 'deterministic-only'.
    const detBucket = cards.byEnrichmentMode.find((b) => b.key === 'deterministic-only')
    assert(detBucket, 'deterministic-only bucket present')
    assert(detBucket!.fixtures > 0, 'at least one deterministic-only run counted')
    // Overall score is between 0 and 1.
    assert(cards.overall.score >= 0 && cards.overall.score <= 1,
      `overall.score in [0,1], got ${cards.overall.score}`)
  })

  await test('diffSnapshots flags target-price changes', () => {
    // Build two synthetic snapshots that differ only on TCS target.
    const before: MaterializedRunOutputs = {
      outcome: 'materialized_ready',
      email: null, attachments: [],
      reports: [{
        id: 'rpt_a' as never, orgId: 'org_vimana' as never,
        brokerId: 'brk_kotak' as never, sourceEmailId: 'eml_a' as never,
        sourceAttachmentId: null, title: 't',
        publishedAt: '2026-04-22T09:30:00.000Z', receivedAt: '2026-04-22T09:30:00.000Z',
        reportType: 'update', tickers: ['TCS' as never], sectorIds: [],
        pageCount: null, language: 'en', status: 'ready', summaryId: 'sum_a' as never,
      }],
      summaries: [{
        id: 'sum_a' as never, orgId: 'org_vimana' as never, reportId: 'rpt_a' as never,
        stance: 'bullish', rating: 'Buy', targetPrice: 4000, priorTargetPrice: null,
        targetCurrency: 'INR', thesis: 'thesis A', keyPoints: [], themes: [], risks: [],
        catalysts: [], confidence: 0.7, generatedAt: '2026-04-22T09:30:00.000Z',
        generatorVersion: 'pipeline@x', evidenceIds: [],
      }],
      evidence: [], opinions: [], quality: [], reviewCategories: [],
    }
    const after: MaterializedRunOutputs = {
      ...before,
      summaries: [{ ...before.summaries[0]!, targetPrice: 4200 }],
    }
    const diff = diffSnapshots(before, after)
    const tpEntry = diff.entries.find((e) => e.field === 'TCS.targetPrice')
    assertEq(tpEntry?.outcome, 'changed', 'target diff detected')
    assertEq(tpEntry?.before, 4000, 'before value')
    assertEq(tpEntry?.after, 4200, 'after value')
  })

  await test('compareToGold reports outcome mismatch when expected mat fails', () => {
    const actual: MaterializedRunOutputs = {
      outcome: 'failed', email: null, attachments: [], reports: [], summaries: [],
      evidence: [], opinions: [], quality: [], reviewCategories: [],
    }
    const cmp = compareToGold(actual, {
      broker: 'brk_kotak',
      expectMaterialization: true,
    })
    assertEq(cmp.outcomeOk, false, 'outcome flagged not-ok')
  })

  // ── Report ─────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    if (r.ok) process.stdout.write(`  ✓ ${r.name}\n`)
    else      process.stdout.write(`  ✗ ${r.name}\n     ${r.message}\n`)
  }
  process.stdout.write(`\n${passed}/${results.length} passed`)
  if (failed.length > 0) { process.stdout.write(` · ${failed.length} failed\n`); process.exit(1) }
  process.stdout.write(`\n`)
}

run().catch((e: unknown) => {
  process.stderr.write(`harness failed: ${e instanceof Error ? e.stack : String(e)}\n`)
  process.exit(1)
})
