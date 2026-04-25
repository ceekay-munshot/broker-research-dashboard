// Replay-with-comparison.
//
// Operators capture a "before" snapshot of a materialized artifact's
// canonical outputs, replay the pipeline (presumably after a parser /
// profile / prompt change), capture an "after" snapshot, and feed both
// to `diffSnapshots()` to see what actually changed.

import type { MaterializedRunOutputs } from './compare'
import type { ResearchReport, ReportSummary } from '../../../src/domain'

export type DiffOutcome = 'unchanged' | 'changed' | 'added' | 'removed'

export interface DiffEntry {
  readonly field: string
  readonly outcome: DiffOutcome
  readonly before?: unknown
  readonly after?: unknown
  readonly note?: string
}

export interface SnapshotDiff {
  readonly entries: readonly DiffEntry[]
  readonly summary: {
    readonly changed: number
    readonly added: number
    readonly removed: number
    readonly unchanged: number
  }
}

/** Pure diff between two materialization snapshots. The fields mirror
 *  what operators most often want to see after a parser / profile /
 *  prompt change. */
export function diffSnapshots(before: MaterializedRunOutputs, after: MaterializedRunOutputs): SnapshotDiff {
  const entries: DiffEntry[] = []

  entries.push(scalarDiff('pipeline.outcome', before.outcome, after.outcome))
  entries.push(scalarDiff('reports.count', before.reports.length, after.reports.length))
  entries.push(scalarDiff('summaries.count', before.summaries.length, after.summaries.length))
  entries.push(scalarDiff('evidence.count', before.evidence.length, after.evidence.length))
  entries.push(scalarDiff('opinions.count', before.opinions.length, after.opinions.length))

  // Per-ticker comparison on the most operator-relevant fields.
  const tickers = new Set<string>([
    ...before.reports.map((r) => r.tickers[0] as unknown as string).filter(Boolean),
    ...after.reports.map((r) => r.tickers[0] as unknown as string).filter(Boolean),
  ])
  for (const ticker of tickers) {
    const b = lookupReport(before.reports, before.summaries, ticker)
    const a = lookupReport(after.reports,  after.summaries,  ticker)
    if (!b && a) { entries.push({ field: `${ticker}`, outcome: 'added',   after: snippetFor(a) }); continue }
    if (b && !a) { entries.push({ field: `${ticker}`, outcome: 'removed', before: snippetFor(b) }); continue }
    if (!b || !a) continue

    entries.push(scalarDiff(`${ticker}.rating`,
      b.summary?.rating ?? null, a.summary?.rating ?? null))
    entries.push(scalarDiff(`${ticker}.targetPrice`,
      b.summary?.targetPrice ?? null, a.summary?.targetPrice ?? null))
    entries.push(scalarDiff(`${ticker}.priorTargetPrice`,
      b.summary?.priorTargetPrice ?? null, a.summary?.priorTargetPrice ?? null))
    entries.push(scalarDiff(`${ticker}.reportType`,
      b.report.reportType, a.report.reportType))
    entries.push(scalarDiff(`${ticker}.summary.thesisLength`,
      (b.summary?.thesis ?? '').length, (a.summary?.thesis ?? '').length))
    entries.push(scalarDiff(`${ticker}.summary.themesCount`,
      b.summary?.themes.length ?? 0, a.summary?.themes.length ?? 0))
    entries.push(scalarDiff(`${ticker}.summary.risksCount`,
      b.summary?.risks.length ?? 0, a.summary?.risks.length ?? 0))
  }

  // Review categories — diff as sets.
  const beforeReview = new Set(before.reviewCategories)
  const afterReview  = new Set(after.reviewCategories)
  for (const c of [...beforeReview, ...afterReview]) {
    if (beforeReview.has(c) && !afterReview.has(c)) {
      entries.push({ field: `review.${c}`, outcome: 'removed', before: c })
    } else if (!beforeReview.has(c) && afterReview.has(c)) {
      entries.push({ field: `review.${c}`, outcome: 'added', after: c })
    }
  }

  const summary = {
    changed:   entries.filter((e) => e.outcome === 'changed').length,
    added:     entries.filter((e) => e.outcome === 'added').length,
    removed:   entries.filter((e) => e.outcome === 'removed').length,
    unchanged: entries.filter((e) => e.outcome === 'unchanged').length,
  }
  return { entries, summary }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function scalarDiff(field: string, before: unknown, after: unknown): DiffEntry {
  if (before === after) return { field, outcome: 'unchanged', before, after }
  return { field, outcome: 'changed', before, after }
}

function lookupReport(
  reports: readonly ResearchReport[],
  summaries: readonly ReportSummary[],
  ticker: string,
): { readonly report: ResearchReport; readonly summary: ReportSummary | null } | null {
  const r = reports.find((rep) => rep.tickers[0] as unknown as string === ticker)
  if (!r) return null
  const s = summaries.find((su) => su.reportId === r.id) ?? null
  return { report: r, summary: s }
}

function snippetFor(p: { readonly report: ResearchReport; readonly summary: ReportSummary | null }): unknown {
  return {
    rating: p.summary?.rating ?? null,
    targetPrice: p.summary?.targetPrice ?? null,
    reportType: p.report.reportType,
  }
}
