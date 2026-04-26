// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for Module-26 pilot analytics.
//
//   npm run ops -- usage:summary           [--org=<orgId>] [--days=<n>]
//   npm run ops -- usage:deliveries        [--org=<orgId>] [--days=<n>]
//   npm run ops -- usage:compare-ranking   [--org=<orgId>] [--days=<n>]
//   npm run ops -- usage:engaged-kinds     [--org=<orgId>] [--days=<n>]
//   npm run ops -- usage:least-used        [--org=<orgId>] [--days=<n>]
//   npm run ops -- usage:roi               [--org=<orgId>] [--days=<n>] [--out=<path>]
//   npm run ops -- usage:inspect --kind=<event_type> | --catalyst=<id> | --delivery=<id>
//
// All commands are read-only against the persisted UsageEvent log.
// ─────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs'
import type {
  OrgId, UsageEventType,
} from '../../../src/domain'
import type { Repo } from '../persistence'
import { buildOrgUsageSnapshot, buildPilotRoiSnapshot } from '../usage'

export interface UsageCliFlags {
  readonly orgId: OrgId
  readonly days?: number
  readonly outPath?: string
  readonly eventType?: UsageEventType
  readonly catalystId?: string
  readonly deliveryId?: string
}

export function cmdUsageSummary(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const snap = buildOrgUsageSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  console.log('━'.repeat(72))
  console.log(`Usage summary — org=${flags.orgId as unknown as string}  window=${days}d`)
  console.log(`generatedAt=${snap.generatedAt}`)
  console.log('━'.repeat(72))
  console.log(`events=${snap.totals.events}  sessions=${snap.totals.sessions}  users=${snap.totals.distinctUsers}  opens=${snap.totals.opens}`)
  console.log(`DAU=${snap.dau}  WAU=${snap.wau}`)
  console.log()
  console.log('Top surfaces:')
  const sorted = [...snap.surfaces].sort((a, b) => (b.views + b.opensFromSurface) - (a.views + a.opensFromSurface))
  for (const s of sorted.slice(0, 10)) {
    if (s.views === 0 && s.opensFromSurface === 0) continue
    console.log(`  ${s.surface.padEnd(14)} views=${String(s.views).padStart(4)}  opens-from=${String(s.opensFromSurface).padStart(4)}  users=${s.distinctUsers}`)
  }
  console.log()
  console.log('Source-health mix during events:')
  for (const [k, n] of Object.entries(snap.sourceHealthMix)) {
    if (n === 0) continue
    console.log(`  ${k.padEnd(10)} ${n}`)
  }
}

export function cmdUsageDeliveries(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const snap = buildOrgUsageSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  if (snap.deliveryEngagement.length === 0) { console.log('no deliveries in window'); return }
  console.log('content kind                  channel    delivered  open rate  median t-to-open')
  console.log('-'.repeat(80))
  for (const d of snap.deliveryEngagement) {
    const openRate = d.delivered > 0 ? `${Math.round((d.opened / d.delivered) * 100)}%` : '—'
    const ttfo = d.medianTimeToFirstOpenSeconds === null ? '—' : `${d.medianTimeToFirstOpenSeconds}s`
    console.log(
      d.contentKind.padEnd(30) + d.channel.padEnd(11) +
      String(d.delivered).padStart(9) + openRate.padStart(11) + ttfo.padStart(18),
    )
  }
}

export function cmdUsageCompareRanking(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const snap = buildOrgUsageSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  const r = snap.rankingExperiment
  console.log('━'.repeat(72))
  console.log(`Ranking experiment — org=${flags.orgId as unknown as string}  window=${days}d  mode=${r.mode}`)
  console.log('━'.repeat(72))
  console.log(`baseline opens:  ${r.baselineOpens}`)
  console.log(`adaptive opens:  ${r.adaptiveOpens}`)
  console.log(`compare opens:   ${r.compareModeOpens}`)
  console.log(`top-5 opens:     baseline=${r.top5Opens.baseline}  adaptive=${r.top5Opens.adaptive}`)
  console.log(`top-10 opens:    baseline=${r.top10Opens.baseline}  adaptive=${r.top10Opens.adaptive}`)
  console.log(`median TTFO:     baseline=${r.medianTimeToFirstOpenSeconds.baseline ?? '—'}s  adaptive=${r.medianTimeToFirstOpenSeconds.adaptive ?? '—'}s`)
  console.log()
  console.log(r.note)
}

