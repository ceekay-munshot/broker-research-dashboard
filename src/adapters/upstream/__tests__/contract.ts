#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Upstream contract test harness.
//
// Runs every fixture in `../fixtures/` through its corresponding mapper
// and asserts:
//   - the mapper doesn't throw (fixture matches the expected shape)
//   - the canonical output has the fields the dashboard reads from
//   - orgId consistency holds across resources scoped to the same org
//   - every resource in `RESOURCE_CATALOG` has a fixture and a mapper
//
// Exits 0 on all-pass, 1 on any failure with a summary. Designed to be
// the `npm run test:contract` target — the same command the external API
// team can run against their payloads to verify compatibility.
// ─────────────────────────────────────────────────────────────────────────

import { RESOURCE_CATALOG, UPSTREAM_FIXTURES } from '../index'
import {
  mapOrgScope, mapOrganization, mapUser,
  mapBrokers, mapSectors, mapStocks,
  mapBrokerEmail, mapBrokerEmailsPage, mapAttachments,
  mapResearchReport, mapResearchReportsPage, mapReportSummary, mapEvidenceSnippets,
  mapBrokerStockOpinions,
  mapConflictClosure, mapConflictClosures,
  mapSectorIntelligence, mapSectorIntelligenceList,
  mapKpiSnapshot, mapIngestionStatus,
} from '../mappers'
import { ContractViolationError, OrgScopeViolationError } from '../../errors'

interface TestResult {
  readonly name: string
  readonly ok: boolean
  readonly message?: string
}

const results: TestResult[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    results.push({ name, ok: false, message: msg })
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

// ── Fixture → mapper map (sanity: every catalog entry has a fixture). ─────
test('RESOURCE_CATALOG entries all have fixtures', () => {
  for (const spec of RESOURCE_CATALOG) {
    // Some catalog entries represent endpoint *shapes* that share a fixture
    // (e.g. `brokerEmail` is a single-item view of `brokerEmails`). Skip
    // those; the important invariant is that every list/aggregate has a
    // loadable fixture.
    const key = spec.key
    const aliasedToList: Record<string, keyof typeof UPSTREAM_FIXTURES> = {
      currentUser: 'me',
      brokerEmail: 'brokerEmails',
      researchReport: 'researchReports',
      reportEvidence: 'evidence',
      sectorIntelligenceFor: 'sectorIntelligence',
    }
    const fixtureKey = (aliasedToList[key] ?? (key as keyof typeof UPSTREAM_FIXTURES))
    const fixture = UPSTREAM_FIXTURES[fixtureKey]
    assert(fixture !== undefined, `missing fixture for catalog key "${key}"`)
  }
})

// ── Session / tenant / catalog ───────────────────────────────────────────

test('sessionScope maps to OrgScope', () => {
  const out = mapOrgScope(UPSTREAM_FIXTURES.sessionScope)
  assertEqual(out.orgId as unknown as string, 'org_acme', 'orgId')
  assertEqual(out.actingUserId as unknown as string, 'usr_demo', 'actingUserId')
})

test('organization maps cleanly', () => {
  const out = mapOrganization(UPSTREAM_FIXTURES.organization)
  assertEqual(out.id as unknown as string, 'org_acme', 'id')
  assert(out.shortName.length > 0, 'shortName present')
  assert(out.enabledBrokerIds.length === 3, 'expected 3 enabled brokers')
})

test('organization tolerates missing optional fields (timeZone, defaultCurrency)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = { ...UPSTREAM_FIXTURES.organization }
  delete raw.timeZone
  delete raw.defaultCurrency
  const out = mapOrganization(raw)
  assertEqual(out.timeZone, 'UTC', 'default timeZone')
  assertEqual(out.defaultCurrency, 'INR', 'default defaultCurrency')
})

test('me maps to User', () => {
  const out = mapUser(UPSTREAM_FIXTURES.me)
  assertEqual(out.orgId as unknown as string, 'org_acme', 'User.orgId matches org fixture')
  assertEqual(out.role, 'analyst', 'User.role')
})

