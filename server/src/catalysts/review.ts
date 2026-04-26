// Catalyst-engine post-event review stub (Module 21).
//
// Module 22 owns the full review pipeline (server/src/postEventReview/),
// but the catalyst engine still emits a *minimal* placeholder so a
// reviewable catalyst always has *some* persisted record from the
// catalyst run, even if the post-event-review bootstrap hasn't run
// yet. The Module 22 bootstrap upserts a richer review on top.

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
  const note = 'Catalyst-engine stub — full review will land when the post-event-review bootstrap runs.'
  return {
    id: asPostEventReviewId(`postrev_stub_${inputs.orgId as unknown as string}_${inputs.catalyst.id as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`),
    orgId: inputs.orgId,
    catalystId: inputs.catalyst.id,
    generatedAt: inputs.now.toISOString(),
    reviewedAt: inputs.now.toISOString(),
    preEventSnapshot: inputs.preEventSnapshot,
    postEventSnapshot: null,
    realizedOutcome: {
      ticker: inputs.catalyst.ticker,
      anchorDate: inputs.catalyst.expectedDate,
      anchorPrice: null,
      anchorCurrency: null,
      windows: [
        { window: '1d',  rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' },
        { window: '3d',  rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' },
        { window: '5d',  rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' },
        { window: '10d', rawReturnPct: null, benchmarkRelReturnPct: null, direction: 'unknown' },
      ],
      headlineDirection: 'unknown',
      hasCoverage: false,
      coverageNote: 'Awaiting post-event-review bootstrap (Module 22).',
    },
    brokerVerdicts: [],
    directionallyRightBrokerIds: [],
    directionallyWrongBrokerIds: [],
    inconclusiveBrokerIds: [],
    divergenceResolution: {
      kind: 'no_divergence_pre',
      preClosureState: null,
      postClosureState: null,
      preOutlierBrokerIds: [],
      vindicatedOutlierBrokerIds: [],
      invalidatedOutlierBrokerIds: [],
      note,
    },
    expectationErrors: [
      { kind: 'no_significant_error', text: note, magnitude: 0 },
    ],
    topPostEventReportIds: [],
    calibrationFeedback: {
      brokerCorrectness: [],
      catalystTypePerformance: {
        type: inputs.catalyst.type,
        directionallyRight: 0,
        directionallyWrong: 0,
        inconclusive: 0,
      },
      preEventAlertUsefulness: [],
      eventDriven: false,
      methodologyVersion: 'v1.0',
    },
    outcomeSummary: `${inputs.catalyst.ticker as unknown as string}: stub review pending market-data resolution.`,
    confidence: 'very_low',
    notes: [note],
    executiveSummary: null,
    executiveSummaryFromLlm: false,
  }
}
