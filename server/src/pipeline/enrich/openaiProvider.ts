// ─────────────────────────────────────────────────────────────────────────
// OpenAI provider — real implementation behind the LlmProvider boundary.
//
// As of Module 17 this composes a real Chat Completions request from
// the prompt registry, validates the structured output, enforces
// grounding against the evidence bundle, caches results by
// deterministic key, and records cost/latency. The HTTP boundary
// (`fetchImpl`) is injectable so tests run without touching the
// network.
//
// Without an `apiKey` the provider returns `null` — preserving the
// existing no-op fallback behaviour. Without a `fetchImpl` (and with
// an `apiKey` set) the provider uses Node's global `fetch`.
//
// Back-compat: the legacy `fetcher` option (a high-level
// `(req) => LlmEnrichment | null` shape) is still honoured. Existing
// tests that inject a high-level fetcher continue to pass; the real
// path is taken only when `apiKey` is set without `fetcher`.
// ─────────────────────────────────────────────────────────────────────────

import type { LlmEnrichInput, LlmProvider } from './provider'
import type { EvidenceSpan, LlmEnrichment } from '../models'
import { provFromLlm, provFromAttachment, provFromBody, provFromLinkedPdf, provFromLinkedWebpage } from '../provenance'
import { PipelineError } from '../errors'
import {
  PROMPT_REGISTRY, runEnrichmentTask,
  type EvidenceBundle, type LlmCallRecord, type ModelClaim,
} from '../../llm'

export interface OpenAiProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  /** Cache backend; the runner typically wires a Repo-backed one. */
  readonly cache?: {
    readonly get: (key: string) => unknown | null
    readonly set: (entry: import('../../llm').LlmCacheEntry) => void
  }
  /** Hook to persist call accounting records. */
  readonly onCallRecord?: (rec: Omit<LlmCallRecord, 'id' | 'at'>) => void
  /**
   * Legacy back-compat hook. When present the provider routes through
   * it instead of the real HTTP path — used by Module-13 tests that
   * inject a high-level fetcher returning a pre-built LlmEnrichment.
   */
  readonly fetcher?: (req: unknown) => Promise<unknown>
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly id: string
  constructor(private readonly opts: OpenAiProviderOptions = {}) {
    this.id = `openai:${opts.model ?? PROMPT_REGISTRY.summary_enrichment.recommended.model}`
  }

  async enrich(input: LlmEnrichInput): Promise<LlmEnrichment | null> {
    if (!this.opts.apiKey) return null

    // Legacy back-compat path: when a high-level `fetcher` is provided
    // we keep the Module-13 behaviour of letting the test return a
    // pre-built enrichment.
    if (this.opts.fetcher) {
      try {
        const result = await this.opts.fetcher({ input, model: this.opts.model }) as LlmEnrichment | null
        if (!result) return null
        return ensureEvidenceBacked(result, this.id)
      } catch (e: unknown) {
        throw new PipelineError('LLM_FAILURE_FALLBACK',
          e instanceof Error ? e.message : String(e))
      }
    }

    // Real path: prompt registry → orchestrator → validated payload.
    const prompt = PROMPT_REGISTRY.summary_enrichment
    const bundle = bundleFromInput(input)
    const candidateKey = `${input.candidate.brokerId as unknown as string}:${(input.candidate.ticker as unknown as string) ?? '_'}`
    const result = await runEnrichmentTask({
      orgId: input.candidate.orgId,
      artifactId: candidateKey, // pipeline doesn't pass the raw artifact id here
      candidateKey,
      prompt,
      bundle,
      templateVars: templateVarsFor(input),
      modelOverride: this.opts.model
        ? { provider: 'openai', model: this.opts.model }
        : undefined,
      openai: {
        apiKey: this.opts.apiKey, baseUrl: this.opts.baseUrl,
        fetchImpl: this.opts.fetchImpl, timeoutMs: this.opts.timeoutMs,
      },
      cache: this.opts.cache,
      onCallRecord: this.opts.onCallRecord,
    })
    if (!result) {
      throw new PipelineError('LLM_FAILURE_FALLBACK',
        'OpenAiLlmProvider: all enrichment attempts failed (see LlmCallRecord trail).')
    }
    return shapeEnrichment(result.payload, `openai:${result.model}`, bundle)
  }
}