export function cmdUsageEngagedKinds(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const snap = buildOrgUsageSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  if (snap.contentEngagement.length === 0) { console.log('no content engagement in window'); return }
  console.log('kind                          opens   distinct entities  distinct users')
  console.log('-'.repeat(80))
  const sorted = [...snap.contentEngagement].sort((a, b) => b.opens - a.opens)
  for (const c of sorted) {
    console.log(
      String(c.contentKind ?? '—').padEnd(30) +
      String(c.opens).padStart(6) +
      String(c.distinctEntities).padStart(20) +
      String(c.distinctUsers).padStart(16),
    )
  }
}

export function cmdUsageLeastUsed(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const snap = buildOrgUsageSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  const sorted = [...snap.surfaces].sort((a, b) => (a.views + a.opensFromSurface) - (b.views + b.opensFromSurface))
  console.log('Least-used surfaces (last ' + days + 'd):')
  for (const s of sorted.slice(0, 5)) {
    console.log(`  ${s.surface.padEnd(14)} views=${s.views}  opens-from=${s.opensFromSurface}`)
  }
}

export function cmdUsageRoi(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 30
  const roi = buildPilotRoiSnapshot({ orgId: flags.orgId, repo, windowDays: days })
  if (flags.outPath) {
    writeFileSync(flags.outPath, JSON.stringify(roi, null, 2), 'utf8')
    console.log(`[usage:roi] wrote ${flags.outPath}`)
    return
  }
  console.log('━'.repeat(72))
  console.log(`Pilot ROI — org=${flags.orgId as unknown as string}  window=${days}d`)
  console.log(`generatedAt=${roi.generatedAt}`)
  console.log('━'.repeat(72))
  for (const h of roi.headlines) console.log(`  • ${h}`)
  if (roi.caveats.length > 0) {
    console.log()
    console.log('Caveats:')
    for (const c of roi.caveats) console.log(`  · ${c}`)
  }
  console.log()
  console.log('Channel engagement:')
  console.log('  channel    delivered  opened  open rate  CTR')
  console.log('  ' + '-'.repeat(50))
  for (const c of roi.channelEngagement) {
    const open = c.openRate === null ? '—' : `${Math.round(c.openRate * 100)}%`
    const ctr  = c.clickThroughRate === null ? '—' : `${Math.round(c.clickThroughRate * 100)}%`
    console.log(`  ${c.channel.padEnd(10)} ${String(c.delivered).padStart(9)} ${String(c.opened).padStart(7)} ${open.padStart(11)} ${ctr.padStart(6)}`)
  }
}

export function cmdUsageInspect(flags: UsageCliFlags, repo: Repo): void {
  const days = flags.days ?? 7
  const events = repo.listUsageEvents(flags.orgId, {
    sinceMs: days * 86400 * 1000,
    eventType: flags.eventType,
    limit: 200,
  })
  let filtered = events
  if (flags.catalystId) {
    filtered = filtered.filter((e) => e.entityId === flags.catalystId || e.meta.catalystId === flags.catalystId)
  }
  if (flags.deliveryId) {
    filtered = filtered.filter((e) => e.entityId === flags.deliveryId)
  }
  if (filtered.length === 0) { console.log('no matching events'); return }
  console.log(`time                   surface       event              kind                   entity`)
  console.log('-'.repeat(100))
  for (const e of filtered.slice(0, 50)) {
    console.log(
      e.occurredAt.slice(0, 19).replace('T', ' ').padEnd(22) +
      e.surface.padEnd(14) +
      e.eventType.padEnd(20) +
      String(e.contentKind ?? '—').padEnd(22) +
      String(e.entityId ?? '—').slice(0, 30),
    )
  }
}
