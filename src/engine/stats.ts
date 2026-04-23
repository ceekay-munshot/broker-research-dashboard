import type { TargetStats } from './types'

// Pure statistical helpers. Kept free of domain types so they can be
// unit-tested in isolation.

export function mean(nums: readonly number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function median(nums: readonly number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const n = sorted.length
  return n % 2 === 0
    ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
    : sorted[Math.floor(n / 2)]!
}

// Population stdev (divide by n, not n-1). Appropriate for small-n broker
// target samples where we're describing the spread we observed, not
// inferring a parent distribution.
export function stdev(nums: readonly number[]): number | null {
  if (nums.length < 2) return null
  const m = mean(nums)!
  const variance = nums.reduce((sum, x) => sum + (x - m) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export function computeTargetStats(targets: readonly number[]): TargetStats {
  if (targets.length === 0) {
    return { count: 0, mean: null, median: null, high: null, low: null, stdev: null, spreadPct: null }
  }
  const sorted = [...targets].sort((a, b) => a - b)
  const high = sorted[sorted.length - 1]!
  const low = sorted[0]!
  const m = mean(targets)
  const med = median(targets)
  const sd = stdev(targets)
  const spreadPct = low > 0 ? ((high - low) / low) * 100 : null
  return { count: targets.length, mean: m, median: med, high, low, stdev: sd, spreadPct }
}

export function unique<T>(items: readonly T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const it of items) {
    if (!seen.has(it)) { seen.add(it); out.push(it) }
  }
  return out
}
