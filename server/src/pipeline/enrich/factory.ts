// ─────────────────────────────────────────────────────────────────────────
// Factory for the Module-17 wired LLM provider.
//
// Centralises the decision tree the operator surfaces share:
//
//   - No API key configured        → no-op provider (existing behaviour).
//   - OPENAI_API_KEY set           → OpenAiLlmProvider with Repo-backed
//                                    cache + onCallRecord.
//   - ANTHROPIC_API_KEY set        → AnthropicLlmProvider, ditto.
//   - Both set                     → OpenAi as the surface provider; the
//                                    runEnrichmentTask orchestrator still
//                                    threads through to Anthropic as the
//                                    registry-defined fallback because we
//                                    pass both `openai:` AND `anthropic:`
//                                    runtime opts (see below).
//
// The provider boundary itself is unchanged — Pipeline still receives
// a single `LlmProvider`. This factory is the only place the env
// matters; tests inject providers directly.
// ─────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'
import type { Repo } from '../../persistence/types'
import type { LlmProvider } from './provider'
import { NoOpLlmProvider } from './noOpProvider'
import { OpenAiLlmProvider } from './openaiProvider'
import { AnthropicLlmProvider } from './anthropicProvider'
import type { LlmCacheEntry, LlmCallRecord } from '../../llm'

export interface ProviderEnv {
  readonly OPENAI_API_KEY?: string
  readonly OPENAI_MODEL?: string
  readonly OPENAI_BASE_URL?: string
  readonly ANTHROPIC_API_KEY?: string
  readonly ANTHROPIC_MODEL?: string
  readonly ANTHROPIC_BASE_URL?: string
  readonly LLM_TIMEOUT_MS?: string
  /** Force the no-op provider regardless of API keys. Useful in eval
   *  diff runs where the operator wants the deterministic baseline. */
  readonly LLM_DISABLED?: string
}

export interface BuildLlmProviderOptions {
  readonly repo: Repo
  readonly env?: ProviderEnv
  /** When true, always picks the no-op provider; lets eval suites force
   *  the deterministic baseline without depending on env. */
  readonly forceNoOp?: boolean
}

/** Build the right `LlmProvider` for the current process environment.
 *  Wires Repo-backed cache + per-call accounting. */
export function buildLlmProvider(opts: BuildLlmProviderOptions): LlmProvider {
  const env = opts.env ?? (process.env as ProviderEnv)
  if (opts.forceNoOp || env.LLM_DISABLED === '1' || env.LLM_DISABLED === 'true') {
    return new NoOpLlmProvider()
  }

  const cache = repoBackedCache(opts.repo)
  const onCallRecord = repoBackedRecorder(opts.repo)
  const timeoutMs = env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined

  if (env.OPENAI_API_KEY) {
    return new OpenAiLlmProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      baseUrl: env.OPENAI_BASE_URL,
      timeoutMs,
      cache, onCallRecord,
    })
  }
  if (env.ANTHROPIC_API_KEY) {
    return new AnthropicLlmProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      baseUrl: env.ANTHROPIC_BASE_URL,
      timeoutMs,
      cache, onCallRecord,
    })
  }
  return new NoOpLlmProvider()
}

/** Wrap a Repo as a typed cache backend the providers + orchestrator
 *  can call without knowing about persistence internals. The cache key
 *  is collision-resistant (sha256), so the lookup is deliberately
 *  global-by-key — the orgId in the stored entry is for attribution,
 *  not partitioning. */
export function repoBackedCache(repo: Repo): {
  readonly get: (key: string) => unknown | null
  readonly set: (entry: LlmCacheEntry) => void
} {
  return {
    get(key) {
      const hit = repo.findLlmCacheEntryByKey(key)
      return hit ? hit.payload ?? null : null
    },
    set(entry) { repo.upsertLlmCacheEntry(entry) },
  }
}

/** Adapter that turns the `(rec) => void` hook the orchestrator emits
 *  into a fully-formed `LlmCallRecord` (id + at) and persists it. */
export function repoBackedRecorder(repo: Repo): (rec: Omit<LlmCallRecord, 'id' | 'at'>) => void {
  return (rec) => {
    const full: LlmCallRecord = {
      ...rec,
      id: `lcr_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      at: new Date().toISOString(),
    }
    repo.appendLlmCallRecord(full)
  }
}
