// Optional LLM enrichment of digest prose.
//
// The digest is fully formed before this module runs — it only rewrites
// `section.prose` and `executiveSummary` to be more readable when the
// LLM is configured. The rules:
//
//   1. Triggers / selection / ranking are NEVER touched here.
//   2. Prose must be grounded — we only feed the LLM the deterministic
//      headlines + reasons of the alerts already chosen.
//   3. If the LLM is unavailable, returns the digest unchanged.
//   4. The function must be safe to retry; same input → same output
//      under a deterministic provider.
//
// We do NOT call the heavy `runEnrichmentTask` orchestrator here — this
// is a separate, narrower task. Instead, we compose a small prompt and
// call the lightweight provider directly. When `LLM_DISABLED=1` or no
// API key is configured, the noop path returns the deterministic prose
// untouched.

import type { AlertDigest, AlertEvent, DigestSection } from '../../../src/domain'

export interface ProseEnrichmentResult {
  readonly digest: AlertDigest
  readonly llmCallCount: number
  readonly llmCostUsd: number | null
}

export interface ProseProvider {
  /** Implementations: openai/anthropic/noop. The default exported below
   *  is `noopProseProvider`, which returns the deterministic prose
   *  unchanged. */
  readonly enrich: (input: ProseEnrichRequest) => Promise<ProseEnrichResponse>
}

export interface ProseEnrichRequest {
  readonly digestKind: AlertDigest['kind']
  readonly sectionTitle: string
  readonly headlines: readonly string[]
  readonly maxLength: number
}

export interface ProseEnrichResponse {
  readonly text: string | null
  readonly costUsd: number | null
}

export const noopProseProvider: ProseProvider = {
  async enrich() {
    return { text: null, costUsd: null }
  },
}

/** Default provider chosen at runtime: noop unless callers wire in
 *  something else. The CLI / server can opt in by passing a configured
 *  provider; we keep the default deterministic so prod behavior never
 *  silently changes. */
export function defaultProseProvider(): ProseProvider {
  if (process.env.LLM_DISABLED === '1' || process.env.LLM_DISABLED === 'true') {
    return noopProseProvider
  }
  // Future: build a real provider here. For now, even when LLM_DISABLED
  // is unset, default to noop — opt-in only.
  return noopProseProvider
}

export async function enrichDigestProse(
  digest: AlertDigest,
  alerts: readonly AlertEvent[],
  provider: ProseProvider = defaultProseProvider(),
): Promise<ProseEnrichmentResult> {
  let calls = 0
  let cost = 0
  const alertById = new Map(alerts.map((a) => [a.id as unknown as string, a]))
  const newSections: DigestSection[] = []
  let dirty = false

  for (const sec of digest.sections) {
    if (sec.alertIds.length === 0) {
      newSections.push(sec)
      continue
    }
    const headlines = sec.alertIds
      .map((id) => alertById.get(id as unknown as string)?.headline)
      .filter((h): h is string => typeof h === 'string')
      .slice(0, 8)
    const resp = await provider.enrich({
      digestKind: digest.kind,
      sectionTitle: sec.title,
      headlines,
      maxLength: 200,
    })
    if (resp.text && resp.text.trim().length > 0) {
      calls += 1
      if (resp.costUsd !== null) cost += resp.costUsd
      newSections.push({
        ...sec,
        prose: resp.text.trim(),
        proseFromLlm: true,
      })
      dirty = true
    } else {
      newSections.push(sec)
    }
  }

  // Executive summary uses up to 12 lead headlines from any section.
  const leadHeadlines: string[] = []
  for (const s of digest.sections) {
    for (const id of s.alertIds.slice(0, 3)) {
      const h = alertById.get(id as unknown as string)?.headline
      if (h) leadHeadlines.push(h)
      if (leadHeadlines.length >= 12) break
    }
    if (leadHeadlines.length >= 12) break
  }
  let executiveSummary = digest.executiveSummary
  let executiveSummaryFromLlm = digest.executiveSummaryFromLlm
  if (leadHeadlines.length > 0) {
    const resp = await provider.enrich({
      digestKind: digest.kind,
      sectionTitle: 'Executive summary',
      headlines: leadHeadlines,
      maxLength: 280,
    })
    if (resp.text && resp.text.trim().length > 0) {
      calls += 1
      if (resp.costUsd !== null) cost += resp.costUsd
      executiveSummary = resp.text.trim()
      executiveSummaryFromLlm = true
      dirty = true
    }
  }

  return {
    digest: dirty
      ? { ...digest, sections: newSections, executiveSummary, executiveSummaryFromLlm }
      : digest,
    llmCallCount: calls,
    llmCostUsd: calls > 0 ? cost : null,
  }
}
