// Slack channel — uses Slack's incoming-webhook URL pattern. The webhook
// URL is the secret; the env var name is read from config.

import type {
  DeliveryChannelImpl, ChannelSendInputs, ChannelSendResult,
} from '../types'
import type { DeliveryErrorCategory } from '../../../../src/domain'

export interface SlackChannelOptions {
  readonly enabled: boolean
  readonly webhookUrlEnvName: string | null
  readonly fetchImpl?: typeof fetch
}

export class SlackChannel implements DeliveryChannelImpl {
  readonly channel = 'slack' as const
  readonly available: boolean
  readonly description: string

  constructor(private readonly opts: SlackChannelOptions) {
    const url = opts.webhookUrlEnvName ? process.env[opts.webhookUrlEnvName] : undefined
    this.available = !!opts.enabled && !!url
    this.description = this.available
      ? `slack via webhook (env=${opts.webhookUrlEnvName})`
      : 'slack (stub — set DELIVERY_SLACK_ENABLED=1 + DELIVERY_SLACK_WEBHOOK_URL_ENV pointing at a Slack webhook env var)'
  }

  async send(input: ChannelSendInputs): Promise<ChannelSendResult> {
    const t0 = Date.now()
    const url = this.opts.webhookUrlEnvName ? process.env[this.opts.webhookUrlEnvName] : undefined
    if (!url) {
      // eslint-disable-next-line no-console
      console.log(`[slack-stub] channel=${input.target.address} subject="${input.payload.subject}"`)
      return { ok: true, latencyMs: Date.now() - t0 }
    }
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return errorResult('config', 'no fetch impl available', t0)
    const body = input.payload.slackBlocks
      ? { blocks: input.payload.slackBlocks, channel: input.target.address }
      : { text: input.payload.markdown ?? input.payload.text, channel: input.target.address }
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const cat: DeliveryErrorCategory =
          res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 429 ? 'rate_limit'
          : res.status >= 500 ? 'transient_5xx' : 'unknown'
        return { ok: false, latencyMs: Date.now() - t0, errorCategory: cat, errorMessage: `HTTP ${res.status}` }
      }
      return { ok: true, latencyMs: Date.now() - t0 }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return errorResult('transient_network', message, t0)
    }
  }
}

function errorResult(category: DeliveryErrorCategory, message: string, t0: number): ChannelSendResult {
  return { ok: false, latencyMs: Date.now() - t0, errorCategory: category, errorMessage: message }
}
