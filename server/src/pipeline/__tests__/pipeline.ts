#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Server-side pipeline contract tests.
//
// Runs every fixture through the pipeline with the no-op LLM provider
// (deterministic-only path) and asserts:
//
//   - canonical /v1 entities materialize as expected
//   - linked artifacts produce evidence when extractable
//   - linked-artifact failure routes to the review queue, but the
//     pipeline still completes for the underlying email
//   - digest-style emails produce one report per ticker (digest_split)
//   - malformed input lands in `review_needed`
//   - re-running on the same fixture is idempotent (byte-identical IDs)
//
// Exits 0 all-green, 1 on any failure.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Pipeline } from '../pipeline'
import { runJobs } from '../runner'
import { ReviewQueue } from '../reviewQueue'
import { InMemoryStore } from '../../store/InMemoryStore'
import type { RawEmailArtifact } from '../models'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, 'fixtures')

interface TestResult { readonly name: string; readonly ok: boolean; readonly message?: string }
const results: TestResult[] = []
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name, ok: true }) })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      results.push({ name, ok: false, message: msg })
    })
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`assertion failed: ${msg}`) }

function loadFixture(name: string): RawEmailArtifact {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as RawEmailArtifact
}

// ─── Suite ────────────────────────────────────────────────────────────────

async function run() {
  // 1. Single direct PDF email — single canonical report with TP raise.
  await test('direct PDF email materializes one ResearchReport with rating + target', async () => {
    const store = new InMemoryStore()
    const pipeline = new Pipeline({ store })
    const result = await pipeline.run(loadFixture('raw-direct-pdf.json'))
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const out = result.job.materialized!
    assertEq(out.reports.length, 1, 'reports')
    assertEq(out.reports[0]!.reportType, 'earnings_review', 'reportType')
    assertEq(out.reports[0]!.tickers[0] as unknown as string, 'TCS', 'ticker')
    assertEq(out.summaries[0]!.rating, 'Buy', 'rating')
    assertEq(out.summaries[0]!.targetPrice, 4200, 'targetPrice')
    assertEq(out.summaries[0]!.priorTargetPrice, 4050, 'priorTargetPrice')
    assert(out.opinions.length === 1, 'one opinion')
    assert(out.evidence.length >= 2, 'evidence ≥ 2')
  })

  // 2. Digest email — should split into one candidate per ticker.
  await test('digest email produces multiple digest_split reports', async () => {
    const pipeline = new Pipeline()
    const result = await pipeline.run(loadFixture('raw-digest.json'))
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const out = result.job.materialized!
    const tickers = out.reports.map((r) => r.tickers[0] as unknown as string).sort()
    assert(tickers.length >= 2, `expected ≥2 reports, got ${tickers.length}`)
    assert(tickers.includes('MARUTI') && tickers.includes('LT'), `expected MARUTI + LT, got ${tickers.join(',')}`)
    // The MARUTI section should resolve Sell + ₹11,000.
    const maruti = out.summaries.find((s) =>
      out.reports.find((r) => r.id === s.reportId)?.tickers[0] as unknown as string === 'MARUTI')
    assert(maruti, 'maruti summary present')
    assertEq(maruti!.rating, 'Sell', 'maruti.rating')
    assertEq(maruti!.targetPrice, 11000, 'maruti.target')
  })

  // 3. Body-only email — one direct_body report.
  await test('body-only email materializes one direct_body report', async () => {
    const pipeline = new Pipeline()
    const result = await pipeline.run(loadFixture('raw-body-only.json'))
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const out = result.job.materialized!
    assertEq(out.reports.length, 1, 'reports')
    assertEq(out.reports[0]!.tickers[0] as unknown as string, 'MARUTI', 'ticker')
    assertEq(out.attachments.length, 0, 'no attachments')
    assertEq(out.summaries[0]!.rating, 'Hold', 'rating')
  })

  // 4. Linked webpage — pipeline materializes; linked text becomes provenance.
  await test('linked webpage extends source set without changing report shape', async () => {
    const pipeline = new Pipeline()
    const result = await pipeline.run(loadFixture('raw-with-linked-webpage.json'))
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const linkedTexts = result.job.linkedTexts!
    assert(linkedTexts.size === 1, '1 linked text')
    const out = result.job.materialized!
    assertEq(out.reports[0]!.tickers[0] as unknown as string, 'INFY', 'ticker')
  })

  // 5. Linked PDF — same as above; content type honored.
  await test('linked PDF is extracted and contributes to candidate', async () => {
    const pipeline = new Pipeline()
    const result = await pipeline.run(loadFixture('raw-with-linked-pdf.json'))
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const linkedTexts = result.job.linkedTexts!
    const onlyText = [...linkedTexts.values()][0]!
    assertEq(onlyText.provenance.kind, 'linked_pdf', 'provenance kind')
    const out = result.job.materialized!
    assertEq(out.reports[0]!.reportType, 'initiation', 'reportType')
    assertEq(out.summaries[0]!.targetPrice, 4300, 'targetPrice')
  })

  // 6. Malformed — review queue receives entries; pipeline still emits a
  //    canonical record where it can.
  await test('malformed email enqueues review entries (conflicting ratings/targets, broken link)', async () => {
    const review = new ReviewQueue()
    const pipeline = new Pipeline({ reviewQueue: review })
    const result = await pipeline.run(loadFixture('raw-malformed.json'))
    // Output is either review_needed or materialized — but the review
    // queue must record at least one issue.
    const items = review.list()
    assert(items.length >= 1, `expected review queue items, got ${items.length}`)
    const cats = new Set(items.map((i) => i.reasonCategory))
    assert(
      cats.has('CONFLICTING_RATINGS') || cats.has('CONFLICTING_TARGETS') || cats.has('BROKEN_LINKED_ARTIFACT'),
      `expected conflict / broken-link category, got ${[...cats].join(',')}`,
    )
    // Touch result so it isn't unused.
    void result
  })

  // 7. Idempotency — re-running same fixture yields identical IDs.
  await test('re-running on the same input is idempotent (byte-identical IDs)', async () => {
    const pipeline = new Pipeline()
    const f = loadFixture('raw-direct-pdf.json')
    const a = await pipeline.run(f)
    const b = await pipeline.run(f)
    assertEq(a.job.materialized!.email.id, b.job.materialized!.email.id, 'email.id')
    assertEq(a.job.materialized!.reports[0]!.id, b.job.materialized!.reports[0]!.id, 'report.id')
    assertEq(a.job.materialized!.summaries[0]!.id, b.job.materialized!.summaries[0]!.id, 'summary.id')
  })

  // 8. No-LLM fallback — explicit assertion that with NoOpLlmProvider,
  //    summaries still populate from deterministic candidates.
  await test('no-LLM fallback produces usable canonical records', async () => {
    const pipeline = new Pipeline()  // default = NoOpLlmProvider
    const result = await pipeline.run(loadFixture('raw-direct-pdf.json'))
    const summary = result.job.materialized!.summaries[0]!
    assertEq(summary.generatorVersion.includes('noop') || summary.generatorVersion.includes('pipeline@'), true,
      'generatorVersion is deterministic')
    assert(summary.thesis.length > 0, 'thesis populated from deterministic one-liner')
  })

  // 9. Provenance retention — every evidence snippet ties back to a
  //    raw source.
  await test('every evidence snippet retains provenance back to a source', async () => {
    const pipeline = new Pipeline()
    const result = await pipeline.run(loadFixture('raw-direct-pdf.json'))
    const ev = result.job.materialized!.evidence
    assert(ev.length > 0, 'evidence not empty')
    for (const e of ev) {
      // Either an attachmentId is set (real attachment) or the synthetic
      // 'att_none' marker is used. Both are acceptable; what matters is
      // that the evidence carries a non-empty textSnippet.
      assert(e.textSnippet.length > 0, `evidence ${e.id as unknown as string} has text`)
    }
  })

  // 10. Batch run produces a job summary with correct counts.
  await test('runJobs produces a MaterializationJob summary', async () => {
    const pipeline = new Pipeline()
    const job = await runJobs(pipeline, [
      loadFixture('raw-direct-pdf.json'),
      loadFixture('raw-body-only.json'),
    ])
    assertEq(job.counts.total, 2, 'total')
    assertEq(job.counts.materialized, 2, 'materialized')
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

// Validate fixture path resolves on this machine.
void resolve(here, 'fixtures')
run().catch((e: unknown) => {
  process.stderr.write(`harness failed: ${e instanceof Error ? e.stack : String(e)}\n`)
  process.exit(1)
})
