import type { AlertId, PreEventBrief, ReportId } from '../../domain'
import type { PreEventBriefViewModel } from './types'

export function buildPreEventBriefViewModel(brief: PreEventBrief | null): PreEventBriefViewModel {
  if (!brief) {
    return {
      hasBrief: false,
      brief: null,
      snapshotHeader: null,
      degradations: ['No pre-event brief available — this catalyst may be more than 30d out, off-book, or yet to be generated.'],
      topReadReportIds: [],
      referencedAlertIds: [],
    }
  }
  const topReads = brief.sections.find((s) => s.key === 'top_reads')
  const allAlerts = brief.sections.flatMap((s) => s.alertIds)
  const dedupedAlerts = Array.from(new Set(allAlerts.map((a) => a as unknown as string))).map((a) => a as unknown as AlertId)
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
    topReadReportIds: topReads?.reportIds.slice(0, 5).map((r) => r as unknown as ReportId) ?? [],
    referencedAlertIds: dedupedAlerts,
  }
}
