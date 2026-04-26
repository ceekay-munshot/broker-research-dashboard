import type {
  AlertDigest, AlertEvent, CalibrationSnapshot, PostEventReview,
} from '../../domain'
import type {
  AlertCardViewModel, BriefingSectionViewModel, BriefingViewModel,
} from './types'
import { buildAlertsFeedViewModel } from './feedBuilder'

export interface BriefingInputs {
  readonly digest: AlertDigest | null
  readonly alerts: readonly AlertEvent[]
  readonly degradations?: readonly string[]
  /** Module 23 — calibration snapshot drives adaptive-ranking adjustments. */
  readonly calibration?: CalibrationSnapshot | null
  /** Module 23 — post-event reviews feed catalyst-type and broker-event sources. */
  readonly postEventReviews?: readonly PostEventReview[] | null
}

export function buildBriefingViewModel(inputs: BriefingInputs): BriefingViewModel {
  // Reuse the feed builder so the briefing inherits the same annotated +
  // ranked cards. Section-level items remain in digest order — but each
  // card carries its calibration adjustment + rank delta.
  const feed = buildAlertsFeedViewModel({
    alerts: inputs.alerts,
    calibration: inputs.calibration ?? null,
    postEventReviews: inputs.postEventReviews ?? null,
  })
  const counts = feed.counts

  if (!inputs.digest) {
    return {
      hasDigest: false,
      digest: null,
      executiveSummary: null,
      executiveSummaryFromLlm: false,
      sections: [],
      counts,
      degradations: inputs.degradations ?? [],
    }
  }

  const alertById = new Map<string, AlertCardViewModel>()
  for (const g of feed.groups) {
    for (const c of g.items) alertById.set(c.id as unknown as string, c)
  }

  const sections: BriefingSectionViewModel[] = inputs.digest.sections.map((s) => ({
    key: s.key,
    title: s.title,
    subtitle: s.subtitle,
    prose: s.prose,
    proseFromLlm: s.proseFromLlm,
    items: s.alertIds
      .map((id) => alertById.get(id as unknown as string))
      .filter((c): c is AlertCardViewModel => !!c),
    emptyText: 'No items in this section.',
  }))

  return {
    hasDigest: true,
    digest: inputs.digest,
    executiveSummary: inputs.digest.executiveSummary,
    executiveSummaryFromLlm: inputs.digest.executiveSummaryFromLlm,
    sections,
    counts,
    degradations: inputs.degradations ?? [],
  }
}
