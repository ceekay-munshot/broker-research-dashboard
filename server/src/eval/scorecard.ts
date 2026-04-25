// Aggregate per-fixture EvalResults into broker / profile / source-type
// / report-type / enrichment-mode buckets. Pure data transform.

import type { EvalResult, ScorecardBucket, Scorecards } from './types'

export function aggregateScorecards(results: readonly EvalResult[]): Scorecards {
  const overall = bucketOf('overall', results)
  const byBroker = groupBuckets(results, (r) =>
    String(r.fixture.expected.broker ?? 'unknown'))
  const byProfile = groupBuckets(results, (r) => r.fixture.profile)
  const bySourceType = groupBuckets(results, (r) => r.fixture.sourceType)
  const byReportType = groupBuckets(results, (r) =>
    r.fixture.expected.primary?.reportType
    ?? Object.values(r.fixture.expected.perTicker ?? {})[0]?.reportType
    ?? 'unknown')
  const byEnrichmentMode = groupBuckets(results, (r) =>
    r.quality.some((q) => q.llmContributed) ? 'llm-enabled' : 'deterministic-only')

  return { overall, byBroker, byProfile, bySourceType, byReportType, byEnrichmentMode }
}

function groupBuckets(results: readonly EvalResult[], keyFn: (r: EvalResult) => string): readonly ScorecardBucket[] {
  const map = new Map<string, EvalResult[]>()
  for (const r of results) {
    const k = keyFn(r)
    const arr = map.get(k) ?? []
    arr.push(r)
    map.set(k, arr)
  }
  return [...map.entries()]
    .map(([k, arr]) => bucketOf(k, arr))
    .sort((a, b) => b.fixtures - a.fixtures || a.key.localeCompare(b.key))
}

function bucketOf(key: string, results: readonly EvalResult[]): ScorecardBucket {
  const fixtures = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = fixtures - passed
  const score = fixtures === 0 ? 0
    : results.reduce((acc, r) => acc + r.score, 0) / fixtures

  // Per-field success rate.
  const totals = new Map<string, { hits: number; total: number }>()
  for (const r of results) {
    for (const f of r.fields) {
      const cur = totals.get(f.field) ?? { hits: 0, total: 0 }
      cur.total++
      if (f.outcome === 'match' || f.outcome === 'partial') cur.hits++
      totals.set(f.field, cur)
    }
  }
  const perField: Record<string, number> = {}
  for (const [f, { hits, total }] of totals) {
    perField[f] = total === 0 ? 0 : Math.round((hits / total) * 100) / 100
  }

  // Source counters across all field comparisons in this bucket.
  let det = 0, llm = 0
  for (const r of results) {
    for (const f of r.fields) {
      if (f.source === 'deterministic') det++
      else if (f.source === 'llm') llm++
    }
  }

  return {
    key,
    fixtures,
    passed,
    failed,
    score: Math.round(score * 100) / 100,
    perField,
    deterministicFieldsCount: det,
    llmFieldsCount: llm,
  }
}
