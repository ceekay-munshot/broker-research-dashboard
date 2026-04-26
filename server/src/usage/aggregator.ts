// ─────────────────────────────────────────────────────────────────────────
// Pure aggregator — turns raw `UsageEvent[]` into an `OrgUsageSnapshot`.
//
// No I/O, no clock (the caller passes `now`). Same inputs → same output.
// ─────────────────────────────────────────────────────────────────────────

import type {
  UsageEvent, UsageSurface,
  ContentEngagement, DeliveryEngagement, SurfaceUsageSummary,
  RankingExperimentSummary, DeliveryAttempt, DeliveryContentKind,
  SourceHealthStatus,
} from '../../../src/domain'
import { USAGE_SURFACES } from '../../../src/domain'
import type { AggregatorInputs, ComputeArgs, Snapshot } from './types'

export function computeOrgUsageSnapshot(input: AggregatorInputs): Snapshot {
  const windowEnd = input.now
  const windowStart = new Date(windowEnd.getTime() - input.windowMs)
  const events = input.events.filter((e) => {
    const t = Date.parse(e.occurredAt)
    return t >= windowStart.getTime() && t <= windowEnd.getTime()
  })

  const sessionIds = new Set(events.map((e) => e.sessionId as string))
  const userIds = new Set(events.map((e) => e.userId as unknown as string).filter(Boolean))
  const opens = events.filter((e) => e.eventType.startsWith('open_')).length

  // DAU = distinct users with any event today (UTC). WAU = last 7d.
  const todayKey = windowEnd.toISOString().slice(0, 10)
  const usersToday = new Set<string>()
  const usersLast7 = new Set<string>()
  const sevenDaysMs = 7 * 86400 * 1000
  for (const e of events) {
    if (!e.userId) continue
    const u = e.userId as unknown as string
    if (e.occurredAt.slice(0, 10) === todayKey) usersToday.add(u)
    if (Date.parse(e.occurredAt) >= windowEnd.getTime() - sevenDaysMs) usersLast7.add(u)
  }

  // Source-health mix.
  const healthMix: Record<SourceHealthStatus, number> = {
    healthy: 0, stale: 0, degraded: 0, failing: 0, unknown: 0,
  }
  for (const e of events) healthMix[e.sourceHealth] = (healthMix[e.sourceHealth] ?? 0) + 1

  // Per-surface usage.
  const surfaces: SurfaceUsageSummary[] = USAGE_SURFACES.map((s) => {
    const onSurface = events.filter((e) => e.surface === s)
    const views = onSurface.filter((e) => e.eventType === 'view_tab').length
    const distinctUsers = new Set(onSurface.map((e) => e.userId as unknown as string).filter(Boolean)).size
    const opensFromSurface = events.filter((e) => e.fromSurface === s && e.eventType.startsWith('open_')).length
    return { surface: s, views, distinctUsers, opensFromSurface }
  })

  // Per content kind.
  const byKind = new Map<UsageEvent['contentKind'], UsageEvent[]>()
  for (const e of events) {
    if (!e.contentKind) continue
    const arr = byKind.get(e.contentKind) ?? []
    arr.push(e)
    byKind.set(e.contentKind, arr)
  }
  const contentEngagement: ContentEngagement[] = [...byKind.entries()].map(([kind, arr]) => {
    const opens = arr.filter((e) => e.eventType.startsWith('open_')).length
    const distinctEntities = new Set(arr.map((e) => e.entityId).filter((x): x is string => !!x)).size
    const distinctUsers = new Set(arr.map((e) => e.userId as unknown as string).filter(Boolean)).size
    const fromSurfaces = new Map<UsageSurface, number>()
    for (const e of arr) {
      if (!e.fromSurface || !e.eventType.startsWith('open_')) continue
      fromSurfaces.set(e.fromSurface, (fromSurfaces.get(e.fromSurface) ?? 0) + 1)
    }
    return { contentKind: kind, opens, distinctEntities, distinctUsers, fromSurfaces }
  })

  const deliveryEngagement = computeDeliveryEngagement(events, input.deliveryAttempts)
  const rankingExperiment = computeRankingExperiment(events)

  return {
    orgId: input.orgId,
    generatedAt: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    windowDays: Math.round(input.windowMs / 86400000),
    totals: {
      events: events.length,
      sessions: sessionIds.size,
      distinctUsers: userIds.size,
      opens,
    },
    dau: usersToday.size,
    wau: usersLast7.size,
    surfaces,
    contentEngagement,
    deliveryEngagement,
    rankingExperiment,
    sourceHealthMix: healthMix,
  }
}

