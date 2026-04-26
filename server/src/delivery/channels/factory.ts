// Build the four channel implementations from env-driven config.

import type { DeliveryChannelConfig } from '../../../../src/domain'
import type { DeliveryChannelImpl } from '../types'
import { InAppChannel } from './InAppChannel'
import { EmailChannel } from './EmailChannel'
import { SlackChannel } from './SlackChannel'
import { WebhookChannel } from './WebhookChannel'

export interface BuildChannelsOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly fetchImpl?: typeof fetch
}

export function buildChannels(
  configs: readonly DeliveryChannelConfig[],
  opts: BuildChannelsOptions = {},
): readonly DeliveryChannelImpl[] {
  const env = opts.env ?? process.env
  const cfg = (k: DeliveryChannelConfig['channel']): DeliveryChannelConfig | null =>
    configs.find((c) => c.channel === k) ?? null

  const inApp = new InAppChannel()

  const emailCfg = cfg('email')
  const email = new EmailChannel({
    enabled: !!emailCfg?.enabled,
    host: emailCfg?.baseUrl ?? null,
    tokenEnvName: emailCfg?.secretEnvName ?? null,
    from: env.DELIVERY_EMAIL_FROM ?? 'no-reply@broker-research.local',
    fetchImpl: opts.fetchImpl,
  })

  const slackCfg = cfg('slack')
  const slack = new SlackChannel({
    enabled: !!slackCfg?.enabled,
    webhookUrlEnvName: slackCfg?.secretEnvName ?? null,
    fetchImpl: opts.fetchImpl,
  })

  const webhookCfg = cfg('webhook')
  const webhook = new WebhookChannel({
    enabled: !!webhookCfg?.enabled,
    defaultUrl: webhookCfg?.baseUrl ?? null,
    tokenEnvName: webhookCfg?.secretEnvName ?? null,
    fetchImpl: opts.fetchImpl,
  })

  return [inApp, email, slack, webhook]
}
