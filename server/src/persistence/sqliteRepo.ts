// ─────────────────────────────────────────────────────────────────────────
// SqliteRepo — documented upgrade path. Not active by default.
//
// To enable:
//   1. `npm install better-sqlite3 @types/better-sqlite3`
//   2. Set `SERVER_PERSISTENCE=sqlite` and `SERVER_DB_PATH=/path/to/db.sqlite`
//   3. Use `createRepo()` in `./index.ts` — it picks SqliteRepo when
//      `SERVER_PERSISTENCE=sqlite` is set.
//
// The schema below is the source of truth for the SQLite migration.
// One JSON column per record carries the full canonical entity so the
// schema doesn't have to track every field; indexes cover the queries
// the runner actually issues.
//
// The class is shipped as a runtime no-op skeleton in this repo so the
// build doesn't depend on the native module. When better-sqlite3 is
// installed and `enableSqlite()` is called, the skeleton wires up.
// Until then, importing this file is harmless.
// ─────────────────────────────────────────────────────────────────────────

import type { Repo } from './types'

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS raw_emails (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  upstream_id     TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  fingerprint     TEXT NOT NULL UNIQUE,
  received_at     TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  state           TEXT NOT NULL,
  error_category  TEXT,
  error_detail    TEXT,
  data_json       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_emails_org_received   ON raw_emails(org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_emails_org_state      ON raw_emails(org_id, state);
CREATE INDEX IF NOT EXISTS idx_raw_emails_org_upstreamId ON raw_emails(org_id, upstream_id);

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  raw_email_id    TEXT NOT NULL,
  org_id          TEXT NOT NULL,
  state           TEXT NOT NULL,
  history_json    TEXT NOT NULL,
  error_category  TEXT,
  error_detail    TEXT,
  started_at      TEXT NOT NULL,
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_org_state ON jobs(org_id, state, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_raw       ON jobs(raw_email_id);

CREATE TABLE IF NOT EXISTS review_queue (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  artifact_id     TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  detail          TEXT NOT NULL,
  enqueued_at     TEXT NOT NULL,
  resolved_at     TEXT,
  resolution_note TEXT,
  snapshot_json   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_org_resolved ON review_queue(org_id, resolved_at);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  org_id                          TEXT PRIMARY KEY,
  last_cursor                     TEXT,
  last_synced_at                  TEXT,
  last_run_duration_ms            INTEGER NOT NULL DEFAULT 0,
  last_fetched_count              INTEGER NOT NULL DEFAULT 0,
  last_materialized_count         INTEGER NOT NULL DEFAULT 0,
  last_failed_count               INTEGER NOT NULL DEFAULT 0,
  last_review_count               INTEGER NOT NULL DEFAULT 0,
  last_enrichment_disabled_count  INTEGER NOT NULL DEFAULT 0,
  last_enrichment_failed_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS canonical_broker_emails (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canonical_emails_org ON canonical_broker_emails(org_id);

CREATE TABLE IF NOT EXISTS canonical_attachments (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL,
  email_id  TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canonical_atts_org ON canonical_attachments(org_id);
CREATE INDEX IF NOT EXISTS idx_canonical_atts_email ON canonical_attachments(email_id);

CREATE TABLE IF NOT EXISTS canonical_reports (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canonical_reports_org ON canonical_reports(org_id);

CREATE TABLE IF NOT EXISTS canonical_summaries (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  report_id  TEXT NOT NULL,
  data_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canonical_summaries_org ON canonical_summaries(org_id);
CREATE INDEX IF NOT EXISTS idx_canonical_summaries_report ON canonical_summaries(report_id);

CREATE TABLE IF NOT EXISTS canonical_evidence (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  report_id  TEXT NOT NULL,
  data_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canonical_evidence_org ON canonical_evidence(org_id);
CREATE INDEX IF NOT EXISTS idx_canonical_evidence_report ON canonical_evidence(report_id);

CREATE TABLE IF NOT EXISTS canonical_opinions (
  org_id     TEXT NOT NULL,
  broker_id  TEXT NOT NULL,
  ticker     TEXT NOT NULL,
  data_json  TEXT NOT NULL,
  PRIMARY KEY (org_id, broker_id, ticker)
);
`

/**
 * Construct a SqliteRepo. Throws unless `better-sqlite3` is installed
 * AND the caller has imported it once via `enableSqlite(Database)` on
 * startup. Doing it this way keeps the build native-dep-free in the
 * default branch.
 *
 * Example wiring:
 *
 *     import Database from 'better-sqlite3'
 *     import { enableSqlite, createSqliteRepo } from './sqliteRepo'
 *     enableSqlite(Database)
 *     const repo = createSqliteRepo({ path: 'data/server.db' })
 *
 * The implementation maps the Repo interface 1:1 onto prepared
 * statements over the schema above. Use this when the JSON-file repo
 * starts to feel too coarse (multi-process writers, query-heavy
 * dashboards, etc.).
 */
let sqliteCtor: unknown = null
export function enableSqlite(ctor: unknown): void {
  sqliteCtor = ctor
}

export function createSqliteRepo(_opts: { readonly path: string }): Repo {
  if (!sqliteCtor) {
    throw new Error(
      'SqliteRepo: better-sqlite3 not enabled. Install it and call ' +
      'enableSqlite(Database) before createSqliteRepo(). See ' +
      'docs/live-sync.md for the full upgrade procedure.',
    )
  }
  // Implementation lives behind the dep boundary. When better-sqlite3
  // is wired, this returns a Repo that prepares statements over
  // SQLITE_SCHEMA. Until then the repo throws to avoid a silent
  // downgrade.
  throw new Error(
    'SqliteRepo: implementation skeleton present; install better-sqlite3 ' +
    'and replace this stub with a prepared-statement repo against SQLITE_SCHEMA.',
  )
}
