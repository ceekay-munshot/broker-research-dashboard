// ─────────────────────────────────────────────────────────────────────────
// Module 24 — Sources view-model.
//
// Pure transform over `SourcesHealthSnapshot` for the operator UI:
//   - tone classes for status pills
//   - human-readable freshness strings
//   - a compact "overall" summary for the header chip
//   - a per-source row shape for the Sources tab
// ─────────────────────────────────────────────────────────────────────────

import type {
  SourcesHealthSnapshot, SourceIntegration, SourceHealthStatus,
} from '../domain'

export interface SourcesOverallChipViewModel {
  readonly overall: SourceHealthStatus
  readonly label: string
  readonly tone: 'healthy' | 'stale' | 'failing' | 'degraded' | 'unknown'
  readonly counts: SourcesHealthSnapshot['counts']
  readonly tooltip: string
}

export function buildSourcesChipViewModel(snap: SourcesHealthSnapshot | null): SourcesOverallChipViewModel | null {
  if (!snap) return null
  const tone = snap.overall as SourcesOverallChipViewModel['tone']
  const label =
    snap.overall === 'healthy' ? 'sources ok'
    : snap.overall === 'stale'   ? 'sources stale'
    : snap.overall === 'failing' ? 'sources failing'
    : snap.overall === 'degraded'? 'sources degraded'
    :                              'sources unknown'
  const lines: string[] = []
  for (const s of snap.sources) {
    lines.push(`${s.kind.padEnd(20)} ${s.providerMode.padEnd(10)} ${s.status}` +
      (s.freshness.lastSyncedAt ? `  last ${formatAge(s.freshness.ageSeconds ?? 0)} ago` : '  never synced'))
  }
  return {
    overall: snap.overall,
    label,
    tone,
    counts: snap.counts,
    tooltip: lines.join('\n'),
  }
}

export interface SourcesTabRowViewModel {
  readonly source: SourceIntegration
  readonly statusTone: 'healthy' | 'stale' | 'failing' | 'degraded' | 'unknown'
  readonly freshnessLabel: string
  readonly stalenessLabel: string
  readonly providerLabel: string
}

export function buildSourcesTabViewModel(snap: SourcesHealthSnapshot | null): {
  readonly hasData: boolean
  readonly overall: SourceHealthStatus
  readonly counts: SourcesHealthSnapshot['counts']
  readonly rows: readonly SourcesTabRowViewModel[]
  readonly backfillsInFlight: SourcesHealthSnapshot['backfillsInFlight']
  readonly generatedAt: string | null
} {
  if (!snap) {
    return {
      hasData: false,
      overall: 'unknown',
      counts: { total: 0, healthy: 0, stale: 0, failing: 0, degraded: 0, unknown: 0 },
      rows: [],
      backfillsInFlight: [],
      generatedAt: null,
    }
  }
  const rows = snap.sources.map<SourcesTabRowViewModel>((s) => ({
    source: s,
    statusTone: s.status,
    freshnessLabel: s.freshness.lastSyncedAt
      ? `${formatAge(s.freshness.ageSeconds ?? 0)} ago`
      : 'never synced',
    stalenessLabel: `threshold ${formatAge(s.freshness.stalenessThresholdSeconds)}`,
    providerLabel: s.providerMode === 'http' ? 'real (HTTP)'
                 : s.providerMode === 'fixture' ? 'fixture'
                 : s.providerMode === 'mock'    ? 'mock'
                 :                                 'disabled',
  }))
  return {
    hasData: true,
    overall: snap.overall,
    counts: snap.counts,
    rows,
    backfillsInFlight: snap.backfillsInFlight,
    generatedAt: snap.generatedAt,
  }
}

/** Tailwind class strings for status tones, kept here so views stay simple. */
export const SOURCE_STATUS_CLASS: Record<SourceHealthStatus, string> = {
  healthy:  'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  stale:    'text-amber-300 border-amber-500/30 bg-amber-500/10',
  failing:  'text-rose-300 border-rose-500/30 bg-rose-500/10',
  degraded: 'text-slate-300 border-line/20 bg-line/[0.04]',
  unknown:  'text-slate-500 border-line/10 bg-transparent',
}

export const SOURCE_STATUS_DOT: Record<SourceHealthStatus, string> = {
  healthy:  'bg-emerald-400',
  stale:    'bg-amber-400',
  failing:  'bg-rose-400',
  degraded: 'bg-slate-400',
  unknown:  'bg-slate-600',
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

/** Used by other view-models: returns an array of human-readable
 *  "stale source" strings to inject into their `degradations` lists.
 *  Filters by relevance to the surface (e.g. My Book wants portfolio +
 *  raw_upstream warnings; Calibration wants market_data warnings). */
export function stalenessDegradationsForKinds(
  snap: SourcesHealthSnapshot | null,
  kinds: readonly import('../domain').SourceKind[],
): readonly string[] {
  if (!snap) return []
  const wanted = new Set(kinds)
  const out: string[] = []
  for (const s of snap.sources) {
    if (!wanted.has(s.kind)) continue
    if (s.status === 'healthy') continue
    if (s.status === 'failing') {
      out.push(`Source "${s.displayName}" is failing — last error: ${s.lastError?.message ?? 'unknown'}.`)
      continue
    }
    if (s.status === 'stale' && s.freshness.lastSyncedAt) {
      out.push(`Source "${s.displayName}" is stale — last sync ${formatAge(s.freshness.ageSeconds ?? 0)} ago.`)
      continue
    }
    if (s.degraded.servingFallback) {
      out.push(`Source "${s.displayName}" is serving ${s.providerMode} data.`)
    }
  }
  return out
}
