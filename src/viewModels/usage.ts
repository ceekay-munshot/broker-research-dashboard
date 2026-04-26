// ─────────────────────────────────────────────────────────────────────────
// Pilot Analytics view-model — pure transforms over `OrgUsageSnapshot`
// + `PilotRoiSnapshot`. The Usage tab consumes this.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgUsageSnapshot, PilotRoiSnapshot, SourceHealthStatus,
  UsageSurface, ContentEngagement, DeliveryEngagement,
  RankingExperimentSummary, ChannelEngagementSummary, ReadDepthSummary,
} from '../domain'

export interface UsageTabViewModel {
  readonly hasData: boolean
  readonly windowDays: number
  readonly generatedAt: string | null
  readonly headline: {
    readonly events: number
    readonly sessions: number
    readonly distinctUsers: number
    readonly opens: number
    readonly dau: number
    readonly wau: number
  }
  readonly surfaces: readonly { readonly surface: UsageSurface; readonly views: number; readonly opensFromSurface: number; readonly distinctUsers: number; readonly toneClass: string }[]
  readonly contentEngagement: readonly ContentEngagement[]
  readonly deliveryEngagement: readonly DeliveryEngagement[]
  readonly rankingExperiment: RankingExperimentSummary
  readonly sourceHealthMix: Readonly<Record<SourceHealthStatus, number>>
  readonly degradedShare: number
}

export interface RoiTabViewModel {
  readonly hasData: boolean
  readonly windowDays: number
  readonly generatedAt: string | null
  readonly metrics: PilotRoiSnapshot['metrics'] | null
  readonly channelEngagement: readonly ChannelEngagementSummary[]
  readonly readDepth: readonly ReadDepthSummary[]
  readonly headlines: readonly string[]
  readonly caveats: readonly string[]
}

export function buildUsageTabViewModel(snap: OrgUsageSnapshot | null): UsageTabViewModel {
  if (!snap) {
    return {
      hasData: false, windowDays: 0, generatedAt: null,
      headline: { events: 0, sessions: 0, distinctUsers: 0, opens: 0, dau: 0, wau: 0 },
      surfaces: [], contentEngagement: [], deliveryEngagement: [],
      rankingExperiment: {
        mode: 'insufficient_signal',
        baselineOpens: 0, adaptiveOpens: 0, compareModeOpens: 0,
        top5Opens: { baseline: 0, adaptive: 0 },
        top10Opens: { baseline: 0, adaptive: 0 },
        medianTimeToFirstOpenSeconds: { baseline: null, adaptive: null },
        note: 'No usage events yet.',
      },
      sourceHealthMix: { healthy: 0, stale: 0, degraded: 0, failing: 0, unknown: 0 },
      degradedShare: 0,
    }
  }
  const sortedSurfaces = [...snap.surfaces]
    .map((s) => ({
      surface: s.surface,
      views: s.views,
      opensFromSurface: s.opensFromSurface,
      distinctUsers: s.distinctUsers,
      toneClass: s.views === 0 ? 'text-slate-500' : s.views > 5 ? 'text-emerald-300' : 'text-slate-200',
    }))
    .sort((a, b) => (b.views + b.opensFromSurface) - (a.views + a.opensFromSurface))
  const totalEvents = Math.max(snap.totals.events, 1)
  const degradedShare = (snap.sourceHealthMix.stale + snap.sourceHealthMix.failing + snap.sourceHealthMix.degraded) / totalEvents
  return {
    hasData: snap.totals.events > 0,
    windowDays: snap.windowDays,
    generatedAt: snap.generatedAt,
    headline: {
      events: snap.totals.events,
      sessions: snap.totals.sessions,
      distinctUsers: snap.totals.distinctUsers,
      opens: snap.totals.opens,
      dau: snap.dau,
      wau: snap.wau,
    },
    surfaces: sortedSurfaces,
    contentEngagement: [...snap.contentEngagement].sort((a, b) => b.opens - a.opens),
    deliveryEngagement: [...snap.deliveryEngagement].sort((a, b) => b.delivered - a.delivered),
    rankingExperiment: snap.rankingExperiment,
    sourceHealthMix: snap.sourceHealthMix,
    degradedShare: Math.round(degradedShare * 100) / 100,
  }
}

export function buildRoiTabViewModel(snap: PilotRoiSnapshot | null): RoiTabViewModel {
  if (!snap) {
    return {
      hasData: false, windowDays: 0, generatedAt: null,
      metrics: null, channelEngagement: [], readDepth: [], headlines: [], caveats: [],
    }
  }
  return {
    hasData: true,
    windowDays: snap.windowDays,
    generatedAt: snap.generatedAt,
    metrics: snap.metrics,
    channelEngagement: snap.channelEngagement,
    readDepth: snap.readDepth,
    headlines: snap.headlines,
    caveats: snap.caveats,
  }
}

export function formatPercent(x: number | null): string {
  if (x === null) return '—'
  return `${Math.round(x * 100)}%`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}
