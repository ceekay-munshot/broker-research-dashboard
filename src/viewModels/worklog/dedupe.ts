// ─────────────────────────────────────────────────────────────────────────
// Worklog duplicate / noise suppression.
//
// Broker research flows are inherently duplicative: a morning brief will
// mention TCS in its index *and* in a body section, the same flash note
// may arrive twice from different forwarding paths, and an analyst who
// subscribes to two distribution lists will see identical content twice.
//
// We never delete records — the canonical data and its lineage must stay
// intact for audit. Instead we select a *canonical* worklog item per
// (brokerId, ticker, utc-day) tuple and collapse the rest into it. The
// collapsed items contribute their lineage (parent email ids) to the
// canonical's `source.collapsedIds` / `duplicateCount`, so the UI can
// show a "+2 duplicate" badge without hiding evidence of what came in.
//
// Canonical-selection rule (deterministic):
//   1. Prefer the higher-priority item (already scored before dedupe).
//   2. Tie-break by preferring `direct_attachment` > `direct_body` > `digest_split`.
//   3. Tie-break by `receivedAt` earliest (the first arrival wins, so
//      re-forwards don't perturb the timeline).
//   4. Tie-break by id (lexicographic) to make the outcome deterministic.
//
// Pure. No React, no side effects, no adapter imports.
// ─────────────────────────────────────────────────────────────────────────

import type { WorklogItem, WorklogOrigin } from './types'

const ORIGIN_PREFERENCE: Readonly<Record<WorklogOrigin, number>> = {
  direct_attachment: 3,
  direct_body:       2,
  digest_split:      1,
}

const BUCKET_RANK: Readonly<Record<WorklogItem['priority']['bucket'], number>> = {
  high: 3, medium: 2, low: 1,
}

export interface DedupeResult {
  readonly canonical: readonly WorklogItem[]
  readonly collapsedCount: number
}

export function dedupeWorklogItems(items: readonly WorklogItem[]): DedupeResult {
  // Group by (brokerId, ticker, utcDate). Items without a ticker stand on
  // their own — we never collapse a generic sector/digest item with no
  // stock anchor.
  const buckets = new Map<string, WorklogItem[]>()
  const standalone: WorklogItem[] = []

  for (const it of items) {
    if (!it.ticker) { standalone.push(it); continue }
    const key = `${it.brokerId}|${it.ticker}|${it.utcDate}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(it)
    else buckets.set(key, [it])
  }

  const canonical: WorklogItem[] = [...standalone]
  let collapsedCount = 0

  for (const group of buckets.values()) {
    if (group.length === 1) { canonical.push(group[0]!); continue }
    group.sort(compareForCanonical)
    const winner = group[0]!
    const losers = group.slice(1)
    collapsedCount += losers.length
    canonical.push({
      ...winner,
      source: {
        ...winner.source,
        collapsedIds: losers.map((l) => l.id),
        duplicateCount: losers.length,
      },
    })
  }

  return { canonical, collapsedCount }
}

// Lower number wins. See `Canonical-selection rule` in the file header.
function compareForCanonical(a: WorklogItem, b: WorklogItem): number {
  const byBucket = BUCKET_RANK[b.priority.bucket] - BUCKET_RANK[a.priority.bucket]
  if (byBucket !== 0) return byBucket

  const byScore = b.priority.score - a.priority.score
  if (byScore !== 0) return byScore

  const byOrigin = ORIGIN_PREFERENCE[b.origin] - ORIGIN_PREFERENCE[a.origin]
  if (byOrigin !== 0) return byOrigin

  const byRecv = a.receivedAt.localeCompare(b.receivedAt)
  if (byRecv !== 0) return byRecv

  return a.id.localeCompare(b.id)
}
