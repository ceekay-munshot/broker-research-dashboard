// Operator CLI subcommands for the catalyst layer.
//
//   npm run ops -- catalysts:upcoming         [--org=<orgId>] [--days=<n>]
//   npm run ops -- catalysts:brief            --catalyst=<id>
//   npm run ops -- catalysts:weekly-briefs    [--org=<orgId>]
//   npm run ops -- catalysts:delta            --catalyst=<id> --window=<7d|30d>
//   npm run ops -- catalysts:weak-coverage    [--org=<orgId>]
//   npm run ops -- catalysts:replay           [--org=<orgId>]
//
// All commands read/write through the persistent store + Repo. `replay`
// re-runs the catalyst engine against the canonical state and upserts
// fresh briefs.

import type {
  OrgId, CatalystId, EventMonitoringWindow,
  ExpectationSnapshot, PreEventBrief,
} from '../../../src/domain'
import type { HybridCanonicalStore } from '../persistence'
import { runCatalystsForStore } from '../catalysts/bootstrap'
import { buildExpectationDelta } from '../catalysts/delta'
import { buildExpectationSnapshot } from '../catalysts/expectations'

export interface CatalystCliFlags {
  readonly orgId: OrgId
  readonly days?: number
  readonly catalystId?: CatalystId
  readonly window?: EventMonitoringWindow
}

export async function cmdCatalystsUpcoming(flags: CatalystCliFlags, store: HybridCanonicalStore): Promise<void> {
  // Make sure we have a fresh calendar state.
  await runCatalystsForStore(store, [flags.orgId])
  const days = flags.days ?? 30
  const cutoff = Date.now() + days * 86400e3
  const items = store.listCatalysts(flags.orgId).filter((c) => Date.parse(c.expectedAt) <= cutoff)
  console.log('catalyst'.padEnd(40) + 'date'.padStart(12) + 'type'.padStart(20) + 'imp'.padStart(10))
  for (const c of items) {
    console.log(
      `${(c.id as unknown as string).padEnd(40)}${c.expectedDate.padStart(12)}${c.type.padStart(20)}${c.importance.padStart(10)}`,
    )
  }
  console.log(`\n${items.length} catalysts within ${days}d.`)
}

export async function cmdCatalystsBrief(flags: CatalystCliFlags, store: HybridCanonicalStore): Promise<void> {
  if (!flags.catalystId) { console.error('catalysts:brief requires --catalyst=<id>'); process.exit(2) }
  await runCatalystsForStore(store, [flags.orgId])
  const brief = store.latestPreEventBriefForCatalyst(flags.orgId, flags.catalystId)
  if (!brief) { console.log('no brief — is the catalyst within 30d and on the book?'); return }
  printBrief(brief)
}

export async function cmdCatalystsWeeklyBriefs(flags: CatalystCliFlags, store: HybridCanonicalStore): Promise<void> {
  await runCatalystsForStore(store, [flags.orgId])
  const cutoff = Date.now() + 7 * 86400e3
  const briefs = store.listPreEventBriefs(flags.orgId)
    .filter((b) => Date.parse(b.snapshot.asOf) <= cutoff && b.daysUntilEvent <= 7 && b.daysUntilEvent >= 0)
    .sort((a, b) => a.daysUntilEvent - b.daysUntilEvent)
  if (briefs.length === 0) {
    console.log('no upcoming briefs in the next 7 days')
    return
  }
  for (const b of briefs) {
    printBrief(b)
    console.log()
  }
  console.log(`\n${briefs.length} briefs printed for the next 7 days.`)
}

