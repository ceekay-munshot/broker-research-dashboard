// ─────────────────────────────────────────────────────────────────────────
// Provider factory — given a SourceConfig, returns the right
// SyncableProvider for that (org, kind). Splits cleanly on providerMode:
//
//   http     → HttpXxxProvider (real HTTP-backed)
//   fixture  → FixtureSyncProvider that wraps the existing fixture impls
//   mock     → MockSyncProvider with deterministic stub
//   disabled → returns null, registry skips
//
// The HTTP impls are vendor-agnostic: they speak a small, documented
// shape. Real vendors are adapted by hosting a small shim that emits
// that shape.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, SourceProviderMode, StockTicker, SourceKind,
} from '../../../../src/domain'
import type { Repo } from '../../persistence'
import type { SyncableProvider, ProviderSyncResult } from '../types'
import type { SourceConfig } from '../config'
import { HttpPortfolioProvider } from './HttpPortfolioProvider'
import { HttpCatalystProvider } from './HttpCatalystProvider'
import { HttpMarketDataProvider } from './HttpMarketDataProvider'

export interface FactoryDeps {
  readonly repo: Repo
  /** Function that returns the current ticker universe for market-data. */
  readonly tickersForOrg?: (orgId: OrgId) => readonly StockTicker[]
  /** Override for tests: make HTTP providers fail/respond synthetically. */
  readonly fetchImpl?: typeof fetch
}

export function buildProviderFor(
  config: SourceConfig,
  deps: FactoryDeps,
): SyncableProvider | null {
  const token = config.tokenEnvName ? process.env[config.tokenEnvName] ?? null : null

  switch (config.providerMode) {
    case 'http':
      return buildHttpProvider(config, deps, token)
    case 'fixture':
      return buildFixtureProvider(config)
    case 'mock':
      return buildMockProvider(config)
    case 'disabled':
    default:
      return null
  }
}

function buildHttpProvider(
  config: SourceConfig,
  deps: FactoryDeps,
  token: string | null,
): SyncableProvider {
  if (!config.baseUrl) {
    // We still return a provider that consistently fails — the failure
    // surfaces in the SyncRun history with a clear message.
    return new ConfigErrorProvider(config.kind, config.orgId, 'http', 'baseUrl not configured')
  }
  switch (config.kind) {
    case 'portfolio':
      return new HttpPortfolioProvider({
        orgId: config.orgId, baseUrl: config.baseUrl, token, repo: deps.repo,
        fetchImpl: deps.fetchImpl,
      })
    case 'catalyst_calendar':
      return new HttpCatalystProvider({
        orgId: config.orgId, baseUrl: config.baseUrl, token, repo: deps.repo,
        fetchImpl: deps.fetchImpl,
      })
    case 'market_data':
      return new HttpMarketDataProvider({
        orgId: config.orgId, baseUrl: config.baseUrl, token, repo: deps.repo,
        tickerProvider: () => deps.tickersForOrg?.(config.orgId) ?? [],
        fetchImpl: deps.fetchImpl,
      })
    case 'raw_upstream':
      // Raw upstream is wired via the existing Module-13 SyncRunner. Until
      // that's plugged into this manager, the registry binds a synthetic
      // shim that records "no-op" so health rolls up correctly.
      return new RawUpstreamShim(config.orgId)
  }
}

function buildFixtureProvider(config: SourceConfig): SyncableProvider {
  return new FixtureSyncProvider(config.kind, config.orgId, 'fixture')
}

function buildMockProvider(config: SourceConfig): SyncableProvider {
  return new FixtureSyncProvider(config.kind, config.orgId, 'mock')
}

/** Thin provider that signals "fixture/mock data is being served, no
 *  actual sync needed". The manager records a successful run with
 *  fetched=0/new=0 so freshness stays current; UI labels the source
 *  `degraded` because the mode is non-real. */
class FixtureSyncProvider implements SyncableProvider {
  constructor(
    readonly kind: SourceKind,
    readonly orgId: OrgId,
    readonly providerMode: SourceProviderMode,
  ) {}
  async sync(): Promise<ProviderSyncResult> {
    return {
      fetchedCount: 0,
      newCount: 0,
      watermarkAfter: new Date().toISOString(),
      outcome: 'success',
      note: 'fixture/mock provider — no upstream call performed',
    }
  }
  async backfill(): Promise<ProviderSyncResult> {
    return { fetchedCount: 0, newCount: 0, watermarkAfter: null, outcome: 'skipped', note: 'fixture/mock provider' }
  }
}

class RawUpstreamShim implements SyncableProvider {
  readonly kind = 'raw_upstream' as const
  readonly providerMode: SourceProviderMode = 'http'
  constructor(readonly orgId: OrgId) {}
  async sync(): Promise<ProviderSyncResult> {
    return {
      fetchedCount: 0,
      newCount: 0,
      watermarkAfter: new Date().toISOString(),
      outcome: 'success',
      note: 'raw upstream sync runs via the existing Module-13 SyncRunner; this entry tracks status only',
    }
  }
}

class ConfigErrorProvider implements SyncableProvider {
  constructor(
    readonly kind: SourceKind,
    readonly orgId: OrgId,
    readonly providerMode: SourceProviderMode,
    private readonly reason: string,
  ) {}
  async sync(): Promise<ProviderSyncResult> {
    throw new Error(`config error: ${this.reason}`)
  }
}
