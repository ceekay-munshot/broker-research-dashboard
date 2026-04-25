#!/usr/bin/env tsx
// Module 16 — corrections / adjudication / replay learning loop.
//
// End-to-end tests covering:
//   - one-off correction applies to specific artifact only
//   - reusable correction applies by broker / profile / subject-regex
//   - corrections fire BEFORE LLM enrichment (deterministic-only path)
//   - quality.correctedFields reflects every override
//   - replayWithCorrections produces a different materialization
//   - diffSnapshots captures the change cleanly
//   - impact counters increment
//   - promote-to-gold yields a valid GoldFixture skeleton

import { Pipeline } from '../../pipeline/pipeline'
import { ReviewQueue } from '../../pipeline/reviewQueue'
import { runJobs } from '../../pipeline/runner'
import { HybridCanonicalStore, InMemoryRepo } from '../../persistence'
import { syncOnce, MockRawUpstreamClient, type RawArtifactRow } from '../../sync'
import {
  indexRules, applyCandidateCorrections, matchesScope, conflictSignature,
  promoteToGoldFixture,
} from '..'
import { diffSnapshots, type MaterializedRunOutputs } from '../../eval'
import type { CorrectionRule } from '..'
import type { OrgId, BrokerId, Rating, ReportType, StockTicker } from '../../../../src/domain'
import type { RawEmailArtifact } from '../../pipeline/models'

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
function assertEq<T>(a: T, b: T, msg: string) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`assertion failed: ${msg}`) }

const ORG: OrgId = 'org_vimana' as unknown as OrgId

// A raw artifact where the deterministic extractor will pick rating=Hold
// (because the body says "Hold" prominently). We'll override it to Buy.
function buildArtifact(): RawEmailArtifact {
  return {
    id: 'raw_corrections_001',
    receivedAt: '2026-04-22T11:15:00.000Z',
    orgId: ORG,
    envelope: {
      messageId: '<corrections-test@iifl.com>',
      from: 'IIFL Research <research@iifl.com>',
      to: 'vimana@vimanacapital.com',
      subject: 'MARUTI — Flash: pricing pressure intensifies; PT ₹11,000',
      receivedAt: '2026-04-22T11:15:00.000Z',
      bodyText: 'MARUTI — Flash. We maintain Hold on MARUTI with revised PT ₹11,000 (from ₹11,500). Q1 retail share lost ~120 bps.',
      bodyHtml: null,
      forwardedBy: [],
    },
    attachmentRefs: [],
    linkedRefs: [],
  }
}

function buildClient(): MockRawUpstreamClient {
  const row: RawArtifactRow = { upstreamId: 'raw_up_corr_001', orgId: ORG, artifact: buildArtifact() }
  return new MockRawUpstreamClient({ pages: [{ cursor: null, items: [row] }] })
}

function makeRule(opts: {
  readonly id?: string
  readonly reusable: boolean
  readonly scope: CorrectionRule['scope']
  readonly payload: CorrectionRule['payload']
}): CorrectionRule {
  const now = new Date().toISOString()
  return {
    id: opts.id ?? `cor_${Math.random().toString(36).slice(2, 8)}`,
    orgId: ORG,
    isReusable: opts.reusable,
    scope: opts.scope,
    payload: opts.payload,
    createdAt: now,
    createdBy: 'test',
    note: '',
    enabled: true,
    applicationCount: 0,
    reviewItemsResolved: 0,
    aggregateQualityDelta: 0,
    audit: [{ at: now, actor: 'test', action: 'created' }],
  }
}

