// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for the Module-24 source-integration layer.
//
//   npm run ops -- sources:list                              # known sources + provider modes
//   npm run ops -- sources:health    [--org=<orgId>]         # per-source status + freshness
//   npm run ops -- sources:sync      --kind=<kind> [--org=<orgId>]
//   npm run ops -- sources:sync-all  [--org=<orgId>]
//   npm run ops -- sources:retry     [--org=<orgId>]
//   npm run ops -- sources:backfill  --kind=<kind> --from=<iso> --to=<iso> [--org=<orgId>]
//   npm run ops -- sources:inspect   --kind=<kind> [--org=<orgId>]
//   npm run ops -- sources:compare-modes --kind=<kind>       # show what each provider mode would do
//
// All commands print structured tables. Read-only by default; writes
// happen only when --kind+sync, --backfill, or --retry are used.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, SourceKind, SourcesHealthSnapshot, SourceIntegration, BackfillJob,
} from '../../../src/domain'
import { SOURCE_KINDS } from '../../../src/domain'
import type { SourceManager } from '../sources'

export interface SourcesCliFlags {
  readonly orgId: OrgId
  readonly kind?: SourceKind
  readonly from?: string
  readonly to?: string
  readonly note?: string
  readonly limit?: number
}

export function parseSourceKind(s: string | undefined): SourceKind | undefined {
  if (!s) return undefined
  return SOURCE_KINDS.includes(s as SourceKind) ? (s as SourceKind) : undefined
}

export function cmdSourcesList(flags: SourcesCliFlags, manager: SourceManager): void {
  const snap = manager.snapshot(flags.orgId)
  console.log('━'.repeat(72))
  console.log(`Module 24 — registered sources for org=${flags.orgId as unknown as string}`)
  console.log('━'.repeat(72))
  console.log(
    'kind'.padEnd(20) + 'mode'.padEnd(12) + 'status'.padEnd(12) +
    'last sync'.padEnd(22) + 'baseUrl',
  )
  for (const s of snap.sources) {
    console.log(
      s.kind.padEnd(20) + s.providerMode.padEnd(12) + s.status.padEnd(12) +
      (s.lastSuccessAt ?? '—').padEnd(22) + (s.config.baseUrl ?? '—'),
    )
  }
  console.log('━'.repeat(72))
  console.log(`overall=${snap.overall}   counts: healthy=${snap.counts.healthy} stale=${snap.counts.stale} failing=${snap.counts.failing} degraded=${snap.counts.degraded} unknown=${snap.counts.unknown}`)
}

export function cmdSourcesHealth(flags: SourcesCliFlags, manager: SourceManager): void {
  const snap = manager.snapshot(flags.orgId)
  printSnapshot(snap)
}

export async function cmdSourcesSync(flags: SourcesCliFlags, manager: SourceManager): Promise<void> {
  if (!flags.kind) { console.error('sources:sync requires --kind=<kind>'); process.exit(2) }
  const run = await manager.syncOne(flags.orgId, flags.kind, 'cli')
  console.log(`[sources:sync] ${run.sourceKind} → ${run.outcome} fetched=${run.fetchedCount} new=${run.newCount} ${run.durationMs}ms`)
  if (run.error) console.log(`  error[${run.error.category}]: ${run.error.message}`)
}

export async function cmdSourcesSyncAll(flags: SourcesCliFlags, manager: SourceManager): Promise<void> {
  const runs = await manager.syncAll(flags.orgId, 'cli')
  for (const r of runs) {
    console.log(`[sources:sync-all] ${r.sourceKind.padEnd(20)} → ${r.outcome.padEnd(8)} fetched=${String(r.fetchedCount).padStart(4)} new=${String(r.newCount).padStart(4)} ${String(r.durationMs).padStart(4)}ms`)
    if (r.error) console.log(`  error[${r.error.category}]: ${r.error.message}`)
  }
  console.log(`ran ${runs.length} source(s)`)
}

export async function cmdSourcesRetry(flags: SourcesCliFlags, manager: SourceManager): Promise<void> {
  const runs = await manager.retryFailures(flags.orgId)
  if (runs.length === 0) { console.log('no eligible failed sources to retry'); return }
  for (const r of runs) {
    console.log(`[sources:retry] ${r.sourceKind} → ${r.outcome}` + (r.error ? `  error[${r.error.category}]` : ''))
  }
}