function computeDeliveryEngagement(
  events: readonly UsageEvent[],
  attempts: readonly DeliveryAttempt[],
): readonly DeliveryEngagement[] {
  const byKindChannel = new Map<string, DeliveryAttempt[]>()
  for (const a of attempts) {
    const k = `${a.contentKind}::${a.channel}`
    const arr = byKindChannel.get(k) ?? []
    arr.push(a)
    byKindChannel.set(k, arr)
  }
  // Index opens + click-throughs by attemptId.
  const opensById = new Map<string, UsageEvent[]>()
  const clicksById = new Map<string, UsageEvent[]>()
  for (const e of events) {
    if (!e.entityId) continue
    if (e.eventType === 'open_delivery') {
      const arr = opensById.get(e.entityId) ?? []
      arr.push(e); opensById.set(e.entityId, arr)
    } else if (e.eventType === 'click_through_delivery') {
      const arr = clicksById.get(e.entityId) ?? []
      arr.push(e); clicksById.set(e.entityId, arr)
    }
  }
  const out: DeliveryEngagement[] = []
  for (const [k, arr] of byKindChannel) {
    const [kind, channel] = k.split('::') as [DeliveryContentKind, DeliveryAttempt['channel']]
    const delivered = arr.filter((a) => a.status === 'sent').length
    let opened = 0, clickedThrough = 0
    const ttfo: number[] = []
    for (const a of arr) {
      if (a.status !== 'sent' || !a.sentAt) continue
      const opens = opensById.get(a.id as unknown as string) ?? []
      if (opens.length > 0) {
        opened++
        const sentMs = Date.parse(a.sentAt)
        const firstOpenMs = Math.min(...opens.map((e) => Date.parse(e.occurredAt)))
        if (firstOpenMs >= sentMs) ttfo.push(Math.round((firstOpenMs - sentMs) / 1000))
      }
      const clicks = clicksById.get(a.id as unknown as string) ?? []
      if (clicks.length > 0) clickedThrough++
    }
    out.push({
      contentKind: kind, channel,
      delivered, opened, clickedThrough,
      medianTimeToFirstOpenSeconds: ttfo.length > 0 ? median(ttfo) : null,
    })
  }
  return out
}