test('brokers maps and tolerates brokers with missing optional arrays', () => {
  const out = mapBrokers(UPSTREAM_FIXTURES.brokers)
  assert(out.length === 3, 'expected 3 brokers')
  const iifl = out.find((b) => (b.id as unknown as string) === 'brk_iifl')!
  // iifl fixture omits researchAliases, coverageTags, brandColor, website.
  assertEqual(iifl.researchAliases.length, 0, 'researchAliases defaulted to []')
  assertEqual(iifl.coverageTags.length, 0, 'coverageTags defaulted to []')
  assertEqual(iifl.brandColor, null, 'brandColor defaulted to null')
  assertEqual(iifl.website, null, 'website defaulted to null')
})

test('sectors maps and tolerates missing tickers[]', () => {
  const out = mapSectors(UPSTREAM_FIXTURES.sectors)
  assert(out.length === 3, 'expected 3 sectors')
  const capgoods = out.find((s) => (s.id as unknown as string) === 'sec_capgoods')!
  assertEqual(capgoods.tickers.length, 0, 'capgoods tickers defaulted to []')
})

test('stocks maps and tolerates missing optional price fields', () => {
  const out = mapStocks(UPSTREAM_FIXTURES.stocks)
  assert(out.length === 3, 'expected 3 stocks')
  const lt = out.find((s) => (s.ticker as unknown as string) === 'LT')!
  assertEqual(lt.exchange, null, 'exchange defaulted to null')
  assertEqual(lt.lastPrice, null, 'lastPrice defaulted to null')
  assertEqual(lt.lastPriceAsOf, null, 'lastPriceAsOf defaulted to null')
})

// ── Inbound pipeline ─────────────────────────────────────────────────────

test('brokerEmails maps to Page<BrokerEmail>', () => {
  const page = mapBrokerEmailsPage(UPSTREAM_FIXTURES.brokerEmails)
  assertEqual(page.totalCount, 2, 'totalCount')
  assert(page.items.length === 2, 'items length')
  assertEqual(page.items[0]!.orgId as unknown as string, 'org_acme', 'email.orgId')
})

test('single brokerEmail also maps', () => {
  const email = mapBrokerEmail(UPSTREAM_FIXTURES.brokerEmails.items[0])
  assertEqual(email.id as unknown as string, 'eml_001', 'email.id')
})

test('attachments map', () => {
  const atts = mapAttachments(UPSTREAM_FIXTURES.attachments)
  assertEqual(atts.length, 1, '1 attachment')
  assertEqual(atts[0]!.emailId as unknown as string, 'eml_001', 'attachment.emailId')
})

// ── Normalized research ──────────────────────────────────────────────────

test('researchReports maps to Page<ResearchReport>', () => {
  const page = mapResearchReportsPage(UPSTREAM_FIXTURES.researchReports)
  assertEqual(page.totalCount, 2, 'totalCount')
  for (const r of page.items) {
    assertEqual(r.orgId as unknown as string, 'org_acme', 'report.orgId')
  }
})

test('single researchReport maps', () => {
  const r = mapResearchReport(UPSTREAM_FIXTURES.researchReports.items[0])
  assertEqual(r.reportType, 'earnings_review', 'reportType')
})

test('reportSummary maps (required field presence)', () => {
  const s = mapReportSummary(UPSTREAM_FIXTURES.reportSummary)
  assertEqual(s.rating, 'Buy', 'rating')
  assertEqual(s.targetPrice, 4200, 'targetPrice')
  assertEqual(s.evidenceIds.length, 2, 'evidenceIds')
})

test('evidence maps', () => {
  const ev = mapEvidenceSnippets(UPSTREAM_FIXTURES.evidence)
  assert(ev.length === 2, '2 evidence rows')
  assertEqual(ev[0]!.reportId as unknown as string, 'rpt_001', 'evidence.reportId')
})

// ── Derived analytics ────────────────────────────────────────────────────

test('opinions maps', () => {
  const ops = mapBrokerStockOpinions(UPSTREAM_FIXTURES.opinions)
  assertEqual(ops.length, 3, '3 opinions')
})

test('conflict closure (single) maps', () => {
  const c = mapConflictClosure(UPSTREAM_FIXTURES.conflictClosure)
  assertEqual(c.ticker as unknown as string, 'TCS', 'ticker')
  assertEqual(c.resultant.state, 'consensus_bullish', 'resultant.state')
})

