#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for the live-sync stack.
//
//   npm run ops -- sync                  # incremental sync for all configured orgs
//   npm run ops -- sync --org=org_vimana --reset
//   npm run ops -- replay --id=raw_xxx
//   npm run ops -- replay-failed
//   npm run ops -- list-failures
//   npm run ops -- list-review
//   npm run ops -- clear-review --id=rev_xxx --note="addressed"
//   npm run ops -- status
//
// CLI-first by design — see `docs/live-sync.md` for end-to-end workflows.
// ─────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OrgId } from '../../../src/domain'
import { Pipeline } from '../pipeline/pipeline'
import { ReviewQueue } from '../pipeline/reviewQueue'
import { buildLlmProvider } from '../pipeline/enrich/factory'
import {
  HybridCanonicalStore, createDefaultRepo, type Repo,
} from '../persistence'
import { summarizeCalls, listPrompts } from '../llm'
import {
  MockRawUpstreamClient, type RawArtifactRow,
  syncOnce, replayOne, replayAllFailed, snapshotStatus,
} from '../sync'
import { organizations } from '../config/organizations'
import { VIMANA_ORG_ID } from '../../../src/mocks/organizations'
import type { RawEmailArtifact } from '../pipeline/models'
import { runEvalSuite, aggregateScorecards, diffSnapshots } from '../eval'
import { severityFor } from '../pipeline/errors'
import {
  indexRules, promoteToGoldFixture,
  type CorrectionRule, type CorrectionPayload, type CorrectionScope,
} from '../corrections'
import { writeFileSync } from 'node:fs'
import type { BrokerId, Rating, ReportType, StockTicker } from '../../../src/domain'

type Subcommand =
  | 'sync' | 'replay' | 'replay-failed'
  | 'list-failures' | 'list-review' | 'clear-review' | 'status'
  // Module 15
  | 'eval' | 'scorecard' | 'field-stats' | 'top-failures' | 'diff'
  // Module 16
  | 'correct' | 'correct-rule' | 'list-corrections' | 'disable-correction'
  | 'replay-with-corrections' | 'correction-impact' | 'promote-to-gold'
  // Module 17
  | 'prompt-list' | 'llm-stats' | 'eval-with-llm'
  | 'help'

interface Args {
  readonly cmd: Subcommand
  readonly orgId: OrgId
  readonly id?: string
  readonly note?: string
  readonly reset?: boolean
  // Module 15 flags
  readonly nameFilter?: string
  readonly bucket?: 'broker' | 'profile' | 'source' | 'reportType' | 'enrichment'
  readonly before?: string
  readonly after?: string
  // Module 16 flags
  readonly type?: string                    // correction type
  readonly value?: string                   // correction value (rating, ticker, etc.)
  readonly artifactId?: string
  readonly broker?: string
  readonly profile?: string
  readonly subjectRegex?: string
  readonly reusable?: boolean
  readonly actor?: string
  readonly outPath?: string                 // promote-to-gold output
}

