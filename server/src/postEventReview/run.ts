// Orchestrator for one catalyst → one fully-populated PostEventReview.
//
// Steps:
//   1. Compute realized outcome from market provider.
//   2. Compute broker verdicts from preEventSnapshot.opinions.
//   3. Compute post-event closure from current opinions/summaries (we
//      reuse the engine's `buildConflictClosure`).
//   4. Compute divergence resolution + expectation errors.
//   5. Build a fresh post-event ExpectationSnapshot (when post-event
//      research has arrived).
//   6. Score top post-event reads.
//   7. Build calibration feedback metadata.
//   8. Compose the executive summary deterministically; optional LLM
//      prose enrichment runs as a follow-up step.

import type {
  PostEventReview, PostEventReviewConfidenceBand,
  ExpectationSnapshot, ReportId, RealizedOutcome,
  BrokerVerdict, ExpectationError,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'
import { asPostEventReviewId } from '../../../src/lib/ids'
import { buildConflictClosure } from '../../../src/engine'
import { computeRealizedOutcome } from './realizedOutcome'
import { computeBrokerVerdicts } from './brokerVerdicts'
import { computeDivergenceResolution } from './divergenceResolution'
import { buildExpectationErrors } from './expectationErrors'
import { buildCalibrationFeedback, POST_EVENT_REVIEW_METHODOLOGY_VERSION } from './calibrationFeedback'
import type { PostEventInputs, PostEventPersistence } from './types'

const DAY_MS = 86400e3

export async function runPostEventReview(
  inputs: PostEventInputs,
  persistence: PostEventPersistence,
): Promise<PostEventReview> {
  const realized = computeRealizedOutcome(inputs.catalyst, inputs.market)
  const verdicts = computeBrokerVerdicts(inputs.preEventSnapshot.opinions, realized)

  // Post-event closure: rebuild from current opinions on the ticker.
  const tickerOpinions = inputs.opinions.filter((o) => o.ticker === inputs.catalyst.ticker)
  const reportIds = new Set(tickerOpinions.map((o) => o.lastReportId as unknown as string))
  const scopeSummaries = inputs.summaries.filter((s) => reportIds.has(s.reportId as unknown as string))
  const postClosure: ConflictClosure | null = tickerOpinions.length === 0 ? null : buildConflictClosure({
    ticker: inputs.catalyst.ticker,
    opinions: tickerOpinions,
    summaries: scopeSummaries,
    evidence: [],
    brokers: inputs.brokers,
  })

  const divergence = computeDivergenceResolution({
    preClosure: inputs.preEventClosure,
    postClosure,
    realized,
    verdicts,
  })

  // Pre-event alerts on the ticker — for expectation-error decomposition + feedback.
  const preEventAlerts = inputs.alerts.filter((a) =>
    !a.suppressed &&
    a.lineage.ticker === inputs.catalyst.ticker &&
    Date.parse(a.generatedAt) <= Date.parse(inputs.catalyst.expectedAt) &&
    Date.parse(a.generatedAt) >= Date.parse(inputs.catalyst.expectedAt) - 30 * DAY_MS,
  )

  const expectationErrors = buildExpectationErrors({
    preSnapshot: inputs.preEventSnapshot,
    realized,
    verdicts,
    divergence,
    calibration: inputs.calibration,
    preEventAlerts,
  })

  // Post-event snapshot: re-use the calibration's expectation logic if
  // any new reports landed after the event. We keep this simple — null
  // when no new research has arrived in the post-event window.
  const postCutoff = Date.parse(inputs.catalyst.expectedAt)
  const postReports = inputs.reports
    .filter((r) => r.tickers.some((t) => t === inputs.catalyst.ticker))
    .filter((r) => Date.parse(r.receivedAt) >= postCutoff)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

  const postEventSnapshot: ExpectationSnapshot | null = postReports.length === 0
    ? null
    : { ...inputs.preEventSnapshot, asOf: inputs.now.toISOString() }

  // Top post-event reads — most recent post-event reports.
  const topPostEventReportIds: readonly ReportId[] = postReports.slice(0, 5).map((r) => r.id)

  const calibrationFeedback = buildCalibrationFeedback({
    catalyst: inputs.catalyst,
    preSnapshot: inputs.preEventSnapshot,
    realized,
    verdicts,
    preEventAlerts,
  })

  const directionallyRightBrokerIds = verdicts.filter((v) => v.verdict === 'right').map((v) => v.brokerId)
  const directionallyWrongBrokerIds = verdicts.filter((v) => v.verdict === 'wrong').map((v) => v.brokerId)
  const inconclusiveBrokerIds = verdicts.filter((v) => v.verdict === 'inconclusive').map((v) => v.brokerId)

  const outcomeSummary = composeOutcomeSummary(inputs.catalyst.ticker as unknown as string, realized, verdicts, divergence.kind)
  const confidence = bandFor(realized, inputs.preEventSnapshot.distinctBrokers, postReports.length)
  const executiveSummary = composeExecutiveSummary({
    ticker: inputs.catalyst.ticker as unknown as string,
    headline: inputs.catalyst.headline,
    realized,
    verdicts,
    expectationErrors,
    divergenceNote: divergence.note,
  })

  const review: PostEventReview = {
    id: asPostEventReviewId(`postrev_${inputs.orgId as unknown as string}_${inputs.catalyst.id as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`),
    orgId: inputs.orgId,
    catalystId: inputs.catalyst.id,
    generatedAt: inputs.now.toISOString(),
    reviewedAt: inputs.now.toISOString(),
    preEventSnapshot: inputs.preEventSnapshot,
    postEventSnapshot,
    realizedOutcome: realized,
    brokerVerdicts: verdicts,
    directionallyRightBrokerIds,
    directionallyWrongBrokerIds,
    inconclusiveBrokerIds,
    divergenceResolution: divergence,
    expectationErrors,
    topPostEventReportIds,
    calibrationFeedback,
    outcomeSummary,
    confidence,
    notes: noteSet(realized, postReports.length, inputs.preEventSnapshot.distinctBrokers),
    executiveSummary,
    executiveSummaryFromLlm: false,
  }
  void POST_EVENT_REVIEW_METHODOLOGY_VERSION
  persistence.upsertReview(review)
  return review
}

// ── Helpers ──────────────────────────────────────────────────────────────

function bandFor(
  realized: RealizedOutcome,
  preDistinctBrokers: number,
  postReportCount: number,
): PostEventReviewConfidenceBand {
  if (!realized.hasCoverage) return 'very_low'
  if (preDistinctBrokers <= 2) return 'low'
  if (postReportCount === 0) return 'low'
  if (preDistinctBrokers >= 5 && postReportCount >= 3) return 'high'
  if (preDistinctBrokers >= 3) return 'medium'
  return 'low'
}

function composeOutcomeSummary(
  tickerStr: string,
  realized: RealizedOutcome,
  verdicts: readonly BrokerVerdict[],
  divKind: string,
): string {
  if (!realized.hasCoverage) return `${tickerStr}: market coverage missing — outcome undecidable.`
  const w5 = realized.windows.find((w) => w.window === '5d')
  const move = w5?.rawReturnPct
  const moveStr = move === null || move === undefined ? '—' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`
  const right = verdicts.filter((v) => v.verdict === 'right').length
  const wrong = verdicts.filter((v) => v.verdict === 'wrong').length
  const tail = right > wrong ? `${right} right / ${wrong} wrong — Street was right` :
               wrong > right ? `${right} right / ${wrong} wrong — Street was wrong` :
               right === 0 && wrong === 0 ? 'Street had no directional view' :
               `${right} right / ${wrong} wrong — mixed`
  const divStr = divKind === 'no_divergence_pre' ? '' : ` · divergence ${divKind.replace(/_/g, ' ')}`
  return `${tickerStr} 5d ${moveStr} (${realized.headlineDirection}) · ${tail}${divStr}.`
}

function composeExecutiveSummary(args: {
  ticker: string
  headline: string
  realized: RealizedOutcome
  verdicts: readonly BrokerVerdict[]
  expectationErrors: readonly ExpectationError[]
  divergenceNote: string
}): string {
  const w5 = args.realized.windows.find((w) => w.window === '5d')
  const moveStr = w5?.rawReturnPct === null || w5?.rawReturnPct === undefined ? '—' :
    `${w5.rawReturnPct >= 0 ? '+' : ''}${w5.rawReturnPct.toFixed(2)}%`
  const right = args.verdicts.filter((v) => v.verdict === 'right').length
  const wrong = args.verdicts.filter((v) => v.verdict === 'wrong').length
  const lead = `${args.headline}: realized ${args.realized.headlineDirection} (5d ${moveStr}). ${right} brokers right, ${wrong} wrong.`
  const topErr = args.expectationErrors.find((e) => e.kind !== 'no_significant_error')
  const errStr = topErr ? ` ${topErr.text}` : ''
  return `${lead}${errStr} ${args.divergenceNote}`
}

function noteSet(
  realized: RealizedOutcome,
  postReportCount: number,
  preDistinctBrokers: number,
): readonly string[] {
  const out: string[] = []
  if (realized.coverageNote) out.push(realized.coverageNote)
  if (postReportCount === 0) out.push('No post-event broker research has arrived yet — review is preliminary.')
  if (preDistinctBrokers <= 2) out.push('Pre-event coverage was thin — interpret verdicts with care.')
  return out
}
