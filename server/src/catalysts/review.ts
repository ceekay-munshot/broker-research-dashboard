// Post-event review scaffold (Module 21).
//
// Light first version: hold the seam (`PostEventReview`) and a stub
// builder that produces a non-comparative review when called against a
// just-completed catalyst. Future modules will:
//   - take a post-event snapshot once new research arrives
//   - score brokers against the realized direction (price move)
//   - mark divergence as resolved / lingering
//
// For now we surface only the structural fields so the persistence /
// /v1 / UI seams are wired and stable across replays.

import type {
  CatalystEvent, ExpectationSnapshot, OrgId, PostEventReview,
} from '../../../src/domain'
import { asPostEventReviewId } from '../../../src/lib/ids'

export interface BuildReviewStubInputs {
  readonly orgId: OrgId
  readonly catalyst: CatalystEvent
  readonly preEventSnapshot: ExpectationSnapshot
  readonly now: Date
}

export function buildPostEventReviewStub(inputs: BuildReviewStubInputs): PostEventReview {
  return {
    id: asPostEventReviewId(`postrev_${inputs.orgId as unknown as string}_${inputs.catalyst.id as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`),
    orgId: inputs.orgId,
    catalystId: inputs.catalyst.id,
    generatedAt: inputs.now.toISOString(),
    preEventSnapshot: inputs.preEventSnapshot,
    postEventSnapshot: null,
    directionallyRightBrokerIds: [],
    directionallyWrongBrokerIds: [],
    divergenceResolved: false,
    notes: ['Post-event review scaffold — fill in when post-event snapshot is available.'],
  }
}