export async function cmdCatalystsDelta(flags: CatalystCliFlags, store: HybridCanonicalStore): Promise<void> {
  if (!flags.catalystId) { console.error('catalysts:delta requires --catalyst=<id>'); process.exit(2) }
  const window: EventMonitoringWindow = flags.window ?? '7d'
  const catalyst = store.getCatalyst(flags.orgId, flags.catalystId)
  if (!catalyst) { console.error(`no catalyst ${flags.catalystId}`); process.exit(2) }
  const reports = store.listReports(flags.orgId)
  const summaries = store.listSummaries(flags.orgId)
  const opinions = store.listOpinions(flags.orgId)
  const alerts = store.listAlerts(flags.orgId, { includeSuppressed: false })
  const stocks = await import('../../../src/mocks/stocks').then((m) => m.stocks)
  const brokers = await import('../config/organizations').then((m) => m.brokers)
  const closures: never[] = []
  const calibration = store.latestCalibrationSnapshot(flags.orgId)
  const now = new Date()
  const current = buildExpectationSnapshot({
    orgId: flags.orgId, catalyst, opinions, reports,
    stocks, brokers, closures, calibration, now,
  })
  const targetMs = now.getTime() - WINDOW_MS(window)
  const prior: ExpectationSnapshot | null = store.priorExpectationSnapshot(flags.orgId, catalyst.id as unknown as string, new Date(targetMs))
  const delta = buildExpectationDelta({
    catalyst, currentSnapshot: current, window, priorSnapshot: prior,
    opinions, reports, summaries, alerts, closures,
  })
  console.log(`Δ ${window}  catalyst=${catalyst.id as unknown as string}  ticker=${catalyst.ticker as unknown as string}`)
  console.log(`  stanceShift=${delta.stanceShift}`)
  console.log(`  meanTargetChangePct=${delta.meanTargetChangePct === null ? '—' : delta.meanTargetChangePct + '%'}`)
  console.log(`  opinionUpdates=${delta.opinionUpdates}  upgrades=${delta.ratingUpgrades}  downgrades=${delta.ratingDowngrades}`)
  console.log(`  divergenceShift=${delta.divergenceShift}`)
  console.log(`  againstPositionAlerts=${delta.againstPositionAlerts}  outliersEmerged=${delta.outlierEmergence}`)
  console.log(`  coverageIntensityDelta=${delta.coverageIntensityDelta}`)
  for (const r of delta.reasons) console.log(`  · ${r.text}`)
}

export function cmdCatalystsWeakCoverage(flags: CatalystCliFlags, store: HybridCanonicalStore): void {
  const briefs = store.listPreEventBriefs(flags.orgId).filter((b) =>
    b.riskFlags.includes('thin_coverage') ||
    b.riskFlags.includes('stale_coverage') ||
    b.riskFlags.includes('high_calibration_brokers_silent'),
  )
  if (briefs.length === 0) { console.log('no weak-coverage briefs.'); return }
  console.log(`${briefs.length} briefs flagged as weak coverage:`)
  for (const b of briefs) {
    const cat = store.getCatalyst(flags.orgId, b.catalystId)
    console.log(`  ${(cat?.ticker as unknown as string) ?? '—'}  ${b.snapshot.distinctBrokers}br  flags=[${b.riskFlags.join(', ')}]`)
  }
}

export async function cmdCatalystsReplay(flags: CatalystCliFlags, store: HybridCanonicalStore): Promise<void> {
  const summary = await runCatalystsForStore(store, [flags.orgId])
  for (const s of summary) {
    console.log(`[catalysts:replay] org=${s.orgId as unknown as string}  calendar=${s.calendarSize}  briefs=${s.briefs}  reviews=${s.reviews}`)
  }
}

// ── Output helpers ──────────────────────────────────────────────────────

function printBrief(b: PreEventBrief): void {
  console.log('━'.repeat(72))
  console.log(`pre-event brief  catalyst=${b.catalystId as unknown as string}  daysUntil=${b.daysUntilEvent}`)
  console.log(`generatedAt=${b.generatedAt}`)
  if (b.executiveSummary) {
    console.log()
    console.log(`Executive: ${b.executiveSummary}${b.executiveSummaryFromLlm ? '  [LLM]' : ''}`)
  }
  if (b.riskFlags.length > 0) console.log(`Risk flags: ${b.riskFlags.join(', ')}`)
  for (const sec of b.sections) {
    console.log()
    console.log(`▾ ${sec.title}`)
    if (sec.prose) console.log(`  ${sec.prose}${sec.proseFromLlm ? '  [LLM]' : ''}`)
    for (const bullet of sec.bullets) console.log(`  - ${bullet}`)
  }
  console.log('━'.repeat(72))
}

function WINDOW_MS(w: EventMonitoringWindow): number {
  switch (w) {
    case '24h': return 86400e3
    case '3d':  return 3 * 86400e3
    case '7d':  return 7 * 86400e3
    case '14d': return 14 * 86400e3
    case '30d': return 30 * 86400e3
  }
}
