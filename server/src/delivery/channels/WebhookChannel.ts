// Webhook channel — POSTs the payload's structured `webhookJson` (or a
// fallback shape) to the configured URL. Real fetch.

import type {
  DeliveryChannelImpl, ChannelSendInputs, ChannelSendResult,
} from '../types'
import type { DeliveryErrorCategory } from '../../../../src/domain'

export interface WebhookChannelOptions {
  readonly enabled: boolean
  readonly defaultUrl: string | null
  readonly tokenEnvName: string | null
  readonly fetchImpl?: typeof fetch
}

export class WebhookChannel implements DeliveryChannelImpl {
  readonly channel = 'webhook' as const
  readonly available: boolean
  readonly description: string

  constructor(private readonly opts: WebhookChannelOptions) {
    this.available = opts.enabled && !!opts.defaultUrl
    this.description = this.available
      ? `webhook → ${opts.defaultUrl}`
      : 'webhook (stub — set DELIVERY_WEBHOOK_ENABLED=1 + DELIVERY_WEBHOOK_URL)'
  }

  async send(input: ChannelSendInputs): Promise<ChannelSendResult> {
    const t0 = Date.now()
    // Per-target URL takes precedence; otherwise use the configured default.
    const url = (input.target.address && /^https?:\/\//.test(input.target.address))
      ? input.target.address
      : (this.opts.defaultUrl ?? null)
    if (!url) return errorResult('config', 'no webhook url configured', t0)

    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return errorResult('config', 'no fetch impl available', t0)
    const token = this.opts.tokenEnvName ? process.env[this.opts.tokenEnvName] : undefined
    const body = input.payload.webhookJson ?? {
      orgId: input.orgId as unknown as string,
      contentKind: input.payload.contentKind,
      subject: input.payload.subject,
      summary: input.payload.summary,
      text: input.payload.text,
      clickThrough: input.payload.clickThrough,
    }
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-broker-research-content-kind': input.payload.contentKind,
        },
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
