// ─────────────────────────────────────────────────────────────────────────
// HTTP-shape portfolio provider.
//
// Calls a configured upstream that returns a `PortfolioSnapshot`-shaped
// JSON document. The provider is responsible only for the network round-
// trip + idempotent persistence into the canonical store; the existing
// portfolio overlay engine is unchanged.
//
// Wire format (vendor-agnostic): GET <baseUrl>/portfolio-snapshot returns
//   { asOf, positions[], watchlist[], totalGrossExposurePct, ... }
//
// To activate per-org/per-vendor:
//   SOURCE_PORTFOLIO_MODE=http
//   SOURCE_PORTFOLIO_BASE_URL=https://your-portfolio-host
//   SOURCE_PORTFOLIO_TOKEN_ENV=PORTFOLIO_TOKEN
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, PortfolioSnapshot, SourceProviderMode,
} from '../../../../src/domain'
import type { Repo } from '../../persistence'
import type { SyncableProvider, ProviderSyncResult } from '../types'

export interface HttpPortfolioProviderOptions {
  readonly orgId: OrgId
  readonly baseUrl: string
  readonly token: string | null
  readonly repo: Repo
  /** When set, overrides `globalThis.fetch` — used by tests. */
  readonly fetchImpl?: typeof fetch
  /** When set, persistence callback for the snapshot. The default is to
   *  upsert into the InMemoryStore via the canonical store seam. The
   *  manager doesn't know about that store; it only cares the watermark
   *  advances. */
  readonly onSnapshot?: (snap: PortfolioSnapshot) => void
}

export class HttpPortfolioProvider implements SyncableProvider {
  readonly kind = 'portfolio' as const
  readonly providerMode: SourceProviderMode = 'http'

  constructor(private readonly opts: HttpPortfolioProviderOptions) {}

  get orgId(): OrgId { return this.opts.orgId }

  async sync(_args: { watermark: string | null }): Promise<ProviderSyncResult> {
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch
    if (typeof fetchFn !== 'function') {
      throw new Error('HttpPortfolioProvider: no fetch impl available')
    }
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/portfolio-snapshot`
    const headers: Record<string, string> = { 'accept': 'application/json' }
    if (this.opts.token) headers['authorization'] = `Bearer ${this.opts.token}`
    const res = await fetchFn(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const body = await res.json() as PortfolioSnapshot
    if (!body || !body.asOf) {
      throw new Error('HttpPortfolioProvider: response missing required `asOf`')
    }
    if (this.opts.onSnapshot) this.opts.onSnapshot(body)
    const watermarkAfter = body.asOf
    return {
      fetchedCount: 1,
      newCount: 1,
      watermarkAfter,
      outcome: 'success',
    }
  }
}
