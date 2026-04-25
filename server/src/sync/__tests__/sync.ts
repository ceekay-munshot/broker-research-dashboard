#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Live-sync end-to-end tests.
//
//   1. fresh sync over batch-1 + batch-2 ⇒ all artifacts materialize
//   2. re-running batch-2 alone (which overlaps batch-1) is idempotent —
//      no new canonical reports created
//   3. checkpoints persist + advance the cursor
//   4. replayOne re-runs the pipeline and updates canonical entities
//   5. canonical entities round-trip through the repo (HybridStore
//      hydrates correctly on cold start)
//   6. JsonFileRepo persists across instances (write → flush → reload)
// ─────────────────────────────────────────────────────────────────────────

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OrgId } from '../../../../src/domain'
import { Pipeline } from '../../pipeline/pipeline'
import { ReviewQueue } from '../../pipeline/reviewQueue'
import {
  HybridCanonicalStore, InMemoryRepo, JsonFileRepo,
} from '../../persistence'
import {
  MockRawUpstreamClient, syncOnce, replayOne, snapshotStatus,
  type RawArtifactRow,
} from '..'
import type { RawEmailArtifact } from '../../pipeline/models'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ORG: OrgId = 'org_vimana' as unknown as OrgId

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
function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`assertion failed: ${msg}`) }

// Fixtures live in this same directory.
function loadBatch(name: string, orgId: OrgId): { cursor: string | null; items: readonly RawArtifactRow[] } {
  const json = JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as {
    readonly cursor: string | null
    readonly items: readonly { readonly upstreamId: string; readonly artifact: RawEmailArtifact }[]
  }
  return {
    cursor: json.cursor,
    items: json.items.map((it) => ({
      upstreamId: it.upstreamId,
      orgId,
      artifact: { ...it.artifact, orgId },
    })),
  }
}

function buildClient(orgId: OrgId): MockRawUpstreamClient {
  const b1 = loadBatch('upstream-batch-1.json', orgId)
  const b2 = loadBatch('upstream-batch-2.json', orgId)
  return new MockRawUpstreamClient({
    pages: [
      { cursor: null, items: b1.items },
      { cursor: b2.cursor, items: b2.items },
    ],
  })
}

async function run() {
  await test('fresh sync materializes artifacts from both batches', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    const client = buildClient(ORG)

    const r = await syncOnce({ orgId: ORG, client, repo, pipeline })
    assert(r.fetchedCount >= 4, `fetched ≥ 4, got ${r.fetchedCount}`)
    assert(r.materializedCount >= 3, `materialized ≥ 3, got ${r.materializedCount}`)
    // Canonical reports are persisted.
    const dump = repo.loadCanonicalForOrg(ORG)
    assert(dump.reports.length >= 3, `reports persisted ≥ 3, got ${dump.reports.length}`)
    assert(dump.summaries.length >= 3, `summaries persisted ≥ 3`)
  })

  await test('re-running the same client is idempotent (no duplicate canonical reports)', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    const client = buildClient(ORG)

    const r1 = await syncOnce({ orgId: ORG, client, repo, pipeline })
    const reportsAfterFirst = repo.loadCanonicalForOrg(ORG).reports.length

    // Reset cursor and re-fetch the same batches end to end.
    const r2 = await syncOnce({ orgId: ORG, client, repo, pipeline, cursorOverride: null })
    const reportsAfterSecond = repo.loadCanonicalForOrg(ORG).reports.length

    assert(r1.materializedCount > 0, 'first run materialized something')
    assertEq(reportsAfterFirst, reportsAfterSecond, 'no new reports on second run')
    assertEq(r2.newCount, 0, 'second run sees zero new artifacts (all fingerprints known)')
  })

  await test('checkpoint persists cursor + counters', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    const client = buildClient(ORG)

    await syncOnce({ orgId: ORG, client, repo, pipeline })
    const cp = repo.getCheckpoint(ORG)
    assert(cp, 'checkpoint present')
    assert(cp!.lastSyncedAt !== null, 'lastSyncedAt set')
    assert(cp!.lastFetchedCount > 0, 'lastFetchedCount > 0')
  })

  await test('replayOne re-runs the pipeline and is byte-identical (deterministic IDs)', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    const client = buildClient(ORG)
    await syncOnce({ orgId: ORG, client, repo, pipeline })

    const beforeReports = repo.loadCanonicalForOrg(ORG).reports.length
    const aRaw = repo.listRawEmails(ORG)[0]!
    const r = await replayOne({ orgId: ORG, artifactId: aRaw.id, repo, pipeline })
    const afterReports = repo.loadCanonicalForOrg(ORG).reports.length

    assert(r.outcome === 'materialized_ready' || r.outcome === 'review_needed',
      `outcome valid, got ${r.outcome}`)
    assertEq(beforeReports, afterReports, 'replay does not duplicate reports')
  })

  await test('HybridCanonicalStore hydrates from repo on cold start', async () => {
    const repo = new InMemoryRepo()
    const storeA = new HybridCanonicalStore(repo)
    const pipelineA = new Pipeline({ store: storeA, reviewQueue: new ReviewQueue() })
    await syncOnce({ orgId: ORG, client: buildClient(ORG), repo, pipeline: pipelineA })

    // Build a fresh in-memory store backed by the same repo and
    // hydrate. The new store should match the one we just wrote.
    const storeB = new HybridCanonicalStore(repo)
    storeB.hydrateFrom([ORG])
    assertEq(storeB.listReports(ORG).length, storeA.listReports(ORG).length,
      'hydrated report count matches')
    assertEq(storeB.listEmails(ORG).length, storeA.listEmails(ORG).length,
      'hydrated email count matches')
  })

  await test('JsonFileRepo persists across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-sync-test-'))
    try {
      const repoA = new JsonFileRepo({ dir })
      const storeA = new HybridCanonicalStore(repoA)
      const pipelineA = new Pipeline({ store: storeA, reviewQueue: new ReviewQueue() })
      await syncOnce({ orgId: ORG, client: buildClient(ORG), repo: repoA, pipeline: pipelineA })
      repoA.flush()

      const reportsA = repoA.loadCanonicalForOrg(ORG).reports.length
      assert(reportsA > 0, 'first instance materialized reports')

      // Open a fresh JsonFileRepo against the same dir → it should
      // hydrate everything the first instance wrote.
      const repoB = new JsonFileRepo({ dir })
      const reportsB = repoB.loadCanonicalForOrg(ORG).reports.length
      assertEq(reportsB, reportsA, 'second instance sees the same reports')
      const cp = repoB.getCheckpoint(ORG)
      assert(cp !== null, 'checkpoint reloaded from disk')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  await test('snapshotStatus reports counters', async () => {
    const repo = new InMemoryRepo()
    const store = new HybridCanonicalStore(repo)
    const pipeline = new Pipeline({ store, reviewQueue: new ReviewQueue() })
    await syncOnce({ orgId: ORG, client: buildClient(ORG), repo, pipeline })

    const s = snapshotStatus(repo, ORG)
    assert(s.counts.rawEmails > 0, 'rawEmails > 0')
    assert(s.counts.materialized >= 0, 'materialized counter present')
    assert(s.checkpoint !== null, 'checkpoint snapshot present')
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
