// ─────────────────────────────────────────────────────────────────────────
// LLM enrichment infrastructure types.
//
// The pipeline keeps its existing `LlmProvider` boundary unchanged.
// Underneath it, this module gives the providers a real
// implementation: a versioned prompt registry, structured-output
// validation, grounding checks against the supplied evidence
// sources, deterministic caching, primary/fallback orchestration,
// and per-call cost/latency accounting persisted via the Repo.
//
// Nothing here talks to React, the dashboard, or the canonical /v1
// API. Module 17 is server-side only.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, Iso8601 } from '../../../src/domain'

// ── Tasks the registry knows about ──────────────────────────────────────

export type EnrichmentTaskId =
  | 'summary_enrichment'        // thesis + keyPoints + themes + risks + catalysts
  | 'change_narrative'          // change-vs-prior synthesis
  | 'digest_split_assist'       // when deterministic split is weak
  | 'linked_synthesis'          // when linked artifacts dominate

// ── Output schema ───────────────────────────────────────────────────────

/** Tiny zod-lite schema. Sufficient for the JSON shapes our prompts
 *  return; intentionally not a full JSON-Schema implementation. */
export type FieldSchema =
  | { readonly type: 'string'; readonly minLength?: number; readonly maxLength?: number }
  | { readonly type: 'number' }
  | { readonly type: 'boolean' }
  | { readonly type: 'array'; readonly items: FieldSchema; readonly minItems?: number; readonly maxItems?: number }
  | {
      readonly type: 'object'
      readonly required: readonly string[]
      readonly properties: Readonly<Record<string, FieldSchema>>
      readonly additionalProperties?: boolean
    }

export interface StructuredOutputSchema {
  readonly name: string
  readonly schema: FieldSchema
}

// ── Prompt definition ───────────────────────────────────────────────────

export interface ModelChoice {
  readonly provider: 'openai' | 'anthropic'
  readonly model: string
}

export interface PromptDefinition {
  readonly id: EnrichmentTaskId
  /** Stable semver-like version. Bump when the prompt or schema changes
   *  in a way that affects output. Flows into the cache key. */
  readonly version: string
  readonly description: string
  readonly systemPrompt: string
  /** User-prompt template with `{{placeholders}}`. Substituted by the
   *  provider at request time. */
  readonly userPromptTemplate: string
  readonly outputSchema: StructuredOutputSchema
  readonly recommended: ModelChoice
  readonly fallback?: ModelChoice
  readonly temperature: number
  readonly maxTokens: number
  /** Output fields that MUST cite an evidence span. Anything else is
   *  dropped before reaching the materializer. */
  readonly groundingFields: readonly string[]
}

// ── Inputs / outputs ────────────────────────────────────────────────────

/** Bundle of evidence text the provider feeds into the prompt + uses
 *  to verify grounding. Same surfaces the deterministic pipeline saw. */
export interface EvidenceBundle {
  readonly bodyText: string
  readonly attachmentTexts: readonly { readonly filename: string; readonly text: string }[]
  readonly linkedTexts: readonly { readonly url: string; readonly text: string; readonly kind: 'webpage' | 'pdf' }[]
}

/** A claim the model emitted, with the evidence span it cites. */
export interface ModelClaim {
  readonly field: 'thesis' | 'keyPoint' | 'theme' | 'risk' | 'catalyst'
  readonly text: string
  /** Verbatim or near-verbatim snippet from one of the evidence
   *  sources. The grounding checker verifies this snippet appears in
   *  one of the supplied texts. */
  readonly evidenceQuote: string
  /** Which source the claim's evidence came from. */
  readonly sourceKind: 'email_body' | 'email_attachment' | 'linked_webpage' | 'linked_pdf'
  /** filename / url / 'body' identifying the specific source. */
  readonly sourceId: string
}

// ── Cost / accounting ───────────────────────────────────────────────────

export interface LlmCallRecord {
  readonly id: string
  readonly orgId: OrgId
  readonly artifactId: string
  readonly candidateKey: string
  readonly taskId: EnrichmentTaskId
  readonly promptVersion: string
  readonly providerId: 'openai' | 'anthropic' | 'noop'
  readonly model: string
  readonly tokensIn: number | null
  readonly tokensOut: number | null
  readonly latencyMs: number
  readonly cacheHit: boolean
  readonly success: boolean
  readonly groundingPass: boolean
  /** True iff this attempt used the prompt's fallback model after the
   *  primary failed. Lets the operator audit fallback frequency. */
  readonly usedFallback: boolean
  readonly errorReason: string | null
  readonly at: Iso8601
}

// ── Cache ───────────────────────────────────────────────────────────────

export interface LlmCacheEntry {
  readonly key: string
  readonly orgId: OrgId
  readonly taskId: EnrichmentTaskId
  readonly promptVersion: string
  readonly providerId: 'openai' | 'anthropic'
  readonly model: string
  readonly storedAt: Iso8601
  /** The validated structured output the provider produced. The cache
   *  stores the post-validation, post-grounding object — replaying
   *  re-applies it without re-validating. */
  readonly payload: unknown
}

// ── Provider runtime input ──────────────────────────────────────────────

export interface RealProviderOptions {
  readonly apiKey?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  /** Override the default model for this provider. Falls back to the
   *  prompt's `recommended` choice when omitted. */
  readonly defaultModel?: string
  /** When true, the provider records every attempt to this hook —
   *  used by the pipeline runner to persist `LlmCallRecord`. */
  readonly onCallRecord?: (rec: Omit<LlmCallRecord, 'id' | 'at'>) => void
  /** Cache reader / writer (typically backed by the Repo). */
  readonly cache?: {
    readonly get: (key: string) => unknown | null
    readonly set: (entry: LlmCacheEntry) => void
  }
}