/** Drop any field that doesn't have at least one supporting evidence
 *  span. Pure function — easy to unit-test in isolation. */
export function ensureEvidenceBacked(raw: LlmEnrichment, providerId: string): LlmEnrichment {
  const ev = raw.evidence ?? []
  const has = (field: EvidenceSpan['supportingField']) => ev.some((e) => e.supportingField === field)
  return {
    providerId,
    thesis:    has('thesis')    ? raw.thesis    : undefined,
    keyPoints: has('keyPoint')  ? raw.keyPoints : undefined,
    themes:    has('theme')     ? raw.themes    : undefined,
    risks:     has('risk')      ? raw.risks     : undefined,
    catalysts: has('catalyst')  ? raw.catalysts : undefined,
    evidence: ev.map((e) => ({
      ...e,
      provenance: e.provenance.kind === 'llm_enrichment' ? provFromLlm(providerId) : e.provenance,
    })),
  }
}

// ── Helpers shared across providers ─────────────────────────────────────

export function bundleFromInput(input: LlmEnrichInput): EvidenceBundle {
  return {
    bodyText: input.bodyText,
    attachmentTexts: input.attachmentTexts.map((a) => ({
      filename: a.provenance.kind === 'email_attachment' ? a.provenance.id : 'attachment',
      text: a.text,
    })),
    linkedTexts: input.linkedTexts.map((l) => ({
      url: l.provenance.kind === 'linked_pdf' || l.provenance.kind === 'linked_webpage' ? l.provenance.id : '',
      kind: l.provenance.kind === 'linked_pdf' ? 'pdf' : 'webpage',
      text: l.text,
    })),
  }
}

export function templateVarsFor(input: LlmEnrichInput): Record<string, string | number | null | undefined> {
  return {
    broker: input.candidate.brokerId as unknown as string,
    ticker: input.candidate.ticker as unknown as string ?? '',
    subject: input.candidate.title,
    bodyText: input.bodyText,
    attachmentTexts: input.attachmentTexts.map((a, i) => `[${i}] ${a.text}`).join('\n'),
    linkedTexts: input.linkedTexts.map((l, i) => `[${i}] ${l.text}`).join('\n'),
    rating: input.candidate.rating ?? '',
    targetPrice: input.candidate.targetPrice ?? '',
    priorTargetPrice: input.candidate.priorTargetPrice ?? '',
    reportType: input.candidate.reportType,
  }
}

/** Convert a validated `summary_enrichment` payload into the
 *  `LlmEnrichment` the materializer consumes. Each claim becomes an
 *  `EvidenceSpan` with the right provenance kind. */
export function shapeEnrichment(
  payload: unknown,
  providerId: string,
  bundle: EvidenceBundle,
): LlmEnrichment {
  const obj = (payload ?? {}) as {
    readonly thesis?: string
    readonly keyPoints?: readonly string[]
    readonly themes?: readonly string[]
    readonly risks?: readonly string[]
    readonly catalysts?: readonly { readonly label: string; readonly expectedOn?: string }[]
    readonly claims?: readonly ModelClaim[]
  }
  const evidence: EvidenceSpan[] = (obj.claims ?? []).map((c, i) => ({
    text: c.evidenceQuote,
    supportingField: c.field,
    fieldRef: String(i),
    provenance: provenanceFromClaim(c, bundle),
  }))
  return {
    providerId,
    thesis: obj.thesis,
    keyPoints: obj.keyPoints,
    themes: obj.themes,
    risks: obj.risks,
    catalysts: obj.catalysts?.map((c) => ({ label: c.label, expectedOn: c.expectedOn ?? null })),
    evidence,
  }
}

function provenanceFromClaim(claim: ModelClaim, bundle: EvidenceBundle): EvidenceSpan['provenance'] {
  switch (claim.sourceKind) {
    case 'email_body': return provFromBody()
    case 'email_attachment': return provFromAttachment(claim.sourceId)
    case 'linked_webpage': return provFromLinkedWebpage(claim.sourceId)
    case 'linked_pdf': return provFromLinkedPdf(claim.sourceId)
    default: {
      // Touch `bundle` so the unused-locals lint is satisfied; the
      // bundle isn't needed at this site but keeping the param shape
      // stable lets the helper grow if we add cross-source disambiguation.
      void bundle
      return provFromBody()
    }
  }
}
