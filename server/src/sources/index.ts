// Barrel for the Module-24 source-integration layer.

export { SourceManager } from './manager'
export type { ManagerDeps } from './manager'
export { SourceRegistry } from './registry'
export {
  computeSourceIntegration, sourceIdFor, rollupOverallStatus,
} from './health'
export type { ComputeHealthInputs } from './health'
export { buildSourceConfigsForOrg } from './config'
export type { SourceConfig } from './config'
export { buildProviderFor } from './providers/factory'
export type { FactoryDeps } from './providers/factory'
export type {
  SyncableProvider, ProviderSyncResult, ProviderBackfillResult, ManagerSnapshot,
} from './types'
export { HttpPortfolioProvider } from './providers/HttpPortfolioProvider'
export { HttpCatalystProvider } from './providers/HttpCatalystProvider'
export { HttpMarketDataProvider } from './providers/HttpMarketDataProvider'

// Convenience: wire a registry from a fresh-built config + factory deps.
import type { OrgId } from '../../../src/domain'
import { SourceRegistry } from './registry'
import { buildSourceConfigsForOrg } from './config'
import { buildProviderFor, type FactoryDeps } from './providers/factory'

export function buildRegistryForOrgs(
  orgIds: readonly OrgId[],
  deps: FactoryDeps,
  env: NodeJS.ProcessEnv = process.env,
): SourceRegistry {
  const registry = new SourceRegistry()
  for (const orgId of orgIds) {
    for (const cfg of buildSourceConfigsForOrg(orgId, env)) {
      const provider = buildProviderFor(cfg, deps)
      if (provider) registry.register(cfg, provider)
    }
  }
  return registry
}
