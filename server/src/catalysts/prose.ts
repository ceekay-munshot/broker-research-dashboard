// Optional LLM enrichment of pre-event brief prose. Same rules as the
// alerts/prose layer:
//
//   1. Sections / bullets / report selection are deterministic — never
//      touched here.
//   2. Prose must be grounded — the LLM is fed the deterministic
//      bullets + a one-line section context and asked to write a
//      compact summary.
//   3. If the LLM is unavailable (`LLM_DISABLED=1` or no provider),
//      the digest stays unchanged.

import type { PreEventBrief, PreEventBriefSection } from '../../../src/domain'

export interface ProseEnrichRequest {
  readonly catalystHeadline: string
  readonly sectionTitle: string
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
  // Opt-in only: future providers go here.
  return noopProseProvider
}

export interface ProseResult {
  readonly brief: PreEventBrief
  readonly llmCallCount: number
  readonly llmCostUsd: number | null
}

export async function enrichPreEventBriefProse(
  brief: PreEventBrief,
  provider: ProseProvider = defaultProseProvider(),
): Promise<ProseResult> {
  let calls = 0
  let cost = 0
  const newSections: PreEventBriefSection[] = []
  let dirty = false

  for (const sec of brief.sections) {
    if (sec.bullets.length === 0) {
      newSections.push(sec)
      continue
    }
    const resp = await provider.enrich({
      catalystHeadline: brief.snapshot.tiltSummary,
      sectionTitle: sec.title,
      bullets: sec.bullets,
      maxLength: 240,
    })
    if (resp.text && resp.text.trim().length > 0) {
      calls += 1
      if (resp.costUsd !== null) cost += resp.costUsd
      newSections.push({ ...sec, prose: resp.text.trim(), proseFromLlm: true })
      dirty = true
    } else {
      newSections.push(sec)
    }
  }

  return {
    brief: dirty ? { ...brief, sections: newSections } : brief,
    llmCallCount: calls,
    llmCostUsd: calls > 0 ? cost : null,
  }
}
