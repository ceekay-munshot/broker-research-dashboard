// Deterministic LLM call cache.
//
// Cache key = sha256(taskId | promptVersion | model | sha256(evidenceBundleText)).
// Same effective input ⇒ same key ⇒ cached payload ⇒ no API call.
//
// The cache is a thin abstraction over a `Repo`-backed store. Tests
// inject an `InMemoryRepo`; production uses the JsonFileRepo.

import { createHash } from 'node:crypto'
import type { OrgId } from '../../../src/domain'
import type {
  EnrichmentTaskId, EvidenceBundle, LlmCacheEntry,
} from './types'

export interface CacheBackend {
  readonly get: (key: string) => LlmCacheEntry | null
  readonly set: (entry: LlmCacheEntry) => void
}

export interface CacheKeyInput {
  readonly taskId: EnrichmentTaskId
  readonly promptVersion: string
  readonly providerId: 'openai' | 'anthropic'
  readonly model: string
  readonly bundle: EvidenceBundle
  /** Optional candidate-level overrides folded into the key so a
   *  correction-driven rerun produces a fresh cache entry. */
  readonly candidateSeed?: string
}

export function computeCacheKey(inp: CacheKeyInput): string {
  const bundleText = serializeBundle(inp.bundle)
  const bundleHash = sha256(bundleText)
  const seed = inp.candidateSeed ?? ''
  return sha256(`${inp.taskId}|${inp.promptVersion}|${inp.providerId}|${inp.model}|${bundleHash}|${seed}`)
}

function serializeBundle(b: EvidenceBundle): string {
  const parts: string[] = []
  parts.push(b.bodyText)
  for (const a of b.attachmentTexts) parts.push(`${a.filename}::${a.text}`)
  for (const l of b.linkedTexts) parts.push(`${l.url}::${l.kind}::${l.text}`)
  return parts.join('\n---\n')
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function buildCacheEntry(args: {
  readonly key: string
  readonly orgId: OrgId
  readonly taskId: EnrichmentTaskId
  readonly promptVersion: string
  readonly providerId: 'openai' | 'anthropic'
  readonly model: string
  readonly payload: unknown
}): LlmCacheEntry {
  return {
    key: args.key,
    orgId: args.orgId,
    taskId: args.taskId,
    promptVersion: args.promptVersion,
    providerId: args.providerId,
    model: args.model,
    storedAt: new Date().toISOString(),
    payload: args.payload,
  }
}
