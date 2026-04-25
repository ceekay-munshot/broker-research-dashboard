// Eval runner — runs each gold fixture through the live pipeline (no
// store) and produces per-fixture `EvalResult`s. Operators run this
// via `npm run ops -- eval` or directly via `npm run test:eval`.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pipeline } from '../pipeline/pipeline'
import { ReviewQueue } from '../pipeline/reviewQueue'
import type { LlmProvider } from '../pipeline/enrich/provider'
import type { OrgId } from '../../../src/domain'
import { compareToGold, type MaterializedRunOutputs } from './compare'
import type { EvalResult, GoldFixture } from './types'

export interface EvalRunOptions {
  /** Directory containing `*.json` gold fixtures. Defaults to the
   *  bundled directory. */
  readonly fixturesDir?: string
  /** Filter by fixture name (substring match). */
  readonly nameFilter?: string
  /** Optional LLM provider to test enrichment paths. Default = no-op. */
  readonly llmProvider?: LlmProvider
}

export async function runEvalSuite(opts: EvalRunOptions = {}): Promise<readonly EvalResult[]> {
  const dir = opts.fixturesDir ?? defaultFixturesDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const fixtures: GoldFixture[] = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as GoldFixture)
  const filtered = opts.nameFilter
    ? fixtures.filter((g) => g.name.includes(opts.nameFilter!))
    : fixtures
  const out: EvalResult[] = []
  for (const fx of filtered) {
    out.push(await evaluateOne(fx, opts.llmProvider))
  }
  return out
}

export async function evaluateOne(fx: GoldFixture, llmProvider?: LlmProvider): Promise<EvalResult> {
  const reviewQueue = new ReviewQueue()
  const pipeline = new Pipeline({ reviewQueue, llmProvider })
  // Force the artifact's orgId — the gold fixture's `raw.orgId` is
  // authoritative; we don't run resolution here.
  const result = await pipeline.run(fx.raw)
  const job = result.job
  const reviewCategories = [...new Set(reviewQueue.list(fx.raw.orgId as OrgId).map((r) => r.reasonCategory))]

  const actual: MaterializedRunOutputs = {
    outcome: result.outcome,
    email: job.materialized?.email ?? null,
    attachments: job.materialized?.attachments ?? [],
    reports: job.materialized?.reports ?? [],
    summaries: job.materialized?.summaries ?? [],
    evidence: job.materialized?.evidence ?? [],
    opinions: job.materialized?.opinions ?? [],
    quality: job.materialized?.quality ?? [],
    reviewCategories,
  }

  const cmp = compareToGold(actual, fx.expected)
  const matchish = cmp.fields.filter((f) => f.outcome === 'match' || f.outcome === 'partial').length
  const score = cmp.fields.length === 0 ? 0 : matchish / cmp.fields.length
  const wrongOrMissing = cmp.fields.filter((f) => f.outcome === 'wrong' || f.outcome === 'missing').length
  const passed = cmp.outcomeOk && wrongOrMissing === 0
  return {
    fixture: fx,
    outcomeOk: cmp.outcomeOk,
    actualOutcome: result.outcome,
    fields: cmp.fields,
    passed,
    score: Math.round(score * 100) / 100,
    reviewCategories,
    quality: actual.quality,
  }
}

function defaultFixturesDir(): string {
  // Resolve relative to this file. The runner is shipped as TS, so we
  // can't use `__dirname`; fall back to cwd-relative path that works
  // for both `npm run` and direct `tsx` invocation.
  return join(process.cwd(), 'server', 'src', 'eval', 'fixtures', 'gold')
}
