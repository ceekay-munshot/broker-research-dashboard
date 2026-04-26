// ─────────────────────────────────────────────────────────────────────────
// Module 25 — Delivery channel + subscription config.
//
// Read from process env at server startup so operators can flip channels
// on/off + add subscribers without code changes. The shape is:
//
//   DELIVERY_<CHANNEL>_ENABLED=1
//   DELIVERY_EMAIL_FROM=alerts@yourorg.com
//   DELIVERY_SLACK_WEBHOOK_URL_ENV=SLACK_WEBHOOK_URL    (env var holding the secret)
//   DELIVERY_WEBHOOK_URL=https://your-host/...           (one default per org for demo)
//
//   DELIVERY_SUB_<KIND>_TARGETS=in_app:user_arjun,email:pm@aranyacap.com,slack:#research
//   DELIVERY_SUB_<KIND>_MIN_SEVERITY=high
//   DELIVERY_SUB_<KIND>_HELD_ONLY=1
//
// Where <KIND> is one of:
//   MORNING_BOOK_BRIEF / INTRADAY_CRITICAL / COVERAGE_HYGIENE /
//   WEEKLY_CATALYST_BRIEF / SOURCE_HEALTH_INCIDENT.
//
// All channels default to in-app only, which is the safe rollout state.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, DeliveryChannelConfig, DeliveryContentKind,
  DeliveryTarget, WorkflowSubscription, AlertSeverity,
} from '../../../src/domain'
import { DELIVERY_CONTENT_KINDS } from '../../../src/domain'
import {
  asDeliveryTargetId, asSubscriptionId, asUserId,
} from '../../../src/lib/ids'

type WorkflowChannel = 'in_app' | 'email' | 'slack' | 'webhook'
export function buildChannelConfigs(env: NodeJS.ProcessEnv = process.env): readonly DeliveryChannelConfig[] {
  const channels: readonly WorkflowChannel[] = ['in_app', 'email', 'slack', 'webhook']
  return channels.map<DeliveryChannelConfig>((channel) => {
    const enabledFlag = env[`DELIVERY_${channel.toUpperCase()}_ENABLED`]
    // in_app is enabled unconditionally — it requires no secret + always works.
    const enabled = channel === 'in_app' ? true : (enabledFlag === '1' || enabledFlag === 'true')
    const secretEnvName = (() => {
      switch (channel) {
        case 'email':   return env.DELIVERY_EMAIL_TOKEN_ENV ?? null
        case 'slack':   return env.DELIVERY_SLACK_WEBHOOK_URL_ENV ?? null
        case 'webhook': return env.DELIVERY_WEBHOOK_TOKEN_ENV ?? null
        default:        return null
      }
    })()
    const baseUrl = (() => {
      switch (channel) {
        case 'email':   return env.DELIVERY_EMAIL_HOST ?? null
        case 'slack':   return null  // url is the secret itself
        case 'webhook': return env.DELIVERY_WEBHOOK_URL ?? null
        default:        return null
      }
    })()
    return { channel, enabled, secretEnvName, baseUrl }
  })
}

/** Parse a comma-separated `targets=` value into structured targets.
 *  Format per item: `<channel>:<address>` — e.g. `in_app:usr_arjun`,
 *  `email:pm@aranya.com`, `slack:#research`, `webhook:default`. */
function parseTargets(orgId: OrgId, raw: string | undefined): readonly DeliveryTarget[] {
  if (!raw) return []
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.map<DeliveryTarget | null>((p) => {
    const idx = p.indexOf(':')
    if (idx < 0) return null
    const ch = p.slice(0, idx)
    const address = p.slice(idx + 1).trim()
    if (!isWorkflowChannel(ch) || !address) return null
    const channel: WorkflowChannel = ch
    const userId = channel === 'in_app' ? asUserId(address) : null
    return {
      id: asDeliveryTargetId(`${orgId as unknown as string}::${channel}::${address}`),
      orgId,
      channel,
      label: address,
      address,
      userId,
      enabled: true,
    }
  }).filter((t): t is DeliveryTarget => t !== null)
}

function isWorkflowChannel(s: string): s is WorkflowChannel {
  return s === 'in_app' || s === 'email' || s === 'slack' || s === 'webhook'
}

function envKey(kind: DeliveryContentKind): string {
  return kind.toUpperCase()
}

function parseSeverity(raw: string | undefined): AlertSeverity | undefined {
  if (raw === 'critical' || raw === 'high' || raw === 'medium' || raw === 'low' || raw === 'info') return raw
  return undefined
}

/** Per-org default subscriptions when no env override exists. We always
 *  send everything to the in-app inbox so operators can preview the
 *  system end-to-end without external channels. */
function defaultTargets(orgId: OrgId, env: NodeJS.ProcessEnv): Record<DeliveryContentKind, readonly DeliveryTarget[]> {
  const envFromGlobal = env.DELIVERY_DEFAULT_INAPP_USER ?? 'usr_default'
  const inApp: DeliveryTarget = {
    id: asDeliveryTargetId(`${orgId as unknown as string}::in_app::${envFromGlobal}`),
    orgId,
    channel: 'in_app',
    label: 'In-app inbox',
    address: envFromGlobal,
    userId: asUserId(envFromGlobal),
    enabled: true,
  }
  const all: DeliveryTarget[] = [inApp]
  const out = {} as Record<DeliveryContentKind, readonly DeliveryTarget[]>
  for (const kind of DELIVERY_CONTENT_KINDS) out[kind] = all
  return out
}

export function buildSubscriptionsForOrg(
  orgId: OrgId,
  env: NodeJS.ProcessEnv = process.env,
): readonly WorkflowSubscription[] {
  const defaults = defaultTargets(orgId, env)
  return DELIVERY_CONTENT_KINDS.map<WorkflowSubscription>((kind) => {
    const key = envKey(kind)
    const overridden = parseTargets(orgId, env[`DELIVERY_SUB_${key}_TARGETS`])
    const targets = overridden.length > 0 ? overridden : defaults[kind]
    const minSeverity = parseSeverity(env[`DELIVERY_SUB_${key}_MIN_SEVERITY`])
    const heldOnly = env[`DELIVERY_SUB_${key}_HELD_ONLY`] === '1'
    const watchlistAllowed = env[`DELIVERY_SUB_${key}_WATCHLIST_ALLOWED`] !== '0'
    const enabledFlag = env[`DELIVERY_SUB_${key}_ENABLED`]
    const enabled = enabledFlag === undefined ? true : (enabledFlag === '1' || enabledFlag === 'true')
    return {
      id: asSubscriptionId(`${orgId as unknown as string}::${kind}`),
      orgId,
      contentKind: kind,
      targets,
      filters: { minSeverity, heldOnly, watchlistAllowed },
      enabled,
    }
  })
}
