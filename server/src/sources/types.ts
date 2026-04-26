// Internal types for the source manager — not part of the wire contract.

import type {
  OrgId, SourceKind, SourceProviderMode, SourceSyncRun, SourceWatermark,
  BackfillJob, SourceError,
} from '../../../src/domain'
import type { SourceConfig } from './config'

/** Result returned by a `SyncableProvider.sync()` call. */
export interface ProviderSyncResult {
  /** Items fetched (provider-defined unit). */
  readonly fetchedCount: number
  /** Items new since the last watermark (idempotent dedupe). */
  readonly newCount: number
  /** New watermark after the sync. Null = leave unchanged. */
  readonly watermarkAfter: string | null
  /** When `partial`, the manager keeps the source healthy but logs a note. */
  readonly outcome: 'success' | 'partial' | 'skipped'
  /** Optional human-readable note ("no new items", "skipped: provider disabled"). */
  readonly note?: string
}

/** Backfill-window result, same shape as ProviderSyncResult. */
export type ProviderBackfillResult = ProviderSyncResult

/** A source provider that the manager can invoke. Each kind has one
 *  provider per org. The provider handles the actual I/O. */
export interface SyncableProvider {
  readonly kind: SourceKind
  readonly orgId: OrgId
  readonly providerMode: SourceProviderMode
  /** Incremental sync from the persisted watermark. */
  sync(args: { watermark: string | null }): Promise<ProviderSyncResult>
  /** Bounded-window backfill. Provider may chunk internally. */
  backfill?(args: { fromIso: string; toIso: string }): Promise<ProviderBackfillResult>
}

/** Returned by `SourceManager.snapshot()` — the in-memory view used
 *  by the adapter to build `SourcesHealthSnapshot`. */
export interface ManagerSnapshot {
  readonly orgId: OrgId
  readonly configs: readonly SourceConfig[]
  readonly recentRunsBySource: ReadonlyMap<string, readonly SourceSyncRun[]>
  readonly watermarksBySource: ReadonlyMap<string, SourceWatermark | null>
  readonly backfillsBySource: ReadonlyMap<string, readonly BackfillJob[]>
  readonly lastErrorBySource: ReadonlyMap<string, SourceError | null>
}
