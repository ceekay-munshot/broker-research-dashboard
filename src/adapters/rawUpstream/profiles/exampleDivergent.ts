// ─────────────────────────────────────────────────────────────────────────
// Demonstration profile for a hypothetical upstream that:
//   - wraps every response in `{ data: … }`
//   - uses snake_case keys everywhere
//   - names its primary key `organization_id` on the org payload
//   - returns research reports as `{ data: { results: [...], next, count } }`
//     instead of the canonical `{ items, nextCursor, totalCount }`
//   - returns conflict closures as bare arrays
//   - returns numeric target prices as strings
//
// This file is the template the real upstream team should start from
// when writing their own profile if their wire format diverges from
// `/v1`. The rules declared here are *additive on top of* the identity
// default — endpoints not listed below pass through unchanged.
// ─────────────────────────────────────────────────────────────────────────

import type { UpstreamNormalizationProfile } from '../types'
import {
  camelCaseKeys, coerceNumericFields, compose, identity,
  mapArray, mapPageItems, rename, unwrapEnvelope, wrapAsPage,
} from '../transforms'

export const exampleDivergentProfile: UpstreamNormalizationProfile = {
  name: 'example-divergent',
  description: 'Hypothetical vendor: envelope + snake_case + alt IDs + partial pagination.',

  defaultNormalizer: compose(unwrapEnvelope(), camelCaseKeys()),

  endpoints: {
    // Scalar endpoints — default pipeline is enough.
    sessionScope: compose(unwrapEnvelope(), camelCaseKeys()),
    organization: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'id' }),
    ),
    currentUser: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ userId: 'id', organizationId: 'orgId' }),
    ),

    // Flat-list endpoints.
    brokers: compose(unwrapEnvelope(), camelCaseKeys(), identity),
    sectors: compose(unwrapEnvelope(), camelCaseKeys()),
    stocks:  compose(unwrapEnvelope(), camelCaseKeys()),

    // Paginated: upstream returns `{ data: { results, next, count } }`.
    brokerEmails: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      wrapAsPage({ itemsAt: 'results', cursorFrom: 'next', totalFrom: 'count' }),
      mapPageItems(rename({ organizationId: 'orgId' })),
    ),
    researchReports: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      wrapAsPage({ itemsAt: 'results', cursorFrom: 'next', totalFrom: 'count' }),
      mapPageItems(rename({ organizationId: 'orgId' })),
    ),

    // Per-report detail.
    reportSummary: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'orgId' }),
      coerceNumericFields(['targetPrice', 'priorTargetPrice', 'confidence']),
    ),
    reportEvidence: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      mapArray(rename({ organizationId: 'orgId' })),
    ),

    // Derived: bare array + numeric-string target.
    opinions: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      mapArray(compose(
        rename({ organizationId: 'orgId' }),
        coerceNumericFields(['targetPrice', 'priorTargetPrice', 'impliedUpsidePct']),
      )),
    ),
    conflictClosures: compose(unwrapEnvelope(), camelCaseKeys()),
    conflictClosure:  compose(unwrapEnvelope(), camelCaseKeys()),
    sectorIntelligence: compose(unwrapEnvelope(), camelCaseKeys()),
    sectorIntelligenceFor: compose(unwrapEnvelope(), camelCaseKeys()),

    // Dashboard / ops.
    kpiSnapshot: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'orgId' }),
    ),
    ingestionStatus: compose(
      unwrapEnvelope(),
      camelCaseKeys(),
      rename({ organizationId: 'orgId' }),
      coerceNumericFields(['throughputPerHour']),
    ),
  },
}
