// ─────────────────────────────────────────────────────────────────────────
// Prior-note linker.
//
// For every `(brokerId, ticker)` pair, walk the full report history in
// publish order and link each report to its immediately-prior comparable.
// The link is purely deterministic:
//
//   prior(report_N) = the report with the greatest `publishedAt` strictly
//                      less than `report_N.publishedAt` that:
//                        - shares brokerId
//                        - covers the same ticker (`tickers[]` contains it)
//
// A multi-ticker morning note produces as many linkable rows as the
// tickers it covers, linked independently per ticker.
//
// Comparability:
//   - 'high'   both reports are single-ticker direct notes
//   - 'medium' both are broker-covered but one is multi-ticker digest
//   - 'low'    one side is a multi-ticker digest AND differs in reportType
//   - 'first_coverage' no prior report exists for this (broker, ticker)
//
// Pure: no React, no adapter, no fetch.
// ─────────────────────────────────────────────────────────────────────────

import type { BrokerId, ResearchReport, StockTicker } from '../../domain'
import type { Comparability } from './types'

export interface LinkedPair {
  readonly key: string                 // `${reportId}:${ticker}`
  readonly ticker: StockTicker
  readonly current: ResearchReport
  readonly prior: ResearchReport | null
  readonly comparability: Comparability
  readonly daysSincePrior: number | null
}

/**
 * Build the prior-note linkage for every (reportId × ticker) row.
 *
 * Complexity: O(R log R + R × T) where R is reports count and T is
 * avg tickers/report. Linear per broker-ticker bucket after one sort.
 */
export function linkReportHistory(
  reports: readonly ResearchReport[],
): readonly LinkedPair[] {
  // Bucket by (brokerId, ticker). Each bucket gets its own publish-order
  // traversal so the linkage is trivially deterministic.
  const buckets = new Map<string, ResearchReport[]>()
  for (const r of reports) {
    for (const t of r.tickers) {
      const key = bucketKey(r.brokerId, t)
      const bucket = buckets.get(key) ?? []
      bucket.push(r)
      buckets.set(key, bucket)
    }
  }

  const linked: LinkedPair[] = []
  for (const [, bucket] of buckets) {
    bucket.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    for (let i = 0; i < bucket.length; i++) {
      const current = bucket[i]!
      const prior = i === 0 ? null : bucket[i - 1]!
      const ticker = extractTickerForReport(current, bucket[Math.max(0, i)]!.tickers)

      const comparability: Comparability = prior === null
        ? 'first_coverage'
        : deriveComparability(current, prior)

      const daysSincePrior = prior
        ? diffDays(prior.publishedAt, current.publishedAt)
        : null

      linked.push({
        key: `${current.id as unknown as string}:${ticker as unknown as string}`,
        ticker,
        current,
        prior,
        comparability,
        daysSincePrior,
      })
    }
  }

  return linked
}

// ── Internals ────────────────────────────────────────────────────────────

function bucketKey(brokerId: BrokerId, ticker: StockTicker): string {
  return `${brokerId as unknown as string}|${ticker as unknown as string}`
}

/** Defensive — in the bucketed walk, the ticker is already known per row.
 *  This helper exists only to keep the call site readable. */
function extractTickerForReport(current: ResearchReport, bucketTickers: readonly StockTicker[]): StockTicker {
  // The bucket is keyed on one specific ticker; the current report must
  // contain that ticker because the bucket was produced from its
  // `tickers[]`. We find the first shared ticker — bucketTickers always
  // has at least the one we bucketed on.
  for (const t of current.tickers) {
    if (bucketTickers.includes(t)) return t
  }
  // Unreachable: bucketing puts only reports whose tickers[] contains the
  // bucket key.
  return current.tickers[0]!
}

function deriveComparability(current: ResearchReport, prior: ResearchReport): Comparability {
  const currentIsDigest = current.tickers.length > 1
  const priorIsDigest = prior.tickers.length > 1
  const typeFamilyMatch = sameTypeFamily(current.reportType, prior.reportType)

  if (!currentIsDigest && !priorIsDigest && typeFamilyMatch) return 'high'
  if (currentIsDigest !== priorIsDigest && !typeFamilyMatch) return 'low'
  return 'medium'
}

const TYPE_FAMILY: Readonly<Record<string, string>> = {
  initiation: 'core',
  update: 'core',
  deep_dive: 'core',
  flash: 'event',
  earnings_review: 'event',
  earnings_preview: 'event',
  morning_note: 'digest',
  sector_note: 'digest',
  other: 'other',
}

function sameTypeFamily(a: string, b: string): boolean {
  return (TYPE_FAMILY[a] ?? 'other') === (TYPE_FAMILY[b] ?? 'other')
}

function diffDays(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / (1000 * 60 * 60 * 24))
}
