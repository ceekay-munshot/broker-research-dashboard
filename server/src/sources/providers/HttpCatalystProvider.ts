// ─────────────────────────────────────────────────────────────────────────
// HTTP-shape catalyst-calendar provider.
//
// Calls a configured upstream that returns a list of `CatalystEvent`s
// either since a watermark or within a backfill window. The watermark is
// the most-recent `expectedAt` we've seen.
//
// To activate:
//   SOURCE_CATALYST_CALENDAR_MODE=http
//   SOURCE_CATALYST_CALENDAR_BASE_URL=https://your-calendar-host
//   SOURCE_CATALYST_CALENDAR_TOKEN_ENV=CALENDAR_TOKEN
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, CatalystEvent, SourceProviderMode,
} from '../../../../src/domain'
import type { Repo } from '../../persistence'
import type { SyncableProvider, ProviderSyncResult, ProviderBackfillResult } from '../types'

export interface HttpCatalystProviderOptions {
  readonly orgId: OrgId
  readonly baseUrl: string
  readonly token: string | null
  readonly repo: Repo
  readonly fetchImpl?: typeof fetch
  readonly onCatalysts?: (events: readonly CatalystEvent[]) => void
}

export class HttpCatalystProvider implements SyncableProvider {
  readonly kind = 'catalyst_calendar' as const
  readonly providerMode: SourceProviderMode = 'http'

  constructor(private readonly opts: HttpCatalystProviderOptions) {}

  get orgId(): OrgId { return this.opts.orgId }

  async sync(args: { watermark: string | null }): Promise<ProviderSyncResult> {
    const url = this.url('catalysts', { since: args.watermark ?? undefined })
    const events = await this.fetchEvents(url)
    if (this.opts.onCatalysts) this.opts.onCatalysts(events)
    const watermarkAfter = events.length
      ? events.reduce<string>((acc, e) => e.expectedAt > acc ? e.expectedAt : acc, args.watermark ?? '')
      : args.watermark
    return {
      fetchedCount: events.length,
      newCount: events.length,
      watermarkAfter: watermarkAfter || null,
      outcome: events.length > 0 ? 'success' : 'success',
      note: events.length === 0 ? 'no new catalyst events' : undefined,
    }
  }

  async backfill(args: { fromIso: string; toIso: string }): Promise<ProviderBackfillResult> {
    const url = this.url('catalysts', { from: args.fromIso, to: args.toIso })
    const events = await this.fetchEvents(url)
    if (this.opts.onCatalysts) this.opts.onCatalysts(events)
    return {
      fetchedCount: events.length,
      newCount: events.length,
      watermarkAfter: null,
      outcome: 'success',
    }
  }

  private url(path: string, q: Record<string, string | undefined>): string {
    const base = `${this.opts.baseUrl.replace(/\/$/, '')}/${path}`
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) search.set(k, v)
    const qs = search.toString()
    return qs ? `${base}?${qs}` : base
  }

  private async fetchEvents(url: string): Promise<readonly CatalystEvent[]> {
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') throw new Error('HttpCatalystProvider: no fetch impl available')
    const headers: Record<string, string> = { 'accept': 'application/json' }
    if (this.opts.token) headers['authorization'] = `Bearer ${this.opts.token}`
    const res = await fetchFn(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const body = await res.json() as { items?: readonly CatalystEvent[] }
    if (!body || !Array.isArray(body.items)) {
      throw new Error('HttpCatalystProvider: response missing required `items[]`')
    }
    return body.items
  }
}
