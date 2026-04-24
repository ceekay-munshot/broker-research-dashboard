// ─────────────────────────────────────────────────────────────────────────
// Fixture source — JSON payloads that mirror what the external upstream
// API is expected to return.
//
// Loaded via static imports so both Vite (browser, `upstream-fixture` mode)
// and tsx (contract tests) resolve the same bytes.
//
// Each key matches a `RESOURCE_CATALOG` entry in `./degraded.ts` and a
// fixture filename in `./fixtures/`.
// ─────────────────────────────────────────────────────────────────────────

import sessionScope      from './fixtures/session-scope.json'
import organization      from './fixtures/organization.json'
import me                from './fixtures/me.json'
import brokers           from './fixtures/brokers.json'
import sectors           from './fixtures/sectors.json'
import stocks            from './fixtures/stocks.json'
import brokerEmails      from './fixtures/broker-emails.json'
import attachments       from './fixtures/attachments.json'
import researchReports   from './fixtures/research-reports.json'
import reportSummary     from './fixtures/report-summary.json'
import evidence          from './fixtures/evidence.json'
import opinions          from './fixtures/opinions.json'
import conflictClosure   from './fixtures/conflict-closure.json'
import conflictClosures  from './fixtures/conflict-closures.json'
import sectorIntelligence from './fixtures/sector-intelligence.json'
import kpiSnapshot       from './fixtures/kpi-snapshot.json'
import ingestionStatus   from './fixtures/ingestion-status.json'

export const UPSTREAM_FIXTURES = {
  sessionScope,
  organization,
  me,
  brokers,
  sectors,
  stocks,
  brokerEmails,
  attachments,
  researchReports,
  reportSummary,
  evidence,
  opinions,
  conflictClosure,
  conflictClosures,
  sectorIntelligence,
  kpiSnapshot,
  ingestionStatus,
} as const

export type UpstreamFixtureKey = keyof typeof UPSTREAM_FIXTURES

/** Deep-clone a fixture so consumers cannot mutate shared JSON. Small
 *  enough payloads that `JSON.parse(JSON.stringify(…))` is fine. */
export function cloneFixture<K extends UpstreamFixtureKey>(key: K): unknown {
  return JSON.parse(JSON.stringify(UPSTREAM_FIXTURES[key]))
}
