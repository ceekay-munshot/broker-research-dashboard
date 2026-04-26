import type {
  AlertId, Broker, BrokerId, CalibrationSnapshot, CatalystEvent,
  CatalystType, PostEventReview, PreEventBrief, ReportId, ResearchReport,
} from '../../domain'
import type {
  AdaptiveAnnotation,
} from '../adaptiveRanking'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../../engine'
import type { PreEventBriefViewModel, PreEventTopReadViewModel } from './types'

/** Optional inputs that activate Module-23 adaptive ranking on top reads. */
export interface PreEventBriefBuilderExtras {
  readonly reports?: readonly ResearchReport[]
  readonly brokers?: readonly Broker[]
  readonly catalyst?: CatalystEvent | null
  readonly calibration?: CalibrationSnapshot | null
  readonly postEventReviews?: readonly PostEventReview[] | null
}

export function buildPreEventBriefViewModel(
  brief: PreEventBrief | null,
  extras: PreEventBriefBuilderExtras = {},
): PreEventBriefViewModel {
  if (!brief) {
    return {
      hasBrief: false,
      brief: null,
      snapshotHeader: null,
      degradations: ['No pre-event brief available — this catalyst may be more than 30d out, off-book, or yet to be generated.'],
      topReadReportIds: [],
      topReads: [],
      referencedAlertIds: [],
    }
  }

  const topReadsSection = brief.sections.find((s) => s.key === 'top_reads')
  const rawTopReadIds = (topReadsSection?.reportIds ?? []) as readonly ReportId[]
  const allAlerts = brief.sections.flatMap((s) => s.alertIds)
  const dedupedAlerts = Array.from(new Set(allAlerts.map((a) => a as unknown as string)))
    .map((a) => a as unknown as AlertId)

  // ── Module 23 — annotate top reads with calibration-aware adjustments.
  const flags = adaptiveRankingFlags()
  const reports = extras.reports ?? []
  const brokers = extras.brokers ?? []
  const calibration = extras.calibration ?? null
  const postEventReviews = extras.postEventReviews ?? null
  const catalystType: CatalystType | null = extras.catalyst?.type ?? null

  const reportById = new Map<string, ResearchReport>()
  for (const r of reports) reportById.set(r.id as unknown as string, r)
  const brokerById = new Map<string, Broker>()
  for (const b of brokers) brokerById.set(b.id as unknown as string, b)

  // Top-read priority baseline = 100 - rank in the brief's published order
  // (so the first top-read starts at 100, the second at 95, etc). The
  // adaptive engine then nudges by broker calibration + catalyst-type
  // performance + event-driven broker correctness.
  const baselineByReport = new Map<string, number>()
  rawTopReadIds.forEach((rid, i) => {
    baselineByReport.set(rid as unknown as string, Math.max(0, 100 - i * 5))
  })

  const annotated: PreEventTopReadViewModel[] = rawTopReadIds.map((rid) => {
    const r = reportById.get(rid as unknown as string) ?? null
    const brokerId: BrokerId | null = r?.brokerId ?? null
    const broker = brokerId ? brokerById.get(brokerId as unknown as string) ?? null : null
    const baselineScore = baselineByReport.get(rid as unknown as string) ?? 0
    let adaptive: AdaptiveAnnotation | null = null
    if (calibration) {
      const adjustment = computeRankAdjustment({
        baselineScore,
        brokerId,
        alertKind: null,
        catalystType,
        calibration,
        postEventReviews,
      })
      adaptive = {
        adjustment,
        rankDelta: 0,
        moved: adjustment.delta !== 0,
      }
    }
    return {
      reportId: rid,
      brokerId,
      brokerShortName: broker?.shortName ?? null,
      title: r?.title ?? null,
      adaptive,
    }
  })

  const baselineSorted = [...annotated]
  // baseline is the brief-published order (already sorted upstream).

  const adaptiveSorted = [...annotated].sort((a, b) => {
    const aScore = a.adaptive ? a.adaptive.adjustment.adjustedScore
                              : baselineByReport.get(a.reportId as unknown as string) ?? 0
    const bScore = b.adaptive ? b.adaptive.adjustment.adjustedScore
                              : baselineByReport.get(b.reportId as unknown as string) ?? 0
    return bScore - aScore
  })
  const baseIdx = new Map<string, number>()
  baselineSorted.forEach((it, i) => baseIdx.set(it.reportId as unknown as string, i))
  const adaptIdx = new Map<string, number>()
  adaptiveSorted.forEach((it, i) => adaptIdx.set(it.reportId as unknown as string, i))
  const stamped = (flags.enabled ? adaptiveSorted : baselineSorted).map((it) => {
    if (!it.adaptive) return it
    const k = it.reportId as unknown as string
    const rankDelta = (baseIdx.get(k) ?? 0) - (adaptIdx.get(k) ?? 0)
    return {
      ...it,
      adaptive: {
        ...it.adaptive,
        rankDelta,
        moved: it.adaptive.adjustment.delta !== 0 || rankDelta !== 0,
      },
    }
  })

  return {
    hasBrief: true,
    brief,
    snapshotHeader: {
      tilt: brief.snapshot.tiltSummary,
      distinctBrokers: brief.snapshot.distinctBrokers,
      avgTargetPrice: brief.snapshot.avgTargetPrice,
      avgImpliedUpsidePct: brief.snapshot.avgImpliedUpsidePct,
      hasDivergence: brief.snapshot.hasDivergence,
    },
    degradations: [],
    topReadReportIds: stamped.slice(0, 5).map((it) => it.reportId),
    topReads: stamped.slice(0, 5),
    referencedAlertIds: dedupedAlerts,
  }
}