test('conflict closures (list) maps', () => {
  const cs = mapConflictClosures(UPSTREAM_FIXTURES.conflictClosures)
  assertEqual(cs.length, 1, '1 closure')
})

test('sector intelligence list maps', () => {
  const s = mapSectorIntelligenceList(UPSTREAM_FIXTURES.sectorIntelligence)
  assertEqual(s.length, 1, '1 sector')
})

test('sector intelligence (single) maps via list[0]', () => {
  const first = UPSTREAM_FIXTURES.sectorIntelligence[0]
  const si = mapSectorIntelligence(first)
  assertEqual(si.sectorName, 'Information Technology', 'sectorName')
})

// ── Dashboard + ops ──────────────────────────────────────────────────────

test('kpiSnapshot maps', () => {
  const k = mapKpiSnapshot(UPSTREAM_FIXTURES.kpiSnapshot)
  assertEqual(k.reportsIngested, 2, 'reportsIngested')
  assertEqual(k.windowDeltas.stocksCovered.windowDays, 30, 'windowDeltas.stocksCovered.windowDays')
})

test('ingestionStatus maps', () => {
  const s = mapIngestionStatus(UPSTREAM_FIXTURES.ingestionStatus)
  assertEqual(s.readyLast24h, 2, 'readyLast24h')
})

// ── Cross-resource invariants ────────────────────────────────────────────

test('every orgId in scoped resources matches sessionScope.orgId', () => {
  const scope = mapOrgScope(UPSTREAM_FIXTURES.sessionScope)
  const expectedOrg = scope.orgId as unknown as string

  const sources: Array<{ name: string; orgIds: readonly string[] }> = [
    { name: 'organization',  orgIds: [(mapOrganization(UPSTREAM_FIXTURES.organization).id as unknown as string)] },
    { name: 'me',            orgIds: [(mapUser(UPSTREAM_FIXTURES.me).orgId as unknown as string)] },
    { name: 'brokerEmails',  orgIds: mapBrokerEmailsPage(UPSTREAM_FIXTURES.brokerEmails).items.map((x) => x.orgId as unknown as string) },
    { name: 'attachments',   orgIds: mapAttachments(UPSTREAM_FIXTURES.attachments).map((x) => x.orgId as unknown as string) },
    { name: 'researchReports', orgIds: mapResearchReportsPage(UPSTREAM_FIXTURES.researchReports).items.map((x) => x.orgId as unknown as string) },
    { name: 'reportSummary', orgIds: [(mapReportSummary(UPSTREAM_FIXTURES.reportSummary).orgId as unknown as string)] },
    { name: 'evidence',      orgIds: mapEvidenceSnippets(UPSTREAM_FIXTURES.evidence).map((x) => x.orgId as unknown as string) },
    { name: 'opinions',      orgIds: mapBrokerStockOpinions(UPSTREAM_FIXTURES.opinions).map((x) => x.orgId as unknown as string) },
    { name: 'kpiSnapshot',   orgIds: [(mapKpiSnapshot(UPSTREAM_FIXTURES.kpiSnapshot).orgId as unknown as string)] },
    { name: 'ingestionStatus', orgIds: [(mapIngestionStatus(UPSTREAM_FIXTURES.ingestionStatus).orgId as unknown as string)] },
  ]

  for (const src of sources) {
    for (const id of src.orgIds) {
      assertEqual(id, expectedOrg, `${src.name} orgId matches sessionScope`)
    }
  }
})

// ── Failure-mode regressions ─────────────────────────────────────────────

test('bad required-field payload throws ContractViolationError with endpoint tag', () => {
  let threw = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad: any = { ...UPSTREAM_FIXTURES.organization }
    delete bad.id   // required field
    mapOrganization(bad)
  } catch (e) {
    threw = true
    assert(e instanceof ContractViolationError, `expected ContractViolationError, got ${(e as Error)?.name}`)
    assert((e as Error).message.includes('organization'), 'error message includes endpoint tag')
  }
  assert(threw, 'expected mapOrganization to throw on missing required field')
})

