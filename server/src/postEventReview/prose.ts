// Optional LLM enrichment of post-event review prose.
//
// Same rules as the alerts/digest and catalyst-brief prose layers:
//
//   1. Verdicts / divergence resolution / expectation errors are
//      deterministic and never touched here.
//   2. Prose is grounded — only deterministic bullets fed to the LLM.
//   3. `LLM_DISABLED=1` → noop. Default provider is noopProseProvider.

import type { PostEventReview } from '../../../src/domain'

export interface ProseEnrichRequest {
  readonly catalystHeadline: string
  readonly outcomeSummary: string
  readonly bullets: readonly string[]
  readonly maxLength: number
}

export interface ProseEnrichResponse {
  readonly text: string | null
  readonly costUsd: number | null
}

export interface ProseProvider {
  enrich(req: ProseEnrichRequest): Promise<ProseEnrichResponse>
}

export const noopProseProvider: ProseProvider = {
  async enrich() { return { text: null, costUsd: null } },
}

export function defaultProseProvider(): ProseProvider {
  if (process.env.LLM_DISABLED === '1' || process.env.LLM_DISABLED === 'true') return noopProseProvider
  return noopProseProvider
}

export interface ProseResult {
  readonly review: PostEventReview
  readonly llmCallCount: number
  readonly llmCostUsd: number | null
}

export async function enrichPostEventReviewProse(
  review: PostEventReview,
  provider: ProseProvider = defaultProseProvider(),
): Promise<ProseResult> {
  let calls = 0
  let cost = 0
  // Build deterministic bullets fed to the LLM for executive summary.
  const bullets: string[] = []
  bullets.push(review.outcomeSummary)
  bullets.push(review.divergenceResolution.note)
  for (const e of review.expectationErrors.slice(0, 3)) bullets.push(e.text)
  for (const v of review.brokerVerdicts.slice(0, 4)) {
    if (v.verdict === 'right' || v.verdict === 'wrong') {
      bullets.push(`${v.brokerShortName}: ${v.verdict} — ${v.reason}`)
    }
  }
  const resp = await provider.enrich({
    catalystHeadline: review.preEventSnapshot.tiltSummary,
    outcomeSummary: review.outcomeSummary,
    bullets,
    maxLength: 280,
  })
  if (resp.text && resp.text.trim().length > 0) {
    calls = 1
    cost = resp.costUsd ?? 0
    return {
      review: { ...review, executiveSummary: resp.text.trim(), executiveSummaryFromLlm: true },
      llmCallCount: calls,
      llmCostUsd: calls > 0 ? cost : null,
    }
  }
  return { review, llmCallCount: 0, llmCostUsd: null }
}