function parseArgs(argv: readonly string[]): Args {
  const cmd = (argv[0] ?? 'help') as Subcommand
  const flags: Record<string, string | boolean> = {}
  for (const tok of argv.slice(1)) {
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=')
      const key = eq === -1 ? tok.slice(2) : tok.slice(2, eq)
      const val = eq === -1 ? true : tok.slice(eq + 1)
      flags[key] = val
    }
  }
  const orgId = (flags.org as string | undefined) ?? (VIMANA_ORG_ID as unknown as string)
  const bucketRaw = flags.bucket as string | undefined
  const bucket = (
    bucketRaw === 'broker' || bucketRaw === 'profile' || bucketRaw === 'source'
    || bucketRaw === 'reportType' || bucketRaw === 'enrichment'
  ) ? bucketRaw : undefined
  return {
    cmd,
    orgId: orgId as unknown as OrgId,
    id: flags.id as string | undefined,
    note: flags.note as string | undefined,
    reset: flags.reset === true,
    nameFilter: flags.name as string | undefined,
    bucket,
    before: flags.before as string | undefined,
    after: flags.after as string | undefined,
    type: flags.type as string | undefined,
    value: flags.value as string | undefined,
    artifactId: flags.artifact as string | undefined,
    broker: flags.broker as string | undefined,
    profile: flags.profile as string | undefined,
    subjectRegex: flags['subject-regex'] as string | undefined,
    reusable: flags.reusable === true,
    actor: (flags.actor as string | undefined) ?? 'cli-operator',
    outPath: flags.out as string | undefined,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const repo: Repo = createDefaultRepo()
  const store = new HybridCanonicalStore(repo)
  store.hydrateFrom(organizations.map((o) => o.id))
  const reviewQueue = new ReviewQueue()
  const llmProvider = buildLlmProvider({ repo })
  const pipeline = new Pipeline({ store, reviewQueue, llmProvider })

  switch (args.cmd) {
    case 'sync':
      await cmdSync(args, repo, pipeline)
      break
    case 'replay':
      await cmdReplay(args, repo, pipeline)
      break
    case 'replay-failed':
      await cmdReplayFailed(args, repo, pipeline)
      break
    case 'list-failures':
      cmdListFailures(args, repo)
      break
    case 'list-review':
      cmdListReview(args, repo)
      break
    case 'clear-review':
      cmdClearReview(args, repo)
      break
    case 'status':
      cmdStatus(args, repo)
      break
    case 'eval':
      await cmdEval(args)
      break
    case 'scorecard':
      await cmdScorecard(args)
      break
    case 'field-stats':
      await cmdFieldStats(args)
      break
    case 'top-failures':
      cmdTopFailures(args, repo)
      break
    case 'diff':
      cmdDiff(args)
      break
    case 'correct':
      cmdCorrect(args, repo, /* reusable= */ false)
      break
    case 'correct-rule':
      cmdCorrect(args, repo, /* reusable= */ true)
      break
    case 'list-corrections':
      cmdListCorrections(args, repo)
      break
    case 'disable-correction':
      cmdDisableCorrection(args, repo)
      break
    case 'replay-with-corrections':
      await cmdReplayWithCorrections(args, repo, store)
      break
    case 'correction-impact':
      cmdCorrectionImpact(args, repo)
      break
    case 'promote-to-gold':
      cmdPromoteToGold(args, repo)
      break
    case 'prompt-list':
      cmdPromptList()
      break
    case 'llm-stats':
      cmdLlmStats(args, repo)
      break
    case 'eval-with-llm':
      await cmdEvalWithLlm(args, repo)
      break
    case 'help':
    default:
      printHelp()
      break
  }
  repo.flush()
}

// ── Subcommands ──────────────────────────────────────────────────────────

async function cmdSync(args: Args, repo: Repo, pipeline: Pipeline): Promise<void> {
  // For demo / dev purposes, the sync source is the bundled fixture
  // batches under server/src/sync/__tests__/fixtures/. Production
  // wiring swaps in `HttpRawUpstreamClient`.
  const client = buildFixtureClient(args.orgId)
  const result = await syncOnce({
    orgId: args.orgId,
    client,
    repo,
    pipeline,
    cursorOverride: args.reset ? null : undefined,
  })
  console.log(`[sync] org=${args.orgId as unknown as string} ` +
    `fetched=${result.fetchedCount} new=${result.newCount} ` +
    `materialized=${result.materializedCount} failed=${result.failedCount} ` +
    `review=${result.reviewCount} ${result.durationMs}ms`)
}

async function cmdReplay(args: Args, repo: Repo, pipeline: Pipeline): Promise<void> {
  if (!args.id) { console.error('replay: --id=<rawEmailId> is required'); process.exit(2) }
  const r = await replayOne({ orgId: args.orgId, artifactId: args.id, repo, pipeline })
  console.log(`[replay] ${r.artifactId} → ${r.outcome}` +
    (r.errorCategory ? ` (${r.errorCategory}: ${r.errorDetail})` : ''))
}

async function cmdReplayFailed(args: Args, repo: Repo, pipeline: Pipeline): Promise<void> {
  const out = await replayAllFailed({ orgId: args.orgId, repo, pipeline })
  for (const r of out) {
    console.log(`[replay] ${r.artifactId} → ${r.outcome}` +
      (r.errorCategory ? ` (${r.errorCategory})` : ''))
  }
  console.log(`replayed ${out.length}`)
}

function cmdListFailures(args: Args, repo: Repo): void {
  const failed = [
    ...repo.listRawEmails(args.orgId, { state: 'failed' }),
    ...repo.listRawEmails(args.orgId, { state: 'review_needed' }),
  ]
  if (failed.length === 0) { console.log('no failures or review-needed artifacts'); return }
  for (const r of failed) {
    console.log(`${r.id}\t${r.state}\t[${r.errorCategory ?? ''}] ${r.artifact.envelope.subject}`)
  }
}

