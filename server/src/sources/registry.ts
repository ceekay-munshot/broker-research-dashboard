// ─────────────────────────────────────────────────────────────────────────
// Source registry — binds (orgId, kind) → SyncableProvider.
//
// Built once at server boot from `buildSourceConfigsForOrg` + the provider
// factory. The CLI + manager look providers up here.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, SourceKind } from '../../../src/domain'
import type { SyncableProvider } from './types'
import type { SourceConfig } from './config'

interface RegistryEntry {
  readonly config: SourceConfig
  readonly provider: SyncableProvider
}

export class SourceRegistry {
  private readonly entries = new Map<string, RegistryEntry>()

  register(config: SourceConfig, provider: SyncableProvider): void {
    this.entries.set(this.key(config.orgId, config.kind), { config, provider })
  }

  has(orgId: OrgId, kind: SourceKind): boolean {
    return this.entries.has(this.key(orgId, kind))
  }

  get(orgId: OrgId, kind: SourceKind): RegistryEntry | null {
    return this.entries.get(this.key(orgId, kind)) ?? null
  }

  listForOrg(orgId: OrgId): readonly RegistryEntry[] {
    const out: RegistryEntry[] = []
    for (const e of this.entries.values()) {
      if (e.config.orgId === orgId) out.push(e)
    }
    return out
  }

  listAll(): readonly RegistryEntry[] {
    return [...this.entries.values()]
  }

  private key(orgId: OrgId, kind: SourceKind): string {
    return `${orgId as unknown as string}::${kind}`
  }
}
