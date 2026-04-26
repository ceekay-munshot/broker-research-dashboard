// Operator CLI subcommands for the post-event review layer.
//
//   npm run ops -- postevent:review     --catalyst=<id>
//   npm run ops -- postevent:run-due    [--org=<orgId>]
//   npm run ops -- postevent:list       [--org=<orgId>] [--limit=<n>]
//   npm run ops -- postevent:compare    --catalyst=<id>     # pre-brief vs review
//   npm run ops -- postevent:brokers    [--org=<orgId>]      # most right/wrong
//   npm run ops -- postevent:weak       [--org=<orgId>]      # low-confidence reviews
//   npm run ops -- postevent:replay     [--org=<orgId>]
//
// All commands operate on the persistent store + Repo.

import type {
  OrgId, BrokerId, CatalystId, BrokerVerdict, PostEventReview,
} from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { runPostEventReviewsForStore } from '../postEventReview/bootstrap'

export interface PostEventCliFlags {
  readonly orgId: OrgId
  readonly catalystId?: CatalystId
  readonly limit?: number
}

export async function cmdPostEventReview(flags: PostEventCliFlags, store: HybridCanonicalStore): Promise<void> {
  if (!flags.catalystId) { console.error('postevent:review requires --catalyst=<id>'); process.exit(2) }
  await runPostEventReviewsForStore(store, [flags.orgId])
  const review = store.latestPostEventReviewForCatalyst(flags.orgId, flags.catalystId)
  if (!review) { console.log('no review produced — is the catalyst within the post-event grace window and on the book?'); return }
  printReview(review)
}

export async function cmdPostEventRunDue(flags: PostEventCliFlags, store: HybridCanonicalStore): Promise<void> {
  const summary = await runPostEventReviewsForStore(store, [flags.orgId])
  for (const s of summary) {
    console.log(`[postevent:run-due] org=${s.orgId as unknown as string}  attempted=${s.attempted}  produced=${s.produced}  skipped=${s.skipped}`)
  }
}

export function cmdPostEventList(flags: PostEventCliFlags, store: HybridCanonicalStore): void {
  const items = store.listPostEventReviews(flags.orgId, flags.limit ?? 30)
  if (items.length === 0) { console.log('no post-event reviews on record'); return }
  for (const r of items) {
    const cat = store.getCatalyst(flags.orgId, r.catalystId)
    const tk = (cat?.ticker as unknown as string) ?? '—'
    console.log(`${r.id as unknown as string}  ${tk.padEnd(12)} ${r.outcomeSummary}`)
  }
  console.log(`\n${items.length} reviews`)
}

export function cmdPostEventCompare(flags: PostEventCliFlags, store: HybridCanonicalStore): void {
  if (!flags.catalystId) { console.error('postevent:compare requires --catalyst=<id>'); process.exit(2) }
  const brief = store.latestPreEventBriefForCatalyst(flags.orgId, flags.catalystId)
  const review = store.latestPostEventReviewForCatalyst(flags.orgId, flags.catalystId)
  if (!brief && !review) { console.log('neither pre-event brief nor post-event review on record'); return }
  console.log('━'.repeat(72))
  console.log('PRE-EVENT BRIEF')
  if (brief) {
    console.log(`  generated: ${brief.generatedAt}`)
    console.log(`  daysUntil: ${brief.daysUntilEvent}`)
    console.log(`  tilt:      ${brief.snapshot.tiltSummary}`)
    console.log(`  flags:     ${brief.riskFlags.join(', ') || '—'}`)
    if (brief.executiveSummary) console.log(`  exec:      ${brief.executiveSummary}`)
  } else {
    console.log('  (no brief on record)')
  }
  console.log()
  console.log('POST-EVENT REVIEW')
  if (review) {
    printReview(review)
  } else {
    console.log('  (no review on record)')
  }
  console.log('━'.repeat(72))
}