function cmdListReview(args: Args, repo: Repo): void {
  const items = repo.listReviewItems(args.orgId, false)
  if (items.length === 0) { console.log('review queue empty'); return }
  for (const i of items) {
    console.log(`${i.id}\t${i.reasonCategory}\t${i.snapshot.subject}`)
    console.log(`    ${i.detail}`)
  }
}

function cmdClearReview(args: Args, repo: Repo): void {
  if (!args.id) { console.error('clear-review: --id=<reviewId> is required'); process.exit(2) }
  repo.resolveReviewItem(args.orgId, args.id, args.note ?? 'cleared via CLI')
  repo.flush()
  console.log(`[clear-review] ${args.id} resolved`)
}

function cmdStatus(args: Args, repo: Repo): void {
  const s = snapshotStatus(repo, args.orgId)
  console.log(`org:                  ${s.orgId as unknown as string}`)
  console.log(`raw emails:           ${s.counts.rawEmails}`)
  console.log(`materialized:         ${s.counts.materialized}`)
  console.log(`failed:               ${s.counts.failed}`)
  console.log(`review_needed:        ${s.counts.reviewNeeded}`)
  console.log(`review queue (open):  ${s.counts.reviewOpen}`)
  if (s.checkpoint) {
    console.log(`last sync:            ${s.checkpoint.lastSyncedAt ?? '—'}`)
    console.log(`last cursor:          ${s.checkpoint.lastCursor ?? '—'}`)
    console.log(`last duration (ms):   ${s.checkpoint.lastRunDurationMs}`)
    console.log(`last fetched:         ${s.checkpoint.lastFetchedCount}`)
    console.log(`last materialized:    ${s.checkpoint.lastMaterializedCount}`)
    console.log(`last failed:          ${s.checkpoint.lastFailedCount}`)
    console.log(`last review:          ${s.checkpoint.lastReviewCount}`)
    console.log(`enrichment disabled:  ${s.checkpoint.lastEnrichmentDisabledCount}`)
    console.log(`enrichment failed:    ${s.checkpoint.lastEnrichmentFailedCount}`)
  } else {
    console.log(`(no sync checkpoint yet)`)
  }
}

// ── Module 15 — eval / scorecards / field-stats / top-failures / diff ──

async function cmdEval(args: Args): Promise<void> {
  const evals = await runEvalSuite({ nameFilter: args.nameFilter })
  let pass = 0, fail = 0
  for (const e of evals) {
    const tag = e.passed ? '✓' : '✗'
    const score = e.score.toFixed(2)
    console.log(`${tag}  ${score}  ${e.fixture.name}  [${e.fixture.profile} · ${e.fixture.sourceType}]`)
    if (!e.passed) {
      fail++
      const wrong = e.fields.filter((f) => f.outcome === 'wrong' || f.outcome === 'missing')
      for (const f of wrong) {
        console.log(`        ${f.outcome.padEnd(7)} ${f.field}` +
          (f.expected !== undefined ? `  expected=${JSON.stringify(f.expected)}` : '') +
          (f.actual   !== undefined ? `  actual=${JSON.stringify(f.actual)}` : ''))
      }
    } else { pass++ }
  }
  console.log(`\n${pass}/${evals.length} passed (${fail} failed)`)
  if (fail > 0) process.exit(1)
}

async function cmdScorecard(args: Args): Promise<void> {
  const evals = await runEvalSuite({ nameFilter: args.nameFilter })
  const cards = aggregateScorecards(evals)
  const buckets = args.bucket === 'broker'     ? cards.byBroker
                : args.bucket === 'profile'    ? cards.byProfile
                : args.bucket === 'source'     ? cards.bySourceType
                : args.bucket === 'reportType' ? cards.byReportType
                : args.bucket === 'enrichment' ? cards.byEnrichmentMode
                : null
  console.log(`overall:  ${cards.overall.passed}/${cards.overall.fixtures}  score=${cards.overall.score.toFixed(2)}` +
    `  det=${cards.overall.deterministicFieldsCount}  llm=${cards.overall.llmFieldsCount}`)
  if (buckets) {
    console.log(`\nby ${args.bucket}:`)
    for (const b of buckets) printBucket(b)
  } else {
    for (const [label, list] of [
      ['broker',     cards.byBroker],
      ['profile',    cards.byProfile],
      ['source',     cards.bySourceType],
      ['reportType', cards.byReportType],
      ['enrichment', cards.byEnrichmentMode],
    ] as const) {
      console.log(`\nby ${label}:`)
      for (const b of list) printBucket(b)
    }
  }
}

