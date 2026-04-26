// ─────────────────────────────────────────────────────────────────────────
// Pilot ROI — packages the snapshot into a pilot-readout bundle with
// hedged headlines + caveats. Pure transform; no I/O.
// ─────────────────────────────────────────────────────────────────────────

import type {
  PilotRoiSnapshot, ChannelEngagementSummary, ReadDepthSummary,
  DeliveryAttempt, DeliveryChannel, OrgId, UsageEvent, AlertEvent, CatalystEvent,
} from '../../../src/domain'
import type { ComputeArgs, Roi } from './types'

const CHANNELS_FOR_ROI: readonly DeliveryChannel[] = ['in_app', 'email', 'slack', 'webhook']

export interface RoiInputs {
  readonly orgId: OrgId
  readonly windowDays: number
  readonly events: readonly UsageEvent[]
  readonly attempts: readonly DeliveryAttempt[]
  readonly alerts: readonly AlertEvent[]
  readonly catalysts: readonly CatalystEvent[]
  readonly postEventReviews: readonly import('../../../src/domain').PostEventReview[]
  readonly now: Date
}

export function computePilotRoi(input: RoiInputs): PilotRoiSnapshot {
  const windowMs = input.windowDays * 86400 * 1000
  const windowEnd = input.now
  const windowStart = new Date(windowEnd.getTime() - windowMs)
  const events = input.events.filter((e) => {
    const t = Date.parse(e.occurredAt)
    return t >= windowStart.getTime() && t <= windowEnd.getTime()
  })
  const attempts = input.attempts.filter((a) => Date.parse(a.enqueuedAt) >= windowStart.getTime())
  const opens = events.filter((e) => e.eventType.startsWith('open_'))

  // Morning brief / intraday open rates.
  const opensById = new Map<string, UsageEvent[]>()
  for (const e of events) {
    if (e.eventType !== 'open_delivery' || !e.entityId) continue
    const arr = opensById.get(e.entityId) ?? []
    arr.push(e); opensById.set(e.entityId, arr)
  }
  const morning = attempts.filter((a) => a.contentKind === 'morning_book_brief' && a.status === 'sent')
  const intraday = attempts.filter((a) => a.contentKind === 'intraday_critical' && a.status === 'sent')
  const morningOpenRate = morning.length > 0
    ? morning.filter((a) => opensById.has(a.id as unknown as string)).length / morning.length
    : null
  const intradayOpenRate = intraday.length > 0
    ? intraday.filter((a) => opensById.has(a.id as unknown as string)).length / intraday.length
    : null

  // Click-through rate across all delivered.
  const sent = attempts.filter((a) => a.status === 'sent')
  const clicked = events.filter((e) => e.eventType === 'click_through_delivery').length
  const ctr = sent.length > 0 ? clicked / sent.length : null

  // Active-day average opens.
  const opensByDay = new Map<string, number>()
  for (const e of opens) {
    const day = e.occurredAt.slice(0, 10)
    opensByDay.set(day, (opensByDay.get(day) ?? 0) + 1)
  }
  const activeDays = opensByDay.size || 1
  const avgOpensPerActiveDay = Math.round((opens.length / activeDays) * 10) / 10

  // Time-to-first-important-open: from first morning_book_brief delivery
  // to first open_report or open_alert in the same UTC day.
  const ttfioSeconds: number[] = []
  for (const a of morning) {
    if (!a.sentAt) continue
    const day = a.sentAt.slice(0, 10)
    const firstImportant = events
      .filter((e) => e.occurredAt.slice(0, 10) === day)
      .filter((e) => e.eventType === 'open_report' || e.eventType === 'open_alert')
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0]
    if (firstImportant) {
      ttfioSeconds.push(Math.round((Date.parse(firstImportant.occurredAt) - Date.parse(a.sentAt)) / 1000))
    }
  }
  const medianTimeToFirstImportantOpenSeconds = ttfioSeconds.length > 0 ? median(ttfioSeconds) : null

  // Held-name critical alert open rate (best-effort: filter alerts where
  // bookContext.membership === 'held' and severity === 'critical').
  const heldCritical = input.alerts.filter(
    (a) => a.severity === 'critical' && a.bookContext?.membership === 'held' && !a.suppressed,
  )
  const openedAlertIds = new Set(events
    .filter((e) => e.eventType === 'open_alert' && e.entityId)
    .map((e) => e.entityId as string))
  const heldNameCriticalAlertOpenRate = heldCritical.length > 0
    ? heldCritical.filter((a) => openedAlertIds.has(a.id as unknown as string)).length / heldCritical.length
    : null

  // Coverage of held names reviewed before catalysts:
  //   for each upcoming catalyst on a held name, did the user open any
  //   report or brief on that ticker prior to expectedAt?
  const upcomingHeldCatalysts = input.catalysts
    .filter((c) => c.status === 'scheduled' || c.status === 'estimated' || c.status === 'overdue')
  let reviewedBeforeCount = 0
  for (const c of upcomingHeldCatalysts) {
    const reviewed = events.some((e) =>
      (e.eventType === 'open_report' || e.eventType === 'open_brief') &&
      Date.parse(e.occurredAt) <= Date.parse(c.expectedAt) &&
      typeof e.meta.ticker === 'string' &&
      e.meta.ticker === (c.ticker as unknown as string),
    )
    if (reviewed) reviewedBeforeCount++
  }
  const heldNameReviewedBeforeCatalystRate = upcomingHeldCatalysts.length > 0
    ? reviewedBeforeCount / upcomingHeldCatalysts.length
    : null

  // Post-event review usage rate: how many published reviews were opened.
  const reviewsInWindow = input.postEventReviews
    .filter((r) => Date.parse(r.generatedAt) >= windowStart.getTime())
  const openedReviewIds = new Set(events
    .filter((e) => e.eventType === 'open_post_event_review' && e.entityId)
    .map((e) => e.entityId as string))
  const postEventReviewUsageRate = reviewsInWindow.length > 0
    ? reviewsInWindow.filter((r) => openedReviewIds.has(r.id as unknown as string)).length / reviewsInWindow.length
    : null

  // Channel engagement.
  const channelEngagement: ChannelEngagementSummary[] = CHANNELS_FOR_ROI.map((channel) => {
    const ch = attempts.filter((a) => a.channel === channel && a.status === 'sent')
    const open = ch.filter((a) => opensById.has(a.id as unknown as string)).length
    const click = events.filter((e) => e.eventType === 'click_through_delivery' && e.meta.channel === channel).length
    return {
      channel,
      delivered: ch.length,
      opened: open,
      openRate: ch.length > 0 ? open / ch.length : null,
      clickThroughRate: ch.length > 0 ? click / ch.length : null,
    }
  })

  // Read-depth (sessions × opens).
  const readDepth = computeReadDepth(events)

  // Headlines + caveats.
  const headlines: string[] = []
  if (morningOpenRate !== null) {
    headlines.push(`Morning brief opened on ${pct(morningOpenRate)} of sent days (n=${morning.length}).`)
  }
  if (intradayOpenRate !== null) {
    headlines.push(`Intraday critical opened on ${pct(intradayOpenRate)} of sends (n=${intraday.length}).`)
  }
  if (heldNameCriticalAlertOpenRate !== null) {
    headlines.push(`${pct(heldNameCriticalAlertOpenRate)} of held-name critical alerts were opened (n=${heldCritical.length}).`)
  }
  if (heldNameReviewedBeforeCatalystRate !== null && upcomingHeldCatalysts.length > 0) {
    headlines.push(`${pct(heldNameReviewedBeforeCatalystRate)} of upcoming catalysts on the book were preceded by a report/brief open on that ticker (n=${upcomingHeldCatalysts.length}).`)
  }
  if (medianTimeToFirstImportantOpenSeconds !== null) {
    headlines.push(`Median time from morning brief delivery → first important open: ${formatDuration(medianTimeToFirstImportantOpenSeconds)}.`)
  }
  if (avgOpensPerActiveDay > 0) {
    headlines.push(`Average ${avgOpensPerActiveDay} opens per active day across ${activeDays} day(s).`)
  }

  const caveats: string[] = []
  if (sent.length < 5) caveats.push(`Only ${sent.length} deliveries in window — open-rate metrics are directional.`)
  if (events.length < 50) caveats.push('Low total event volume; treat differences as directional rather than statistical.')
  if (reviewsInWindow.length === 0) caveats.push('No post-event reviews generated in this window.')
  if (heldCritical.length === 0) caveats.push('No held-name critical alerts in window.')

  return {
    orgId: input.orgId,
    generatedAt: windowEnd.toISOString(),
    windowDays: input.windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    metrics: {
      morningBriefOpenRate: morningOpenRate,
      intradayCriticalOpenRate: intradayOpenRate,
      clickThroughRate: ctr,
      avgOpensPerActiveDay,
      medianTimeToFirstImportantOpenSeconds,
      heldNameCriticalAlertOpenRate,
      heldNameReviewedBeforeCatalystRate,
      postEventReviewUsageRate,
    },
    channelEngagement,
    readDepth,
    headlines,
    caveats,
  }
}