export function cmdPostEventBrokers(flags: PostEventCliFlags, store: HybridCanonicalStore): void {
  const items = store.listPostEventReviews(flags.orgId)
  const stats = new Map<string, { name: string; right: number; wrong: number; inconclusive: number }>()
  for (const r of items) {
    for (const v of r.brokerVerdicts) {
      const k = v.brokerId as unknown as string
      const cur = stats.get(k) ?? { name: v.brokerShortName, right: 0, wrong: 0, inconclusive: 0 }
      if (v.verdict === 'right')        cur.right += 1
      else if (v.verdict === 'wrong')   cur.wrong += 1
      else if (v.verdict === 'inconclusive') cur.inconclusive += 1
      stats.set(k, cur)
    }
  }
  const arr = [...stats.values()].sort((a, b) => (b.right - b.wrong) - (a.right - a.wrong))
  console.log('broker'.padEnd(28) + 'right'.padStart(7) + 'wrong'.padStart(7) + 'inc'.padStart(7))
  for (const s of arr) {
    console.log(s.name.padEnd(28) + String(s.right).padStart(7) + String(s.wrong).padStart(7) + String(s.inconclusive).padStart(7))
  }
}

export function cmdPostEventWeak(flags: PostEventCliFlags, store: HybridCanonicalStore): void {
  const items = store.listPostEventReviews(flags.orgId).filter((r) =>
    r.confidence === 'very_low' || r.confidence === 'low',
  )
  if (items.length === 0) { console.log('no low-confidence post-event reviews'); return }
  for (const r of items) {
    const cat = store.getCatalyst(flags.orgId, r.catalystId)
    const tk = (cat?.ticker as unknown as string) ?? '—'
    console.log(`${tk.padEnd(12)} ${r.confidence.padEnd(8)} ${r.outcomeSummary}`)
    for (const n of r.notes) console.log(`  · ${n}`)
  }
}

export async function cmdPostEventReplay(flags: PostEventCliFlags, store: HybridCanonicalStore): Promise<void> {
  const summary = await runPostEventReviewsForStore(store, [flags.orgId])
  for (const s of summary) {
    console.log(`[postevent:replay] org=${s.orgId as unknown as string}  attempted=${s.attempted}  produced=${s.produced}  skipped=${s.skipped}`)
  }
}

// ── Output helpers ──────────────────────────────────────────────────────

function printReview(r: PostEventReview): void {
  console.log('━'.repeat(72))
  console.log(r.outcomeSummary)
  console.log(`generatedAt=${r.generatedAt}  confidence=${r.confidence}`)
  if (r.executiveSummary) {
    console.log()
    console.log(`Executive: ${r.executiveSummary}${r.executiveSummaryFromLlm ? '  [LLM]' : ''}`)
  }
  console.log()
  console.log(`▾ Realized outcome (${r.realizedOutcome.headlineDirection})`)
  for (const w of r.realizedOutcome.windows) {
    const raw = w.rawReturnPct === null ? '—' : `${w.rawReturnPct >= 0 ? '+' : ''}${w.rawReturnPct.toFixed(2)}%`
    const rel = w.benchmarkRelReturnPct === null ? '' : ` (rel ${w.benchmarkRelReturnPct >= 0 ? '+' : ''}${w.benchmarkRelReturnPct.toFixed(2)}%)`
    console.log(`  ${w.window}  ${w.direction.padEnd(7)}  ${raw}${rel}`)
  }
  console.log()
  console.log('▾ Broker verdicts')
  for (const v of r.brokerVerdicts) {
    console.log(`  ${v.brokerShortName.padEnd(20)} ${v.preStance.padEnd(8)} → ${v.verdict.padEnd(13)}  ${v.reason}`)
  }
  console.log()
  console.log(`▾ Divergence: ${r.divergenceResolution.kind} — ${r.divergenceResolution.note}`)
  console.log()
  console.log('▾ Expectation errors')
  for (const e of r.expectationErrors) {
    console.log(`  [${String(e.magnitude).padStart(3)}] ${e.kind} — ${e.text}`)
  }
  console.log()
  console.log(`▾ Top post-event reads: ${r.topPostEventReportIds.length} report${r.topPostEventReportIds.length === 1 ? '' : 's'}`)
  for (const n of r.notes) console.log(`Note: ${n}`)
  console.log('━'.repeat(72))
}

void ({} as { brokerId: BrokerId; verdict: BrokerVerdict })
