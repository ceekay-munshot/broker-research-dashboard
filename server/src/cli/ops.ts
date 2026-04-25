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
import {
  HybridCanonicalStore, createDefaultRepo, type Repo,
} from '../persistence'
import {
  MockRawUpstreamClient, type RawArtifactRow,
  syncOnce, replayOne, replayAllFailed, snapshotStatus,
} from '../sync'
import { organizations } from '../config/organizations'
import { VIMANA_ORG_ID } from '../../../src/mocks/organizations'
import type { RawEmailArtifact } from '../pipeline/models'

type Subcommand = 'sync' | 'replay' | 'replay-failed' | 'list-failures' | 'list-review' | 'clear-review' | 'status' | 'help'

interface Args {
  readonly cmd: Subcommand
  readonly orgId: OrgId
  readonly id?: string
  readonly note?: string
  readonly reset?: boolean
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
  return {
    cmd,
    orgId: orgId as unknown as OrgId,
    id: flags.id as string | undefined,
    note: flags.note as string | undefined,
    reset: flags.reset === true,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const repo: Repo = createDefaultRepo()
  const store = new HybridCanonicalStore(repo)
  store.hydrateFrom(organizations.map((o) => o.id))
  const reviewQueue = new ReviewQueue()
  const pipeline = new Pipeline({ store, reviewQueue })

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

function printHelp(): void {
  console.log(`live-sync ops CLI

  npm run ops -- sync [--org=<orgId>] [--reset]
  npm run ops -- replay --id=<rawEmailId> [--org=<orgId>]
  npm run ops -- replay-failed [--org=<orgId>]
  npm run ops -- list-failures [--org=<orgId>]
  npm run ops -- list-review   [--org=<orgId>]
  npm run ops -- clear-review --id=<reviewId> [--note="..."] [--org=<orgId>]
  npm run ops -- status        [--org=<orgId>]

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
