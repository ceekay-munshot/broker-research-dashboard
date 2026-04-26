// ─────────────────────────────────────────────────────────────────────────
// Module 24 — Source configuration model.
//
// Each source per org has a config block describing:
//   - which provider mode to bind (real HTTP / fixture / disabled)
//   - the base URL + token env var when HTTP
//   - polling / staleness / backoff thresholds
//
// The config is read from process env at server startup. The CLI inspects
// the same data through `loadSourceConfigs()`. Switching from fixture to
// real is one env-var flip per source.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, SourceKind, SourceProviderMode } from '../../../src/domain'

export interface SourceConfig {
  readonly orgId: OrgId
  readonly kind: SourceKind
  readonly displayName: string
  readonly providerMode: SourceProviderMode
  readonly baseUrl: string | null
  readonly tokenEnvName: string | null
  readonly stalenessThresholdSeconds: number
  readonly retryBackoffSeconds: number
  readonly pollIntervalSeconds: number | null
  /** Cap on backfill window in days. Operators can request more, but
   *  the manager will chunk into <= this many days per run. */
  readonly maxBackfillDays: number
}

/** Per-source defaults — chosen so the dashboard "just works" without env. */
const DEFAULTS: Readonly<Record<SourceKind, Omit<SourceConfig, 'orgId' | 'providerMode' | 'baseUrl' | 'tokenEnvName' | 'kind' | 'displayName'>>> = {
  raw_upstream: {
    stalenessThresholdSeconds: 30 * 60,         // 30 min
    retryBackoffSeconds: 60,
    pollIntervalSeconds: 10 * 60,
    maxBackfillDays: 14,
  },
  portfolio: {
    stalenessThresholdSeconds: 24 * 60 * 60,    // 24h
    retryBackoffSeconds: 5 * 60,
    pollIntervalSeconds: 60 * 60,
    maxBackfillDays: 7,
  },
  catalyst_calendar: {
    stalenessThresholdSeconds: 6 * 60 * 60,     // 6h
    retryBackoffSeconds: 5 * 60,
    pollIntervalSeconds: 60 * 60,
    maxBackfillDays: 30,
  },
  market_data: {
    stalenessThresholdSeconds: 4 * 60 * 60,     // 4h
    retryBackoffSeconds: 60,
    pollIntervalSeconds: 30 * 60,
    maxBackfillDays: 90,
  },
}

const DISPLAY: Readonly<Record<SourceKind, string>> = {
  raw_upstream:      'Research upstream (raw emails)',
  portfolio:         'Portfolio snapshot',
  catalyst_calendar: 'Catalyst calendar',
  market_data:       'Market data + benchmarks',
}

/** Read provider mode from env. Format:
 *   SOURCE_<KIND>_MODE=http|fixture|mock|disabled
 *   SOURCE_<KIND>_BASE_URL=https://api.example.com
 *   SOURCE_<KIND>_TOKEN_ENV=PROVIDER_TOKEN
 *
 * When unset, the source defaults to `fixture` for known kinds in dev,
 * `disabled` in prod. Operators flip a single env var per kind to enable
 * a real provider.
 */
function envKey(kind: SourceKind): string {
  return kind.toUpperCase() // raw_upstream → RAW_UPSTREAM
}

function readMode(kind: SourceKind, env: NodeJS.ProcessEnv): SourceProviderMode {
  const v = env[`SOURCE_${envKey(kind)}_MODE`]
  if (v === 'http' || v === 'fixture' || v === 'mock' || v === 'disabled') return v
  // Default: fixture in dev (NODE_ENV=development | undefined), disabled in prod.
  if (env.NODE_ENV === 'production') return 'disabled'
  return 'fixture'
}

export function buildSourceConfigsForOrg(
  orgId: OrgId,
  env: NodeJS.ProcessEnv = process.env,
): readonly SourceConfig[] {
  const kinds: readonly SourceKind[] = ['raw_upstream', 'portfolio', 'catalyst_calendar', 'market_data']
  return kinds.map<SourceConfig>((kind) => {
    const defaults = DEFAULTS[kind]
    const providerMode = readMode(kind, env)
    return {
      orgId,
      kind,
      displayName: DISPLAY[kind],
      providerMode,
      baseUrl: env[`SOURCE_${envKey(kind)}_BASE_URL`] ?? null,
      tokenEnvName: env[`SOURCE_${envKey(kind)}_TOKEN_ENV`] ?? null,
      ...defaults,
    }
  })
}