function printBucket(b: ReturnType<typeof aggregateScorecards>['byBroker'][number]): void {
  const ratio = `${b.passed}/${b.fixtures}`
  console.log(`  ${b.key.padEnd(30)} ${ratio.padStart(8)}  score=${b.score.toFixed(2)}` +
    `  det=${b.deterministicFieldsCount}  llm=${b.llmFieldsCount}`)
}

async function cmdFieldStats(args: Args): Promise<void> {
  const evals = await runEvalSuite({ nameFilter: args.nameFilter })
  const cards = aggregateScorecards(evals)
  const fields = Object.entries(cards.overall.perField).sort((a, b) => a[1] - b[1])
  if (fields.length === 0) { console.log('no fields evaluated'); return }
  console.log(`field-level success rate (across ${cards.overall.fixtures} fixtures):`)
  for (const [field, rate] of fields) {
    const bar = '█'.repeat(Math.round(rate * 20)).padEnd(20, '·')
    console.log(`  ${field.padEnd(35)}  ${(rate * 100).toFixed(0).padStart(3)}%  ${bar}`)
  }
}

function cmdTopFailures(args: Args, repo: Repo): void {
  const items = repo.listReviewItems(args.orgId, true)
  if (items.length === 0) { console.log('no review items recorded'); return }
  const counts = new Map<string, number>()
  for (const it of items) {
    counts.set(it.reasonCategory, (counts.get(it.reasonCategory) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  console.log(`top failures (${items.length} review items total):`)
  for (const [cat, n] of sorted) {
    const sev = severityFor(cat as Parameters<typeof severityFor>[0])
    console.log(`  ${String(n).padStart(4)}  ${sev.padEnd(6)}  ${cat}`)
  }
}

function cmdDiff(args: Args): void {
  if (!args.before || !args.after) {
    console.error('diff: --before=<path> --after=<path> required (each pointing to a snapshot JSON)')
    process.exit(2)
  }
  const before = JSON.parse(readFileSync(args.before, 'utf8')) as Parameters<typeof diffSnapshots>[0]
  const after  = JSON.parse(readFileSync(args.after,  'utf8')) as Parameters<typeof diffSnapshots>[1]
  const diff = diffSnapshots(before, after)
  console.log(`diff: ${diff.summary.changed} changed · ${diff.summary.added} added · ${diff.summary.removed} removed · ${diff.summary.unchanged} unchanged`)
  for (const e of diff.entries) {
    if (e.outcome === 'unchanged') continue
    const tag = e.outcome === 'changed' ? '~' : e.outcome === 'added' ? '+' : '-'
    console.log(`  ${tag}  ${e.field.padEnd(35)}  ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`)
  }
}

// ── Module 16 — corrections / adjudication ─────────────────────────────

function cmdCorrect(args: Args, repo: Repo, reusable: boolean): void {
  if (!args.type || args.value === undefined) {
    console.error('correct: --type=<rating|target|prior-target|broker|ticker|report-type> --value=<...> required')
    process.exit(2)
  }
  const payload = parsePayload(args.type, args.value)
  if (!payload) { console.error(`correct: unknown --type=${args.type}`); process.exit(2) }

  const scope: CorrectionScope = reusable
    ? buildReusableScope(args)
    : buildOneOffScope(args)
  if (Object.keys(scope).length === 0) {
    console.error('correct: scope is empty. one-off needs --artifact=<id>; reusable needs --broker=<> or --profile=<> or --subject-regex=<>')
    process.exit(2)
  }

  const id = `cor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  const rule: CorrectionRule = {
    id,
    orgId: args.orgId,
    isReusable: reusable,
    scope,
    payload,
    createdAt: now,
    createdBy: args.actor ?? 'cli-operator',
    note: args.note ?? '',
    enabled: true,
    applicationCount: 0,
    reviewItemsResolved: 0,
    aggregateQualityDelta: 0,
    audit: [{ at: now, actor: args.actor ?? 'cli-operator', action: 'created', note: args.note }],
  }
  repo.upsertCorrectionRule(rule)
  repo.flush()
  console.log(`[correct] ${id}  ${reusable ? 'reusable' : 'one-off'}  payload=${payload.kind}  scope=${JSON.stringify(scope)}`)
}

function cmdListCorrections(args: Args, repo: Repo): void {
  const items = repo.listCorrectionRules(args.orgId)
  if (items.length === 0) { console.log('no corrections defined'); return }
  console.log(`${items.length} correction rule(s):`)
  for (const r of items) {
    const status = !r.enabled ? 'disabled' : r.supersededBy ? `superseded by ${r.supersededBy}` : 'active'
    console.log(`  ${r.id}  ${r.isReusable ? 'reusable' : 'one-off '}  ${r.payload.kind.padEnd(28)}  ${status}  app=${r.applicationCount}  resolved=${r.reviewItemsResolved}`)
    if (r.note) console.log(`        note: ${r.note}`)
  }
}

function cmdDisableCorrection(args: Args, repo: Repo): void {
  if (!args.id) { console.error('disable-correction: --id=<correctionId> required'); process.exit(2) }
  const now = new Date().toISOString()
  repo.appendCorrectionAudit(args.orgId, args.id, {
    at: now, actor: args.actor ?? 'cli-operator', action: 'disabled', note: args.note,
  }, { enabled: false })
  repo.flush()
  console.log(`[disable-correction] ${args.id} disabled`)
}

async function cmdReplayWithCorrections(args: Args, repo: Repo, store: HybridCanonicalStore): Promise<void> {
  if (!args.artifactId) { console.error('replay-with-corrections: --artifact=<rawEmailId> required'); process.exit(2) }
  const raw = repo.getRawEmail(args.orgId, args.artifactId)
  if (!raw) { console.error(`raw artifact ${args.artifactId} not found`); process.exit(2) }
  const rules = indexRules(repo.listCorrectionRules(args.orgId, { enabledOnly: true }))
  const reviewQueue = new ReviewQueue()
  const pipeline = new Pipeline({
    store, reviewQueue, corrections: rules,
    onCorrectionApplied: (a) => repo.bumpCorrectionImpact(args.orgId, a.ruleId, { applicationCount: 1 }),
  })
  const result = await pipeline.run(raw.artifact)
  repo.updateRawEmailState(args.orgId, raw.id, result.job.state, result.job.error?.category ?? null, result.job.error?.detail ?? null)
  repo.flush()
  const correctedKeys = result.job.materialized?.quality.flatMap((q) => q.correctedFields) ?? []
  console.log(`[replay-with-corrections] ${raw.id} → ${result.outcome}  corrected_fields=[${[...new Set(correctedKeys)].join(', ')}]`)
}

function cmdCorrectionImpact(args: Args, repo: Repo): void {
  const rules = repo.listCorrectionRules(args.orgId)
  if (rules.length === 0) { console.log('no corrections defined'); return }
  // Top by applicationCount
  const sorted = [...rules].sort((a, b) => b.applicationCount - a.applicationCount)
  console.log('top corrections by impact:')
  for (const r of sorted) {
    console.log(`  ${r.id}  app=${r.applicationCount}  resolved=${r.reviewItemsResolved}  Δquality=${r.aggregateQualityDelta.toFixed(2)}  ${r.payload.kind}`)
  }
}

// ── Module 17 — prompt registry / LLM accounting / eval with LLM ──────

function cmdPromptList(): void {
  const prompts = listPrompts()
  console.log(`${prompts.length} registered prompt(s):`)
  for (const p of prompts) {
    console.log(`  ${p.id.padEnd(22)} ${p.version}  ` +
      `recommended=${p.recommended.provider}/${p.recommended.model}` +
      (p.fallback ? `  fallback=${p.fallback.provider}/${p.fallback.model}` : '') +
      `  T=${p.temperature}  max=${p.maxTokens}`)
    console.log(`    ${p.description}`)
    console.log(`    grounded fields: [${p.groundingFields.join(', ')}]`)
  }
}

function cmdLlmStats(args: Args, repo: Repo): void {
  // Default: per-org. With `--all`, summarise across orgs.
  const records = (args.actor === 'all-orgs'
    ? repo.listAllLlmCallRecords()
    : repo.listLlmCallRecords(args.orgId))
  if (records.length === 0) {
    console.log('no LLM call records yet (deterministic-only or LLM_DISABLED).')
    return
  }
  const summary = summarizeCalls(records)
  const o = summary.overall
  const cacheRate = o.calls > 0 ? Math.round((o.cacheHits / o.calls) * 100) : 0
  const groundRate = o.successes > 0 ? Math.round((o.groundingPasses / o.successes) * 100) : 0
  const avgLatency = o.calls > 0 ? Math.round(o.totalLatencyMs / o.calls) : 0
  console.log(`overall: calls=${o.calls}  ok=${o.successes}  ` +
    `cache=${o.cacheHits}(${cacheRate}%)  grounded=${o.groundingPasses}/${o.successes}(${groundRate}%)  ` +
    `fallback=${o.fallbackUses}  avgLatency=${avgLatency}ms  ` +
    `tokens(in/out)=${o.tokensIn}/${o.tokensOut}`)
  for (const [label, list] of [
    ['provider', summary.byProvider],
    ['model',    summary.byModel],
    ['task',     summary.byTask],
    ['version',  summary.byPromptVersion],
  ] as const) {
    if (list.length === 0) continue
    console.log(`\nby ${label}:`)
    for (const b of list) {
      const tokens = `${b.tokensIn}/${b.tokensOut}`
      const cr = b.calls > 0 ? Math.round((b.cacheHits / b.calls) * 100) : 0
      console.log(`  ${b.key.padEnd(40)}  calls=${String(b.calls).padStart(4)}  ok=${b.successes}  ` +
        `cache=${b.cacheHits}(${cr}%)  fb=${b.fallbackUses}  tokens=${tokens}`)
    }
  }
}

async function cmdEvalWithLlm(args: Args, repo: Repo): Promise<void> {
  // Side-by-side eval: deterministic-only vs LLM-enabled.
  const detProvider = buildLlmProvider({ repo, forceNoOp: true })
  const llmProvider = buildLlmProvider({ repo })
  const detEvals = await runEvalSuite({ nameFilter: args.nameFilter, llmProvider: detProvider })
  const llmEvals = await runEvalSuite({ nameFilter: args.nameFilter, llmProvider })
  const detCards = aggregateScorecards(detEvals)
  const llmCards = aggregateScorecards(llmEvals)
  const dO = detCards.overall, lO = llmCards.overall
  console.log(`deterministic-only: ${dO.passed}/${dO.fixtures}  score=${dO.score.toFixed(2)}  llm-fields=${dO.llmFieldsCount}`)
  console.log(`with LLM provider:  ${lO.passed}/${lO.fixtures}  score=${lO.score.toFixed(2)}  llm-fields=${lO.llmFieldsCount}`)
  const delta = (lO.score - dO.score)
  const sign = delta > 0 ? '+' : ''
  console.log(`Δscore: ${sign}${delta.toFixed(2)}  ` +
    `Δpassed: ${sign}${lO.passed - dO.passed}  ` +
    `Δllm-fields: ${sign}${lO.llmFieldsCount - dO.llmFieldsCount}`)
  if (lO.score + 0.001 < dO.score) {
    console.log(`(LLM run regressed; review the LlmCallRecord trail with \`llm-stats\`.)`)
  }
}

function cmdPromoteToGold(args: Args, repo: Repo): void {
  if (!args.artifactId) { console.error('promote-to-gold: --artifact=<rawEmailId> required'); process.exit(2) }
  const draft = promoteToGoldFixture(repo, args.orgId, args.artifactId, {
    name: args.note ?? `promoted-${args.artifactId}`,
    profile: args.profile,
    notes: args.note,
  })
  if (!draft) { console.error(`raw artifact ${args.artifactId} not found`); process.exit(2) }
  const out = JSON.stringify(draft, null, 2)
  if (args.outPath) {
    writeFileSync(args.outPath, out, 'utf8')
    console.log(`[promote-to-gold] wrote ${args.outPath}`)
  } else {
    console.log(out)
  }
}

// ── Helpers for correction parsing ─────────────────────────────────────

function parsePayload(type: string, value: string): CorrectionPayload | null {
  switch (type) {
    case 'broker':         return { kind: 'broker_override',       brokerId: value as unknown as BrokerId }
    case 'ticker':         return { kind: 'ticker_override',       ticker: value as unknown as StockTicker }
    case 'rating': {
      const allowed: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'Not Rated']
      if (!allowed.includes(value as Rating)) return null
      return { kind: 'rating_override', rating: value as Rating }
    }
    case 'target':
    case 'target-price': {
      const n = Number(value); if (!Number.isFinite(n)) return null
      return { kind: 'target_price_override', targetPrice: n }
    }
    case 'prior-target': {
      if (value === 'null' || value === '') return { kind: 'prior_target_override', priorTargetPrice: null }
      const n = Number(value); if (!Number.isFinite(n)) return null
      return { kind: 'prior_target_override', priorTargetPrice: n }
    }
    case 'report-type': {
      return { kind: 'report_type_override', reportType: value as ReportType }
    }
    default: return null
  }
}

function buildOneOffScope(args: Args): CorrectionScope {
  const scope: CorrectionScope = {}
  if (args.artifactId) (scope as { artifactId?: string }).artifactId = args.artifactId
  return scope
}

function buildReusableScope(args: Args): CorrectionScope {
  const scope: CorrectionScope = {}
  if (args.broker)        (scope as { brokerId?: BrokerId }).brokerId = args.broker as unknown as BrokerId
  if (args.profile)       (scope as { parserProfile?: string }).parserProfile = args.profile
  if (args.subjectRegex)  (scope as { subjectRegex?: string }).subjectRegex = args.subjectRegex
  return scope
}

function printHelp(): void {
  console.log(`live-sync + eval ops CLI

  npm run ops -- sync [--org=<orgId>] [--reset]
  npm run ops -- replay --id=<rawEmailId> [--org=<orgId>]
  npm run ops -- replay-failed [--org=<orgId>]
  npm run ops -- list-failures [--org=<orgId>]
  npm run ops -- list-review   [--org=<orgId>]
  npm run ops -- clear-review --id=<reviewId> [--note="..."] [--org=<orgId>]
  npm run ops -- status        [--org=<orgId>]

  npm run ops -- eval [--name=<substring>]
  npm run ops -- scorecard [--bucket=broker|profile|source|reportType|enrichment]
  npm run ops -- field-stats
  npm run ops -- top-failures [--org=<orgId>]
  npm run ops -- diff --before=<snapshot.json> --after=<snapshot.json>

  npm run ops -- correct --type=<type> --value=<v> --artifact=<rawId> [--note="..."]
  npm run ops -- correct-rule --type=<type> --value=<v> [--broker=<>|--profile=<>|--subject-regex=<>] [--note="..."]
  npm run ops -- list-corrections
  npm run ops -- disable-correction --id=<correctionId> [--note="..."]
  npm run ops -- replay-with-corrections --artifact=<rawId>
  npm run ops -- correction-impact
  npm run ops -- promote-to-gold --artifact=<rawId> [--name="..."] [--profile=<>] [--out=<path>]

  npm run ops -- prompt-list
  npm run ops -- llm-stats         [--actor=all-orgs] [--org=<orgId>]
  npm run ops -- eval-with-llm     [--name=<substring>]

Correction types: broker, ticker, rating, target, prior-target, report-type.

LLM provider env: OPENAI_API_KEY / ANTHROPIC_API_KEY (optional). LLM_DISABLED=1 forces no-op.

Default org: org_vimana. SERVER_PERSISTENCE selects the repo (file | memory | sqlite).`)
}

// ── Fixture-backed client used by the CLI in dev mode. ───────────────────

function buildFixtureClient(orgId: OrgId): MockRawUpstreamClient {
  const dir = join(process.cwd(), 'server', 'src', 'sync', '__tests__', 'fixtures')
  let files: readonly string[]
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort() } catch { files = [] }
  const pages = files.map((file, i) => {
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      readonly cursor: string | null
      readonly items: readonly { readonly upstreamId: string; readonly artifact: RawEmailArtifact }[]
    }
    return {
      cursor: i === 0 ? null : json.cursor,
      items: json.items.map((it): RawArtifactRow => ({
        upstreamId: it.upstreamId,
        orgId,
        artifact: { ...it.artifact, orgId },
      })),
    }
  })
  return new MockRawUpstreamClient({ pages })
}

main().catch((e) => {
  console.error('[ops] fatal', e instanceof Error ? e.stack : e)
  process.exit(1)
})
