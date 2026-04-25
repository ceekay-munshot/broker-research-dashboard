// Primary/fallback orchestrator.
//
// The pipeline calls a single `runEnrichmentTask({ prompt, bundle, ... })`.
// This function:
//
//   1. Computes the cache key from (taskId, promptVersion, model, evidence).
//   2. Returns the cached payload if present (cacheHit=true).
//   3. Else calls the primary model. On HTTP / parse / schema /
//      grounding failure, falls back to the prompt's `fallback` model.
//   4. Records every attempt as an `LlmCallRecord` via `onCallRecord`.
//   5. Persists the validated, grounded payload to the cache.
//   6. Returns the payload (or null when all attempts failed —
//      the deterministic-only fallback path remains intact).

import type { OrgId } from '../../../src/domain'
import type {
  EvidenceBundle, LlmCallRecord, ModelChoice, PromptDefinition,
  RealProviderOptions,
} from './types'
import { computeCacheKey, buildCacheEntry } from './cache'
import { validateAgainst } from './schema'
import { checkGrounding } from './grounding'
import { callOpenAi } from './openaiHttp'
import { callAnthropic } from './anthropicHttp'
import { renderUserPrompt } from './registry'

export interface RunEnrichmentArgs {
  readonly orgId: OrgId
  readonly artifactId: string
  readonly candidateKey: string
  readonly prompt: PromptDefinition
  readonly bundle: EvidenceBundle
  /** Variables substituted into the user-prompt template. */
  readonly templateVars: Readonly<Record<string, string | number | null | undefined>>
  /** Per-provider runtime options. The orchestrator picks the matching
   *  one based on `prompt.recommended.provider` and (on failure) the
   *  fallback. */
  readonly openai?: RealProviderOptions
  readonly anthropic?: RealProviderOptions
  /** Override the prompt's recommended model (operator experiment). */
  readonly modelOverride?: ModelChoice
  /** A cache backend; usually `Repo`-backed. */
  readonly cache?: RealProviderOptions['cache']
  /** Hook called once per attempt — used by the runner to persist
   *  `LlmCallRecord`. */
  readonly onCallRecord?: (rec: Omit<LlmCallRecord, 'id' | 'at'>) => void
}

export interface EnrichmentResult {
  readonly payload: unknown
  /** Which provider+model produced the payload. */
  readonly providerId: 'openai' | 'anthropic'
  readonly model: string
  readonly cacheHit: boolean
  readonly usedFallback: boolean
}