function computeReadDepth(events: readonly UsageEvent[]): readonly ReadDepthSummary[] {
  const sources: ReadDepthSummary['source'][] = ['inbox', 'briefing', 'worklog', 'mybook', 'catalysts']
  return sources.map((source) => {
    const bySession = new Map<string, number>()
    for (const e of events) {
      if (e.eventType.startsWith('open_') && e.fromSurface === source) {
        const k = e.sessionId as unknown as string
        bySession.set(k, (bySession.get(k) ?? 0) + 1)
      }
    }
    const counts = [...bySession.values()].sort((a, b) => a - b)
    if (counts.length === 0) return { source, sessionsWithOpens: 0, medianOpensPerSession: 0, p90OpensPerSession: 0 }
    const p90idx = Math.min(counts.length - 1, Math.floor(counts.length * 0.9))
    return {
      source,
      sessionsWithOpens: counts.length,
      medianOpensPerSession: counts[Math.floor(counts.length / 2)]!,
      p90OpensPerSession: counts[p90idx]!,
    }
  })
}

function median(arr: readonly number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

/** Repo-backed convenience. */
export function buildPilotRoiSnapshot(args: ComputeArgs): Roi {
  const now = args.now ?? new Date()
  const windowMs = args.windowDays * 86400 * 1000
  const events = args.repo.listUsageEvents(args.orgId, { sinceMs: windowMs, limit: 5000 })
  const attempts = args.repo.listDeliveryAttempts(args.orgId, { limit: 1000 })
  // The repo is the canonical store for canonical entities too — just
  // pull alerts/catalysts/post-event reviews directly.
  const alerts = args.repo.listAlertEvents(args.orgId, { limit: 500 })
  const catalysts = args.repo.listCatalysts(args.orgId)
  const postEventReviews = args.repo.listPostEventReviews(args.orgId)
  return computePilotRoi({
    orgId: args.orgId, windowDays: args.windowDays, now,
    events, attempts, alerts, catalysts, postEventReviews,
  })
}
