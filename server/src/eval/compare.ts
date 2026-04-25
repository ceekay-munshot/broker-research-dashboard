// Pure compare function: actual materialized output vs expected gold.
//
// Produces a list of `FieldComparison` outcomes keyed by field name.
// Used both by the eval runner (gold-set scoring) and by the replay
// diff tool (before-vs-after snapshot comparison).

import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  ResearchReport, ReportSummary,
} from '../../../src/domain'
import type { MaterializationQuality } from '../pipeline/quality'
import type { PipelineErrorCategory } from '../pipeline/errors'
import type { ExpectedOutputs, ExpectedReport, FieldComparison } from './types'

export interface MaterializedRunOutputs {
  readonly outcome: 'materialized_ready' | 'failed' | 'review_needed'
  readonly email: BrokerEmail | null
  readonly attachments: readonly Attachment[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly quality: readonly MaterializationQuality[]
  readonly reviewCategories: readonly PipelineErrorCategory[]
}

export interface CompareResult {
  readonly outcomeOk: boolean
  readonly fields: readonly FieldComparison[]
}

/** Compare actual run outputs to the gold expectation. Pure. */
export function compareToGold(actual: MaterializedRunOutputs, expected: ExpectedOutputs): CompareResult {
  const fields: FieldComparison[] = []
  const expectMat = expected.expectMaterialization !== false
  const outcomeOk = expectMat
    ? actual.outcome === 'materialized_ready' || actual.outcome === 'review_needed'
    : actual.outcome !== 'materialized_ready'
  fields.push({
    field: 'pipeline.outcome',
    outcome: outcomeOk ? 'match' : 'wrong',
    expected: expectMat ? 'materialized_ready' : 'failed/review',
    actual: actual.outcome,
  })

  // Broker identity.
  if (actual.email) {
    fields.push(scalar('broker', expected.broker, actual.email.brokerId as unknown as string))
  } else if (expected.broker) {
    fields.push({ field: 'broker', outcome: 'missing', expected: expected.broker })
  }

  // Per-ticker (digest) or single primary report.
  const expectedByTicker = new Map<string, ExpectedReport>()
  if (expected.perTicker) {
    for (const [t, e] of Object.entries(expected.perTicker)) expectedByTicker.set(t, e)
  } else if (expected.primary) {
    expectedByTicker.set(String(expected.primary.ticker), expected.primary)
  }

  // Compare each expected ticker against the materialized reports.
  for (const [ticker, exp] of expectedByTicker) {
    const report = actual.reports.find((r) => r.tickers[0] as unknown as string === ticker)
    const summary = report ? actual.summaries.find((s) => s.reportId === report.id) ?? null : null
    const quality = report ? actual.quality.find((q) => q.reportId === report.id) ?? null : null
    const sourceFor = (field: 'thesis' | 'keyPoints' | 'themes' | 'risks' | 'catalysts'):
      'deterministic' | 'llm' | 'absent' | undefined =>
        quality ? quality.fieldProvenance[field] : undefined

    if (!report) {
      fields.push({ field: `${ticker}.report`, outcome: 'missing', expected: ticker })
      continue
    }

    if (exp.rating !== undefined) {
      fields.push(scalar(`${ticker}.rating`, exp.rating, summary?.rating ?? null,
        sourceFor('thesis')))
    }
    if (exp.stance !== undefined) {
      fields.push(scalar(`${ticker}.stance`, exp.stance, summary?.stance ?? null))
    }
    if (exp.targetPrice !== undefined) {
      fields.push(numeric(`${ticker}.targetPrice`, exp.targetPrice, summary?.targetPrice ?? null,
        sourceFor('thesis')))
    }
    if (exp.priorTargetPrice !== undefined) {
      fields.push(numeric(`${ticker}.priorTargetPrice`, exp.priorTargetPrice, summary?.priorTargetPrice ?? null,
        sourceFor('thesis')))
    }
    if (exp.reportType !== undefined) {
      fields.push(scalar(`${ticker}.reportType`, exp.reportType, report.reportType))
    }
  }

  // Lower bounds.
  if (expected.minReports !== undefined) {
    const ok = actual.reports.length >= expected.minReports
    fields.push({
      field: 'minReports',
      outcome: ok ? 'match' : 'missing',
      expected: expected.minReports,
      actual: actual.reports.length,
    })
  }
  if (expected.minEvidence !== undefined) {
    const ok = actual.evidence.length >= expected.minEvidence
    fields.push({
      field: 'minEvidence',
      outcome: ok ? 'match' : 'missing',
      expected: expected.minEvidence,
      actual: actual.evidence.length,
    })
  }
  if (expected.linkedArtifactsContributed !== undefined) {
    const linkedEv = actual.evidence.some((e) =>
      e.fieldRef?.startsWith('linked') ||
      // Provenance kind is on the runtime span, not on the persisted
      // EvidenceSnippet. We approximate by checking quality.sourcesUsed
      // — if any quality record reports a linked source, count it.
      actual.quality.some((q) => q.sourcesUsed.linkedWebpage || q.sourcesUsed.linkedPdf),
    )
    fields.push({
      field: 'linkedArtifactsContributed',
      outcome: linkedEv === expected.linkedArtifactsContributed ? 'match' : 'wrong',
      expected: expected.linkedArtifactsContributed,
      actual: linkedEv,
    })
  }

  // Review categories.
  if (expected.expectReviewCategories && expected.expectReviewCategories.length > 0) {
    const observed = new Set(actual.reviewCategories)
    const ok = expected.expectReviewCategories.some((c) => observed.has(c))
    fields.push({
      field: 'reviewCategories',
      outcome: ok ? 'match' : 'missing',
      expected: expected.expectReviewCategories,
      actual: [...observed],
    })
  }

  return { outcomeOk, fields }
}

// ── Scalar / numeric comparisons ────────────────────────────────────────

function scalar(
  field: string,
  expected: unknown,
  actual: unknown,
  source?: FieldComparison['source'],
): FieldComparison {
  if (actual === null || actual === undefined) {
    return { field, outcome: 'missing', expected, source }
  }
  if (String(expected).toLowerCase() === String(actual).toLowerCase()) {
    return { field, outcome: 'match', expected, actual, source }
  }
  return { field, outcome: 'wrong', expected, actual, source }
}

/** Numeric comparison with a 2% tolerance. Inside tolerance ⇒ match;
 *  within 10% ⇒ partial; otherwise wrong. */
function numeric(
  field: string,
  expected: number,
  actual: number | null | undefined,
  source?: FieldComparison['source'],
): FieldComparison {
  if (actual === null || actual === undefined) {
    return { field, outcome: 'missing', expected, source }
  }
  if (expected === 0 || actual === 0) {
    return {
      field,
      outcome: expected === actual ? 'match' : 'wrong',
      expected, actual, source,
    }
  }
  const diff = Math.abs(actual - expected) / Math.abs(expected)
  if (diff <= 0.02) return { field, outcome: 'match', expected, actual, source }
  if (diff <= 0.1)  return { field, outcome: 'partial', expected, actual, source, note: `Δ ${(diff * 100).toFixed(1)}%` }
  return { field, outcome: 'wrong', expected, actual, source, note: `Δ ${(diff * 100).toFixed(1)}%` }
}