async function run() {
  await test('matchesScope: one-off scope matches by artifactId', () => {
    assertEq(matchesScope({ artifactId: 'a' }, { artifactId: 'a', messageId: 'x' }), true, 'a matches a')
    assertEq(matchesScope({ artifactId: 'a' }, { artifactId: 'b', messageId: 'x' }), false, 'a does not match b')
  })

  await test('matchesScope: reusable scope ANDs all set fields', () => {
    const scope = { brokerId: 'brk_iifl' as unknown as BrokerId, parserProfile: 'iifl_html_single' }
    assertEq(matchesScope(scope, { brokerId: 'brk_iifl', parserProfile: 'iifl_html_single' }), true, 'both match')
    assertEq(matchesScope(scope, { brokerId: 'brk_iifl', parserProfile: 'kotak_pdf' }), false, 'profile differs')
    assertEq(matchesScope(scope, { brokerId: 'brk_kotak', parserProfile: 'iifl_html_single' }), false, 'broker differs')
  })

  await test('matchesScope: empty scope never matches', () => {
    assertEq(matchesScope({}, { artifactId: 'a', brokerId: 'b' }), false, 'empty rejects')
  })

  await test('matchesScope: subjectRegex applies', () => {
    assertEq(matchesScope({ subjectRegex: 'MARUTI' }, { subject: 'MARUTI flash' }), true, 'matches')
    assertEq(matchesScope({ subjectRegex: 'TCS' }, { subject: 'MARUTI flash' }), false, 'no match')
  })

  await test('one-off correction applies to its target artifact only', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)

    const rule = makeRule({
      reusable: false,
      scope: { artifactId: 'raw_corrections_001' },
      payload: { kind: 'rating_override', rating: 'Buy' as Rating },
    })
    repo.upsertCorrectionRule(rule)

    let appliedCount = 0
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
      onCorrectionApplied: () => { appliedCount++ },
    })
    const result = await pipeline.run(buildArtifact())
    assertEq(result.outcome, 'materialized_ready', 'outcome')
    const summary = result.job.materialized!.summaries[0]!
    assertEq(summary.rating, 'Buy', 'rating overridden to Buy')
    assertEq(summary.stance, 'bullish', 'stance recomputed from corrected rating')
    assert(appliedCount > 0, 'correction was reported as applied')
    const quality = result.job.materialized!.quality[0]!
    assert(quality.correctedFields.includes('rating'), 'quality.correctedFields includes rating')
    assert(quality.correctedFields.includes('stance'), 'quality.correctedFields includes stance')
  })

  await test('one-off correction does NOT apply to a different artifact', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    repo.upsertCorrectionRule(makeRule({
      reusable: false,
      scope: { artifactId: 'some_other_artifact_id' },
      payload: { kind: 'rating_override', rating: 'Buy' as Rating },
    }))
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const result = await pipeline.run(buildArtifact())
    const summary = result.job.materialized!.summaries[0]!
    assertEq(summary.rating, 'Hold', 'rating unchanged (deterministic)')
  })

  await test('reusable correction matches by broker', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    repo.upsertCorrectionRule(makeRule({
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'target_price_override', targetPrice: 12000 },
    }))
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const result = await pipeline.run(buildArtifact())
    const summary = result.job.materialized!.summaries[0]!
    assertEq(summary.targetPrice, 12000, 'target overridden to 12000')
    const quality = result.job.materialized!.quality[0]!
    assert(quality.correctedFields.includes('targetPrice'), 'targetPrice in correctedFields')
  })

  await test('disabled correction does NOT fire', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const r = makeRule({
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'target_price_override', targetPrice: 12000 },
    })
    repo.upsertCorrectionRule({ ...r, enabled: false })
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const result = await pipeline.run(buildArtifact())
    const summary = result.job.materialized!.summaries[0]!
    assertEq(summary.targetPrice, 11000, 'target unchanged when rule disabled')
  })

  await test('superseded correction does NOT fire', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    repo.upsertCorrectionRule(makeRule({
      id: 'cor_old',
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'rating_override', rating: 'Sell' as Rating },
    }))
    repo.appendCorrectionAudit(ORG, 'cor_old',
      { at: new Date().toISOString(), actor: 'test', action: 'superseded', replacedBy: 'cor_new' },
      { supersededBy: 'cor_new' })
    repo.upsertCorrectionRule(makeRule({
      id: 'cor_new',
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'rating_override', rating: 'Buy' as Rating },
    }))
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const result = await pipeline.run(buildArtifact())
    assertEq(result.job.materialized!.summaries[0]!.rating, 'Buy', 'newest rule wins')
  })

  await test('applyCandidateCorrections is pure (returns new candidate)', () => {
    const baseCandidate = {
      ticker: 'MARUTI' as unknown as StockTicker, sectorId: null,
      brokerId: 'brk_iifl' as unknown as BrokerId, orgId: ORG,
      reportType: 'flash' as ReportType,
      rating: 'Hold' as Rating, stance: 'neutral' as const,
      targetPrice: 11000, priorTargetPrice: 11500, publishedAt: 'x', receivedAt: 'x',
      title: 't', summaryOneLine: 's',
      deterministicEvidence: [], origin: 'direct_body' as const,
    }
    const rules = indexRules([makeRule({
      reusable: false, scope: { artifactId: 'a' },
      payload: { kind: 'target_price_override', targetPrice: 9999 },
    })])
    const r = applyCandidateCorrections(
      baseCandidate as Parameters<typeof applyCandidateCorrections>[0],
      buildArtifact(), {
        orgId: ORG, messageId: 'x', subject: 's', bodyText: '', bodyHtml: null,
        senderAddress: 's@x', senderName: 's', recipientAddress: 'r@x',
        forwardedBy: [], receivedAt: 'x', attachmentNames: [], linkedUrls: [],
      },
      rules,
    )
    // No match → no change.
    assertEq(r.candidate.targetPrice, 11000, 'no scope match, no change')
    assertEq(r.correctedFields.length, 0, 'no fields corrected')
  })

  await test('replay-with-corrections produces different materialized output (diff visible)', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)

    // First run: no corrections. Capture baseline snapshot.
    const baselinePipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    const baseline = await baselinePipeline.run(buildArtifact())
    const before: MaterializedRunOutputs = {
      outcome: baseline.outcome,
      email: baseline.job.materialized!.email,
      attachments: baseline.job.materialized!.attachments,
      reports: baseline.job.materialized!.reports,
      summaries: baseline.job.materialized!.summaries,
      evidence: baseline.job.materialized!.evidence,
      opinions: baseline.job.materialized!.opinions,
      quality: baseline.job.materialized!.quality,
      reviewCategories: [],
    }

    // Add a rating override.
    repo.upsertCorrectionRule(makeRule({
      reusable: false,
      scope: { artifactId: 'raw_corrections_001' },
      payload: { kind: 'rating_override', rating: 'Buy' as Rating },
    }))

    // Replay with corrections.
    const correctedPipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const replay = await correctedPipeline.run(buildArtifact())
    const after: MaterializedRunOutputs = {
      outcome: replay.outcome,
      email: replay.job.materialized!.email,
      attachments: replay.job.materialized!.attachments,
      reports: replay.job.materialized!.reports,
      summaries: replay.job.materialized!.summaries,
      evidence: replay.job.materialized!.evidence,
      opinions: replay.job.materialized!.opinions,
      quality: replay.job.materialized!.quality,
      reviewCategories: [],
    }

    const diff = diffSnapshots(before, after)
    const ratingChange = diff.entries.find((e) => e.field === 'MARUTI.rating')
    assertEq(ratingChange?.outcome, 'changed', 'MARUTI.rating diff entry is changed')
    assertEq(ratingChange?.before, 'Hold', 'before=Hold')
    assertEq(ratingChange?.after, 'Buy', 'after=Buy')
  })

  await test('correction impact counters bump on apply', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const rule = makeRule({
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'rating_override', rating: 'Buy' as Rating },
    })
    repo.upsertCorrectionRule(rule)
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
      onCorrectionApplied: (a) => repo.bumpCorrectionImpact(ORG, a.ruleId, { applicationCount: 1 }),
    })
    await pipeline.run(buildArtifact())
    const updated = repo.getCorrectionRule(ORG, rule.id)!
    assert(updated.applicationCount > 0, `applicationCount > 0, got ${updated.applicationCount}`)
  })

  await test('promote-to-gold produces a valid draft skeleton', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    await syncOnce({ orgId: ORG, client: buildClient(), repo, pipeline })

    const draft = promoteToGoldFixture(repo, ORG, 'raw_corrections_001', { name: 'iifl-maruti-flash' })
    assert(draft, 'draft produced')
    assertEq(draft!.name, 'iifl-maruti-flash', 'name set')
    assertEq(draft!.expected.broker, 'brk_iifl', 'broker resolved')
    assertEq(draft!.expected.expectMaterialization, true, 'expectMaterialization true')
    assert(draft!.expected.minReports === 1, `minReports=1, got ${draft!.expected.minReports}`)
    assertEq(draft!.expected.primary?.ticker, 'MARUTI', 'primary ticker captured')
  })

  await test('runJobs respects corrections via Pipeline option', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    repo.upsertCorrectionRule(makeRule({
      reusable: true,
      scope: { brokerId: 'brk_iifl' as unknown as BrokerId },
      payload: { kind: 'rating_override', rating: 'Sell' as Rating },
    }))
    const pipeline = new Pipeline({
      store, reviewQueue: new ReviewQueue(),
      corrections: indexRules(repo.listCorrectionRules(ORG, { enabledOnly: true })),
    })
    const job = await runJobs(pipeline, [buildArtifact()])
    assertEq(job.counts.materialized, 1, 'materialized count')
    const summaries = repo.loadCanonicalForOrg(ORG).summaries
    assertEq(summaries[0]?.rating, 'Sell', 'correction reflected in canonical store')
  })

  await test('conflictSignature normalizes vocab order', () => {
    assertEq(
      conflictSignature('CONFLICTING_RATINGS', ['Sell', 'Buy']),
      'CONFLICTING_RATINGS:Buy,Sell',
      'sorted',
    )
  })

  // ── Report ─────────────────────────────────────────────────────────
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
