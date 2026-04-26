// Detect how Street divergence resolved (or didn't) after the event.
//
// Inputs:
//   - pre-event closure for the ticker (from the run that produced the
//     pre-event snapshot)
//   - post-event closure (computed fresh from current state)
//   - realized outcome (drives outlier-vindicated / -invalidated)
//
// We classify into one of:
//   resolved                — divergence pre, none post
//   persisted               — divergence pre AND post
//   widened                 — divergence pre, more dispersed post
//   outlier_vindicated      — outliers pre were directionally right
//   outlier_invalidated     — outliers pre were directionally wrong
//   no_divergence_pre       — clean baseline; reported but uninteresting

import type {
  BrokerId, BrokerVerdict,
  DivergenceResolution, RealizedOutcome,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

export function computeDivergenceResolution(args: {
  readonly preClosure: ConflictClosure | null
  readonly postClosure: ConflictClosure | null
  readonly realized: RealizedOutcome
  readonly verdicts: readonly BrokerVerdict[]
}): DivergenceResolution {
  const preState = args.preClosure?.resultant.state ?? null
  const postState = args.postClosure?.resultant.state ?? null

  const preDivergent = isDivergent(args.preClosure)
  const postDivergent = isDivergent(args.postClosure)

  const preOutlierIds: readonly BrokerId[] =
    args.preClosure?.outliers.map((o) => o.brokerId) ?? []

  // Outlier vindication / invalidation checks.
  const outlierVerdicts = preOutlierIds.map((id) =>
    args.verdicts.find((v) => v.brokerId === id),
  ).filter((v): v is BrokerVerdict => !!v)

  const vindicated = outlierVerdicts.filter((v) => v.verdict === 'right').map((v) => v.brokerId)
  const invalidated = outlierVerdicts.filter((v) => v.verdict === 'wrong').map((v) => v.brokerId)

  // Decide kind. Outlier vindication / invalidation takes precedence
  // when applicable, since it's the most product-relevant signal.
  let kind: DivergenceResolution['kind']
  let note: string

  if (preOutlierIds.length > 0 && vindicated.length > 0 && invalidated.length === 0) {
    kind = 'outlier_vindicated'
    note = `${vindicated.length} pre-event outlier${vindicated.length === 1 ? ' was' : 's were'} directionally right.`
  } else if (preOutlierIds.length > 0 && invalidated.length > 0 && vindicated.length === 0) {
    kind = 'outlier_invalidated'
    note = `${invalidated.length} pre-event outlier${invalidated.length === 1 ? ' was' : 's were'} directionally wrong.`
  } else if (!preDivergent) {
    kind = 'no_divergence_pre'
    note = 'Street had no material divergence going into the event.'
  } else if (preDivergent && !postDivergent) {
    kind = 'resolved'
    note = `Divergence resolved — pre ${preState ?? '?'} → post ${postState ?? 'consensus'}.`
  } else if (preDivergent && postDivergent && preState !== postState) {
    kind = 'widened'
    note = `Divergence widened — pre ${preState ?? '?'} → post ${postState ?? '?'}.`
  } else if (preDivergent && postDivergent) {
    kind = 'persisted'
    note = `Divergence persisted in state ${preState ?? '?'}.`
  } else {
    // Fallback for the (preDivergent=false, postDivergent=true) case —
    // treat it as widened since net dispersion increased.
    kind = 'widened'
    note = `Divergence emerged after the event — pre ${preState ?? 'consensus'} → post ${postState ?? '?'}.`
  }

  return {
    kind,
    preClosureState: preState,
    postClosureState: postState,
    preOutlierBrokerIds: preOutlierIds,
    vindicatedOutlierBrokerIds: vindicated,
    invalidatedOutlierBrokerIds: invalidated,
    note,
  }
}

function isDivergent(c: ConflictClosure | null): boolean {
  if (!c) return false
  const s = c.resultant.state
  return s === 'mixed_constructive' || s === 'mixed_cautious' ||
         s === 'unresolved' || s === 'outlier_driven' ||
         c.disagreements.length > 0
}
