// ─────────────────────────────────────────────────────────────────────────
// Screen readiness matrix.
//
// For each top-level screen in the dashboard, declare the *minimum*
// upstream resources required to render the screen meaningfully, and the
// resources that can be missing without breaking the render.
//
// A "meaningful" render means the user sees the intended view — not just
// the skeleton. If a required resource is missing, the screen falls back
// to its empty / error state, and the dev diagnostics chip surfaces the
// gap.
//
// The keys here match `RESOURCE_CATALOG` entries in `degraded.ts`. That
// catalog is the source of truth for per-resource degradation policy;
// this file is the source of truth for per-screen composition.
// ─────────────────────────────────────────────────────────────────────────

export type ScreenKey =
  | 'dashboard'
  | 'byBroker'
  | 'byStock'
  | 'reportDetail'
  | 'divergence'
  | 'sectorFeed'
  | 'ingestion'

export interface ScreenReadiness {
  readonly key: ScreenKey
  readonly displayName: string
  /** Required: if any of these fail, the screen is not ready. */
  readonly required: readonly string[]
  /** Optional: if these fail, the screen still renders but degrades. */
  readonly optional: readonly string[]
  /** One-line note for the dev chip. */
  readonly note: string
}

export const SCREEN_READINESS: readonly ScreenReadiness[] = [
  {
    key: 'dashboard',
    displayName: 'Dashboard (KPIs + rolling feed)',
    required: ['organization', 'currentUser', 'brokers', 'sectors', 'stocks', 'researchReports', 'kpiSnapshot'],
    optional: ['ingestionStatus', 'opinions'],
    note: 'Home screen: KPI cards + rolling research feed.',
  },
  {
    key: 'byBroker',
    displayName: 'By Broker',
    required: ['brokers', 'opinions'],
    optional: ['researchReports', 'stocks'],
    note: 'Grouped view of each broker’s current opinions.',
  },
  {
    key: 'byStock',
    displayName: 'By Stock',
    required: ['stocks', 'opinions'],
    optional: ['researchReports', 'conflictClosures'],
    note: 'Grouped view of street opinions per ticker.',
  },
  {
    key: 'reportDetail',
    displayName: 'Report detail drawer',
    required: ['researchReport'],
    optional: ['reportSummary', 'reportEvidence'],
    note: 'Drawer view for a single research report (summary + evidence).',
  },
  {
    key: 'divergence',
    displayName: 'Divergence / Arb',
    required: ['opinions'],
    optional: ['conflictClosures'],
    note: 'Wide-spread closures (client-side computable from opinions).',
  },
  {
    key: 'sectorFeed',
    displayName: 'Sector Feed',
    required: ['sectors', 'researchReports'],
    optional: ['sectorIntelligence'],
    note: 'Sector-level rollups (upstream) or client-computed from reports.',
  },
  {
    key: 'ingestion',
    displayName: 'Ingestion status',
    required: ['ingestionStatus'],
    optional: ['brokerEmails'],
    note: 'Pipeline counters in the header chip.',
  },
] as const

export type ScreenReadinessVerdict = 'ready' | 'degraded' | 'blocked'

export interface ScreenReadinessReport {
  readonly key: ScreenKey
  readonly verdict: ScreenReadinessVerdict
  readonly missingRequired: readonly string[]
  readonly missingOptional: readonly string[]
}

/**
 * Given sets of loaded / degraded resource keys, produce a verdict per
 * screen:
 *   - `ready`    — every required resource is loaded cleanly.
 *   - `degraded` — required all loaded; some optionals missing.
 *   - `blocked`  — at least one required resource is missing or errored.
 *
 * `loadedKeys` = resources that returned canonical data successfully.
 * `degradedKeys` = resources that returned but triggered degraded-mode
 *                  warnings (defaults applied, aliases used, etc.)
 * `erroredKeys` = resources the adapter failed to load (throw or 404 on a
 *                 required endpoint).
 */
export function assessScreen(
  readiness: ScreenReadiness,
  loadedKeys: ReadonlySet<string>,
  erroredKeys: ReadonlySet<string>,
): ScreenReadinessReport {
  const missingRequired = readiness.required.filter((k) => erroredKeys.has(k) || !loadedKeys.has(k))
  const missingOptional = readiness.optional.filter((k) => erroredKeys.has(k) || !loadedKeys.has(k))
  const verdict: ScreenReadinessVerdict =
    missingRequired.length > 0 ? 'blocked'
      : missingOptional.length > 0 ? 'degraded'
      : 'ready'
  return { key: readiness.key, verdict, missingRequired, missingOptional }
}

export function assessAllScreens(
  loadedKeys: ReadonlySet<string>,
  erroredKeys: ReadonlySet<string>,
): readonly ScreenReadinessReport[] {
  return SCREEN_READINESS.map((r) => assessScreen(r, loadedKeys, erroredKeys))
}
