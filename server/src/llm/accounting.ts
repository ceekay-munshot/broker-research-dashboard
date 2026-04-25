// Aggregations over `LlmCallRecord` so operators can see what the LLM
// is actually costing them and where it's helping vs not.
//
// Pure data transform. The runner persists raw `LlmCallRecord`s; this
// module groups them into the buckets the CLI surfaces.

import type { LlmCallRecord } from './types'

export interface CallBucket {
  readonly key: string
  readonly calls: number
  readonly successes: number
  readonly groundingPasses: number
  readonly cacheHits: number
  readonly fallbackUses: number
  readonly totalLatencyMs: number
  readonly tokensIn: number
  readonly tokensOut: number
}

export interface LlmAccountingSummary {
  readonly overall: CallBucket
  readonly byProvider: readonly CallBucket[]
  readonly byModel: readonly CallBucket[]
  readonly byTask: readonly CallBucket[]
  readonly byPromptVersion: readonly CallBucket[]
}

export function summarizeCalls(records: readonly LlmCallRecord[]): LlmAccountingSummary {
  const overall = bucketOf('overall', records)
  return {
    overall,
    byProvider:      groupBuckets(records, (r) => r.providerId),
    byModel:         groupBuckets(records, (r) => r.model),
    byTask:          groupBuckets(records, (r) => r.taskId),
    byPromptVersion: groupBuckets(records, (r) => `${r.taskId}@${r.promptVersion}`),
  }
}

function groupBuckets(records: readonly LlmCallRecord[], keyFn: (r: LlmCallRecord) => string): readonly CallBucket[] {
  const groups = new Map<string, LlmCallRecord[]>()
  for (const r of records) {
    const k = keyFn(r)
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  return [...groups.entries()]
    .map(([k, arr]) => bucketOf(k, arr))
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key))
}

function bucketOf(key: string, records: readonly LlmCallRecord[]): CallBucket {
  let calls = 0, successes = 0, gp = 0, ch = 0, fb = 0, latency = 0, ti = 0, to = 0
  for (const r of records) {
    calls++
    if (r.success) successes++
    if (r.groundingPass) gp++
    if (r.cacheHit) ch++
    if (r.usedFallback) fb++
    latency += r.latencyMs
    ti += r.tokensIn ?? 0
    to += r.tokensOut ?? 0
  }
  return {
    key, calls, successes,
    groundingPasses: gp, cacheHits: ch, fallbackUses: fb,
    totalLatencyMs: latency, tokensIn: ti, tokensOut: to,
  }
}