test('OrgScopeViolationError is a real subclass (sanity)', () => {
  const e = new OrgScopeViolationError('test')
  assert(e instanceof OrgScopeViolationError, 'instanceof OrgScopeViolationError')
  assert(e.code === 'ORG_SCOPE_VIOLATION', 'error code')
})

// ── Drift regressions ────────────────────────────────────────────────────

test('drift: snake_case keys on organization', () => {
  const raw = {
    id: 'org_acme',
    name: 'Acme Capital Partners LLP',
    short_name: 'Acme',
    forwarding_address: 'research@acme.broker-research.example.com',
    created_at: '2026-01-15T08:30:00.000Z',
    enabled_broker_ids: ['brk_kotak'],
    time_zone: 'Asia/Kolkata',
    default_currency: 'INR',
  }
  const out = mapOrganization(raw)
  assertEqual(out.shortName, 'Acme', 'snake_case short_name → shortName')
  assertEqual(out.forwardingAddress, 'research@acme.broker-research.example.com', 'snake_case forwarding_address → forwardingAddress')
})

test('drift: envelope wrapper { data: … } on organization', () => {
  const raw = { data: UPSTREAM_FIXTURES.organization }
  const out = mapOrganization(raw)
  assertEqual(out.id as unknown as string, 'org_acme', 'envelope unwrapped')
})

test('drift: { response: … } envelope + snake_case on user', () => {
  const raw = { response: { id: 'usr_demo', org_id: 'org_acme', email: 'x@y.com', display_name: 'X', role: 'analyst', created_at: '2026-01-20T10:00:00.000Z' } }
  const out = mapUser(raw)
  assertEqual(out.orgId as unknown as string, 'org_acme', 'snake org_id → camel orgId')
})

test('drift: alt ID alias `organization_id` on organization', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = { ...UPSTREAM_FIXTURES.organization }
  // Simulate an upstream that sends `organization_id` instead of `id`.
  raw.organization_id = raw.id
  delete raw.id
  const out = mapOrganization(raw)
  assertEqual(out.id as unknown as string, 'org_acme', 'organization_id aliased to id')
})

test('drift: bare array for Page<ResearchReport> gets wrapped', () => {
  const raw = UPSTREAM_FIXTURES.researchReports.items
  const out = mapResearchReportsPage(raw)
  assertEqual(out.items.length, 2, 'items count')
  assertEqual(out.nextCursor, null, 'nextCursor defaulted to null')
  assertEqual(out.totalCount, 2, 'totalCount defaulted to items.length')
})

test('drift: pagination alias { cursor, total } → { nextCursor, totalCount }', () => {
  const raw = {
    items: UPSTREAM_FIXTURES.researchReports.items,
    cursor: 'next-page',
    total: 42,
  }
  const out = mapResearchReportsPage(raw)
  assertEqual(out.nextCursor, 'next-page', 'cursor → nextCursor')
  assertEqual(out.totalCount, 42, 'total → totalCount')
})

test('drift: numeric-string targetPrice on report summary', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = { ...UPSTREAM_FIXTURES.reportSummary, targetPrice: '4200', confidence: '0.82' }
  const out = mapReportSummary(raw)
  assertEqual(out.targetPrice, 4200, 'numeric-string targetPrice coerced')
  assertEqual(out.confidence, 0.82, 'numeric-string confidence coerced')
})

test('drift: numeric-string that cannot parse throws with field path', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = { ...UPSTREAM_FIXTURES.reportSummary, targetPrice: 'not-a-number' }
  let threw = false
  try { mapReportSummary(raw) } catch (e) {
    threw = true
    assert(e instanceof ContractViolationError, 'ContractViolationError expected')
    assert((e as Error).message.includes('ReportSummary.targetPrice'), 'error carries field path')
  }
  assert(threw, 'expected throw on non-numeric string')
})

// ── Report ────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok)

for (const r of results) {
  if (r.ok) {
    process.stdout.write(`  ✓ ${r.name}\n`)
  } else {
    process.stdout.write(`  ✗ ${r.name}\n     ${r.message}\n`)
  }
}

process.stdout.write(`\n${passed}/${results.length} passed`)
if (failed.length > 0) {
  process.stdout.write(` · ${failed.length} failed\n`)
  process.exit(1)
}
process.stdout.write(`\n`)
