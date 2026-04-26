// ─────────────────────────────────────────────────────────────────────────
// Pure rollout-state derivation.
//
// Inputs:
//   - effective feature flags
//   - effective integration configs (which sources are real-mode)
//   - sources health snapshot (any failing → degraded)
//
// Output: a single `RolloutState` describing where the org is in the
// rollout journey. The operator UI + ROI snapshot consume this.
// ─────────────────────────────────────────────────────────────────────────

import type {
  RolloutState, FeatureFlagAssignment, OrgIntegrationConfig,
  SourcesHealthSnapshot, FeatureFlagKey,
} from '../../../src/domain'

export interface DeriveArgs {
  readonly featureFlags: readonly FeatureFlagAssignment[]
  readonly integrations: readonly OrgIntegrationConfig[]
  readonly sourcesHealth: SourcesHealthSnapshot | null
  /** Optional explicit operator override — wins when set. */
  readonly override?: RolloutState | null
}

const DELIVERY_FLAGS: readonly FeatureFlagKey[] = [
  'delivery.email.enabled',
  'delivery.slack.enabled',
  'delivery.webhook.enabled',
]

export function deriveRolloutState(args: DeriveArgs): RolloutState {
  // Sources failing → degraded, regardless of other flags.
  const anyFailing = args.sourcesHealth?.sources.some((s) => s.status === 'failing') ?? false
  if (anyFailing) return 'degraded'

  if (args.override) return args.override

  const flag = (key: FeatureFlagKey): boolean =>
    args.featureFlags.find((f) => f.key === key)?.enabled ?? false

  const adaptiveOn  = flag('adaptive_ranking.enabled')
  const compareOn   = flag('adaptive_ranking.show_compare')
  const anyDelivery = DELIVERY_FLAGS.some((k) => flag(k))
  const anyRealSource = args.integrations.some((i) => i.mode === 'http')
  const allHealthy = args.sourcesHealth?.sources.every((s) => s.status === 'healthy') ?? false

  if (adaptiveOn && anyDelivery && anyRealSource && allHealthy) return 'production'
  if (anyDelivery) return 'delivery_on'
  if (adaptiveOn) return 'adaptive_on'
  if (compareOn)  return 'compare_only'
  return 'pilot'
}
