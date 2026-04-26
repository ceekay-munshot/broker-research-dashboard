import type {
  AlertDigest, AlertEvent,
} from '../../domain'
import type {
  AlertCardViewModel, BriefingSectionViewModel, BriefingViewModel,
} from './types'
import { alertToCard, buildAlertsFeedViewModel } from './feedBuilder'

export interface BriefingInputs {
  readonly digest: AlertDigest | null
  readonly alerts: readonly AlertEvent[]
  readonly degradations?: readonly string[]
}

export function buildBriefingViewModel(inputs: BriefingInputs): BriefingViewModel {
  const counts = buildAlertsFeedViewModel({ alerts: inputs.alerts }).counts

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
  for (const a of inputs.alerts) alertById.set(a.id as unknown as string, alertToCard(a))

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
