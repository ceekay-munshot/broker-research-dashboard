// Email channel — production-shape. When DELIVERY_EMAIL_HOST + a token env
// are configured, sends via SMTP-shaped JSON HTTP POST (most providers
// expose this — SendGrid, Mailgun, Resend). Without config, it's a
// console-logging stub so operators can preview the flow.

import type {
  DeliveryChannelImpl, ChannelSendInputs, ChannelSendResult,
} from '../types'
import type { DeliveryErrorCategory } from '../../../../src/domain'

export interface EmailChannelOptions {
  readonly enabled: boolean
  readonly host: string | null
  readonly tokenEnvName: string | null
  readonly from: string
  readonly fetchImpl?: typeof fetch
}

export class EmailChannel implements DeliveryChannelImpl {
  readonly channel = 'email' as const
  readonly available: boolean
  readonly description: string

  constructor(private readonly opts: EmailChannelOptions) {
    this.available = opts.enabled
    this.description = opts.enabled && opts.host
      ? `email via ${opts.host} (token env=${opts.tokenEnvName ?? '(none)'})`
      : 'email (stub — set DELIVERY_EMAIL_ENABLED=1 + DELIVERY_EMAIL_HOST to wire real SMTP gateway)'
  }

  async send(input: ChannelSendInputs): Promise<ChannelSendResult> {
    const t0 = Date.now()
    if (!this.opts.host) {
      // Stub mode: log the body so operators can verify what would have shipped.
      // eslint-disable-next-line no-console
      console.log(`[email-stub] to=${input.target.address} subject="${input.payload.subject}" — body suppressed`)
      return { ok: true, latencyMs: Date.now() - t0 }
    }
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return errorResult('config', 'no fetch impl available', t0)
    const token = this.opts.tokenEnvName ? process.env[this.opts.tokenEnvName] : undefined
    const body = {
      from: this.opts.from,
      to: input.target.address,
      subject: input.payload.subject,
      text: input.payload.text,
      html: input.payload.markdown ?? null,
    }
    try {
      const res = await fetchFn(`${this.opts.host.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
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