export async function runEnrichmentTask(args: RunEnrichmentArgs): Promise<EnrichmentResult | null> {
  const userPrompt = renderUserPrompt(args.prompt.userPromptTemplate, args.templateVars)
  const primary = args.modelOverride ?? args.prompt.recommended
  const fallback = args.prompt.fallback

  // Try primary, then fallback.
  const attempts: { readonly choice: ModelChoice; readonly isFallback: boolean }[] = [
    { choice: primary, isFallback: false },
    ...(fallback ? [{ choice: fallback, isFallback: true }] : []),
  ]

  for (const { choice, isFallback } of attempts) {
    const cacheKey = computeCacheKey({
      taskId: args.prompt.id,
      promptVersion: args.prompt.version,
      providerId: choice.provider,
      model: choice.model,
      bundle: args.bundle,
      candidateSeed: args.candidateKey,
    })

    // Cache hit?
    const cached = args.cache?.get(cacheKey) ?? null
    if (cached !== null) {
      args.onCallRecord?.({
        orgId: args.orgId,
        artifactId: args.artifactId,
        candidateKey: args.candidateKey,
        taskId: args.prompt.id,
        promptVersion: args.prompt.version,
        providerId: choice.provider,
        model: choice.model,
        tokensIn: 0, tokensOut: 0,
        latencyMs: 0,
        cacheHit: true, success: true, groundingPass: true,
        usedFallback: isFallback,
        errorReason: null,
      })
      return {
        payload: (cached as { readonly payload?: unknown })?.payload ?? cached,
        providerId: choice.provider, model: choice.model,
        cacheHit: true, usedFallback: isFallback,
      }
    }

    // No cache. Pick provider + apiKey.
    const opts = choice.provider === 'openai' ? args.openai : args.anthropic
    if (!opts?.apiKey) {
      // Provider not configured; skip this attempt.
      args.onCallRecord?.({
        orgId: args.orgId,
        artifactId: args.artifactId, candidateKey: args.candidateKey,
        taskId: args.prompt.id, promptVersion: args.prompt.version,
        providerId: choice.provider, model: choice.model,
        tokensIn: null, tokensOut: null,
        latencyMs: 0, cacheHit: false, success: false, groundingPass: false,
        usedFallback: isFallback,
        errorReason: 'apiKey not configured',
      })
      continue
    }

    const startedAt = Date.now()
    try {
      const result = choice.provider === 'openai'
        ? await callOpenAi({
            apiKey: opts.apiKey, baseUrl: opts.baseUrl,
            fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs,
            model: choice.model, prompt: args.prompt, userPrompt,
          })
        : await callAnthropic({
            apiKey: opts.apiKey, baseUrl: opts.baseUrl,
            fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs,
            model: choice.model, prompt: args.prompt, userPrompt,
          })

      // Schema validation.
      const v = validateAgainst(result.raw, args.prompt.outputSchema)
      if (!v.ok) {
        recordFail(args, choice, isFallback, startedAt, result.tokensIn, result.tokensOut,
          `schema: ${v.errors.join('; ').slice(0, 240)}`)
        continue
      }

      // Grounding. We pass `result.raw` so empty / missing optional
      // fields don't count as "ungrounded" — only fields the model
      // actually populated need backing claims.
      const claims = extractClaims(result.raw)
      const grounding = checkGrounding(claims, args.bundle, args.prompt, result.raw)
      // Drop ungrounded fields from the payload before returning.
      const filtered = stripUngroundedFields(result.raw, grounding.droppedFields)

      // Persist to cache (filtered payload).
      args.cache?.set(buildCacheEntry({
        key: cacheKey, orgId: args.orgId, taskId: args.prompt.id,
        promptVersion: args.prompt.version, providerId: choice.provider, model: choice.model,
        payload: filtered,
      }))

      args.onCallRecord?.({
        orgId: args.orgId,
        artifactId: args.artifactId, candidateKey: args.candidateKey,
        taskId: args.prompt.id, promptVersion: args.prompt.version,
        providerId: choice.provider, model: choice.model,
        tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        latencyMs: Date.now() - startedAt,
        cacheHit: false, success: true,
        groundingPass: grounding.groundingPass,
        usedFallback: isFallback,
        errorReason: null,
      })
      return {
        payload: filtered,
        providerId: choice.provider, model: choice.model,
        cacheHit: false, usedFallback: isFallback,
      }
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : String(e)
      recordFail(args, choice, isFallback, startedAt, null, null, reason)
      // Try next attempt (fallback model, if any).
      continue
    }
  }
  return null
}

function recordFail(
  args: RunEnrichmentArgs,
  choice: ModelChoice,
  isFallback: boolean,
  startedAt: number,
  tokensIn: number | null,
  tokensOut: number | null,
  reason: string,
): void {
  args.onCallRecord?.({
    orgId: args.orgId,
    artifactId: args.artifactId, candidateKey: args.candidateKey,
    taskId: args.prompt.id, promptVersion: args.prompt.version,
    providerId: choice.provider, model: choice.model,
    tokensIn, tokensOut,
    latencyMs: Date.now() - startedAt,
    cacheHit: false, success: false, groundingPass: false,
    usedFallback: isFallback,
    errorReason: reason,
  })
}

function extractClaims(raw: unknown): readonly import('./types').ModelClaim[] {
  if (raw === null || typeof raw !== 'object') return []
  const obj = raw as { readonly claims?: unknown }
  if (!Array.isArray(obj.claims)) return []
  return obj.claims as readonly import('./types').ModelClaim[]
}

function stripUngroundedFields(raw: unknown, droppedFields: readonly string[]): unknown {
  if (droppedFields.length === 0) return raw
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  for (const f of droppedFields) delete out[f]
  return out
}
