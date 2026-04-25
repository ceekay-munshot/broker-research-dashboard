// Public surface of the persistence layer.

export type {
  Repo,
  PersistedRawEmail, PersistedJob, PersistedReviewItem,
  SyncCheckpoint,
} from './types'
export { InMemoryRepo } from './inMemoryRepo'
export { JsonFileRepo, type JsonFileRepoOptions } from './jsonFileRepo'
export {
  SQLITE_SCHEMA, enableSqlite, createSqliteRepo,
} from './sqliteRepo'
export {
  rawEmailFingerprint, linkedArtifactFingerprint, attachmentFingerprint,
} from './idempotency'
export { HybridCanonicalStore } from './HybridCanonicalStore'
import type { Repo } from './types'
import { JsonFileRepo } from './jsonFileRepo'
import { InMemoryRepo } from './inMemoryRepo'

/** Default repo factory driven by env:
 *   SERVER_PERSISTENCE = file (default) | memory | sqlite
 *   SERVER_DATA_DIR    = ./data/server  (file mode)
 *   SERVER_DB_PATH     = ./data/server.db (sqlite mode)
 *
 *  Tests instantiate `InMemoryRepo` directly. */
export function createDefaultRepo(): Repo {
  const mode = (process.env.SERVER_PERSISTENCE ?? 'file').toLowerCase()
  switch (mode) {
    case 'memory':
      return new InMemoryRepo()
    case 'sqlite': {
      // Lazy require so the build doesn't pull in the optional dep.
      // Caller must have run `enableSqlite()` first.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createSqliteRepo } = require('./sqliteRepo')
      return createSqliteRepo({ path: process.env.SERVER_DB_PATH ?? './data/server.db' })
    }
    case 'file':
    default:
      return new JsonFileRepo({ dir: process.env.SERVER_DATA_DIR ?? './data/server' })
  }
}