function computeRankingExperiment(events: readonly UsageEvent[]): RankingExperimentSummary {
  // Opens grouped by ranking mode.
  const opens = events.filter((e) => e.eventType === 'open_report')
  const baseline = opens.filter((e) => e.rankingMode === 'baseline').length
  const adaptive = opens.filter((e) => e.rankingMode === 'adaptive').length
  const compare  = opens.filter((e) => e.rankingMode === 'compare').length

  // Top-5 / top-10 opens — items whose meta.rank ∈ {1..5}/{1..10}.
  const top5Base = opens.filter((e) => e.rankingMode === 'baseline' && Number(e.meta.rank) > 0 && Number(e.meta.rank) <= 5).length
  const top5Adapt = opens.filter((e) => e.rankingMode === 'adaptive' && Number(e.meta.rank) > 0 && Number(e.meta.rank) <= 5).length
  const top10Base = opens.filter((e) => e.rankingMode === 'baseline' && Number(e.meta.rank) > 0 && Number(e.meta.rank) <= 10).length
  const top10Adapt = opens.filter((e) => e.rankingMode === 'adaptive' && Number(e.meta.rank) > 0 && Number(e.meta.rank) <= 10).length

  // Median time-to-first-open per mode (per session).
  const ttfoByMode: Record<'baseline' | 'adaptive', number[]> = { baseline: [], adaptive: [] }
  // Group events by session, find first view_tab on worklog/briefing, then first open_report after.
  const bySession = new Map<string, UsageEvent[]>()
  for (const e of events) {
    const k = e.sessionId as string
    const arr = bySession.get(k) ?? []
    arr.push(e); bySession.set(k, arr)
  }
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    const view = arr.find((e) => e.eventType === 'view_tab' && (e.surface === 'worklog' || e.surface === 'briefing'))
    if (!view) continue
    const firstOpen = arr.find((e) => e.eventType === 'open_report' && Date.parse(e.occurredAt) >= Date.parse(view.occurredAt))
    if (!firstOpen) continue
    const dt = Math.round((Date.parse(firstOpen.occurredAt) - Date.parse(view.occurredAt)) / 1000)
    if (firstOpen.rankingMode === 'baseline' || firstOpen.rankingMode === 'adaptive') {
      ttfoByMode[firstOpen.rankingMode].push(dt)
    }
  }
  const medianBaseline = ttfoByMode.baseline.length > 0 ? median(ttfoByMode.baseline) : null
  const medianAdaptive = ttfoByMode.adaptive.length > 0 ? median(ttfoByMode.adaptive) : null

  // Hedged note.
  const totalOpens = baseline + adaptive
  let note = ''
  let mode: RankingExperimentSummary['mode'] = 'observed'
  if (totalOpens < 20) {
    note = `Only ${totalOpens} ranked-mode opens recorded — sample size too small for a confident comparison. Treat as directional.`
    mode = totalOpens === 0 ? 'insufficient_signal' : 'observed'
  } else if (medianBaseline !== null && medianAdaptive !== null) {
    const delta = medianAdaptive - medianBaseline
    if (Math.abs(delta) < 5) {
      note = `Time-to-first-open is similar across modes (Δ ${delta}s). Adaptive ranking has not measurably changed triage speed in this window.`
    } else {
      const better = delta < 0 ? 'adaptive' : 'baseline'
      const pct = medianBaseline > 0 ? Math.round((Math.abs(delta) / medianBaseline) * 100) : 0
      note = `Median time-to-first-open is ${pct}% ${delta < 0 ? 'faster' : 'slower'} under adaptive ranking. ${better === 'adaptive' ? 'Directional positive.' : 'Directional negative.'} Sample n=${totalOpens}.`
    }
  } else {
    note = 'Insufficient time-to-first-open data on at least one ranking mode.'
  }

  return {
    mode,
    baselineOpens: baseline,
    adaptiveOpens: adaptive,
    compareModeOpens: compare,
    top5Opens: { baseline: top5Base, adaptive: top5Adapt },
    top10Opens: { baseline: top10Base, adaptive: top10Adapt },
    medianTimeToFirstOpenSeconds: { baseline: medianBaseline, adaptive: medianAdaptive },
    note,
  }
}

function median(arr: readonly number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

/** Repo-backed convenience used by the API route + CLI. */
export function buildOrgUsageSnapshot(args: ComputeArgs): Snapshot {
  const now = args.now ?? new Date()
  const windowMs = args.windowDays * 86400 * 1000
  const events = args.repo.listUsageEvents(args.orgId, { sinceMs: windowMs, limit: 5000 })
  const attempts = args.repo.listDeliveryAttempts(args.orgId, { limit: 1000 })
  return computeOrgUsageSnapshot({
    orgId: args.orgId, events, windowMs, now,
    deliveryAttempts: attempts,
  })
}