export async function cmdSourcesBackfill(flags: SourcesCliFlags, manager: SourceManager): Promise<void> {
  if (!flags.kind || !flags.from || !flags.to) {
    console.error('sources:backfill requires --kind=<kind> --from=<iso> --to=<iso>')
    process.exit(2)
  }
  const job = manager.queueBackfill({
    orgId: flags.orgId, kind: flags.kind,
    fromIso: flags.from, toIso: flags.to,
    requestedBy: 'cli-operator', note: flags.note ?? null,
  })
  console.log(`[sources:backfill] queued ${job.id as unknown as string}  ${job.sourceKind}  ${job.fromIso} → ${job.toIso}`)
  const completed = await manager.runBackfill(flags.orgId, job.id)
  console.log(`[sources:backfill] ${completed.id as unknown as string}  state=${completed.state}  fetched=${completed.fetchedCount}  new=${completed.newCount}` +
    (completed.note ? `  note: ${completed.note}` : ''))
}

export function cmdSourcesInspect(flags: SourcesCliFlags, manager: SourceManager): void {
  if (!flags.kind) { console.error('sources:inspect requires --kind=<kind>'); process.exit(2) }
  const snap = manager.snapshot(flags.orgId)
  const src = snap.sources.find((s) => s.kind === flags.kind)
  if (!src) { console.log(`no source registered for kind=${flags.kind}`); return }
  printSource(src)
  console.log()
  console.log(`recent runs (${src.recentRuns.length}):`)
  for (const r of src.recentRuns) {
    const tag = r.outcome === 'success' ? '✓' : r.outcome === 'partial' ? '~' : r.outcome === 'failed' ? '✗' : '·'
    console.log(`  ${tag}  ${r.startedAt}  ${r.outcome.padEnd(8)} fetched=${String(r.fetchedCount).padStart(4)} new=${String(r.newCount).padStart(4)} (${r.durationMs}ms, trigger=${r.trigger})`)
    if (r.error) console.log(`     error[${r.error.category}]: ${r.error.message}  (consecutive=${r.error.consecutiveFailures})`)
  }
}

export function cmdSourcesCompareModes(flags: SourcesCliFlags): void {
  if (!flags.kind) { console.error('sources:compare-modes requires --kind=<kind>'); process.exit(2) }
  console.log(`compare modes for kind=${flags.kind}:`)
  console.log('  http      → real HTTP-backed provider; uses SOURCE_<KIND>_BASE_URL + token env')
  console.log('  fixture   → deterministic local fixture; UI labelled `degraded` (serving fallback)')
  console.log('  mock      → synthetic test data; same UI label as fixture')
  console.log('  disabled  → no provider; all consumers degrade explicitly')
  console.log('flip via env: SOURCE_' + flags.kind.toUpperCase() + '_MODE=<mode>')
}

// ── Print helpers ─────────────────────────────────────────────────────

function printSnapshot(snap: SourcesHealthSnapshot): void {
  console.log('━'.repeat(72))
  console.log(`Sources health — org=${snap.orgId as unknown as string}   overall=${snap.overall}`)
  console.log(`generated=${snap.generatedAt}`)
  console.log(`healthy=${snap.counts.healthy}  stale=${snap.counts.stale}  failing=${snap.counts.failing}  degraded=${snap.counts.degraded}  unknown=${snap.counts.unknown}  total=${snap.counts.total}`)
  console.log('━'.repeat(72))
  for (const s of snap.sources) {
    printSource(s)
    console.log()
  }
  if (snap.backfillsInFlight.length > 0) {
    console.log(`backfills in flight (${snap.backfillsInFlight.length}):`)
    for (const j of snap.backfillsInFlight) printBackfill(j)
  }
}

function printSource(s: SourceIntegration): void {
  const ageStr = s.freshness.ageSeconds === null ? '—' : formatAge(s.freshness.ageSeconds)
  const stalenessStr = formatAge(s.freshness.stalenessThresholdSeconds)
  console.log(`  ${s.displayName.padEnd(40)} [${s.providerMode}]  status=${s.status}`)
  console.log(`    last success: ${s.lastSuccessAt ?? '—'}  age=${ageStr} (threshold ${stalenessStr})  stale=${s.freshness.isStale}`)
  if (s.lastError) console.log(`    last error  : [${s.lastError.category}] ${s.lastError.message}  (consec=${s.lastError.consecutiveFailures}, nextRetry=${s.lastError.nextRetryAt ?? '—'})`)
  if (s.degraded.reasons.length > 0) {
    for (const r of s.degraded.reasons) console.log(`    · ${r}`)
    if (s.degraded.affectedModules.length > 0) {
      console.log(`    affected: ${s.degraded.affectedModules.join(', ')}`)
    }
  }
  if (s.watermark) console.log(`    watermark   : ${s.watermark.value ?? '—'} (updated ${s.watermark.updatedAt})`)
}

function printBackfill(j: BackfillJob): void {
  console.log(`  ${j.id as unknown as string}  ${j.sourceKind.padEnd(20)} ${j.fromIso} → ${j.toIso}  state=${j.state}  fetched=${j.fetchedCount}` + (j.note ? `  note: ${j.note}` : ''))
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
