#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Raw-upstream → /v1 bridge contract tests.
//
// Two pillars:
//   1. `identityProfile` is a true no-op — every reference fixture under
//      `src/adapters/upstream/fixtures/` passes through untouched AND
//      still satisfies the `/v1` mappers. This protects against
//      accidental behavior change in the bridge when the profile is
//      identity.
//   2. `exampleDivergentProfile` absorbs a realistic divergent payload
//      and produces `/v1`-valid JSON the mappers parse. This protects
//      the declarative transform DSL from regression.
//
// Exits 0 all-green; 1 on any failure.
// ─────────────────────────────────────────────────────────────────────────

import {
  normalizeRawUpstream,
  identityProfile, exampleDivergentProfile,
  compose, camelCaseKeys, unwrapEnvelope, wrapAsPage, rename,
  coerceNumericFields, mapArray, mapPageItems, alias, pluck, at,
} from '../index'
import { UPSTREAM_FIXTURES } from '../../upstream/fixtureSource'
import {
  mapOrgScope, mapOrganization, mapUser,
  mapBrokers, mapSectors, mapStocks,
  mapBrokerEmailsPage, mapResearchReportsPage,
  mapReportSummary, mapEvidenceSnippets,
  mapBrokerStockOpinions,
  mapKpiSnapshot, mapIngestionStatus,
} from '../../upstream/mappers'

interface TestResult { readonly name: string; readonly ok: boolean; readonly message?: string }

const results: TestResult[] = []
function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }) }
}
function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}
function assertDeepEq(a: unknown, b: unknown, msg: string) {
  if (!deepEq(a, b)) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  got:      ${JSON.stringify(a)}`)
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEq(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>
    const ka = Object.keys(oa), kb = Object.keys(ob)
    if (ka.length !== kb.length) return false
    return ka.every((k) => deepEq(oa[k], ob[k]))
  }
  return false
}

// ── 1. Identity profile: perfect pass-through ─────────────────────────────

test('identityProfile leaves every fixture byte-identical', () => {
  for (const [key, fixture] of Object.entries(UPSTREAM_FIXTURES)) {
    const out = normalizeRawUpstream(fixture, key, identityProfile)
    assertDeepEq(out, fixture, `identity fixture "${key}"`)
  }
})

test('identityProfile round-trip still passes mappers', () => {
  // Spot-check a representative sample: the mappers should accept the
  // identity-normalized fixtures exactly as they do today.
  mapOrgScope(normalizeRawUpstream(UPSTREAM_FIXTURES.sessionScope, 'sessionScope', identityProfile))
  const org = mapOrganization(normalizeRawUpstream(UPSTREAM_FIXTURES.organization, 'organization', identityProfile))
  assertEq(org.id as unknown as string, 'org_acme', 'org.id')
  const page = mapResearchReportsPage(normalizeRawUpstream(UPSTREAM_FIXTURES.researchReports, 'researchReports', identityProfile))
  assertEq(page.items.length, 2, 'reports count')
})

// ── 2. Transform primitives ───────────────────────────────────────────────

test('compose is left-to-right', () => {
  const f = compose(
    (x) => (x as number) + 1,
    (x) => (x as number) * 10,
  )
  assertEq(f(3) as number, 40, 'compose order')
})

test('unwrapEnvelope collapses single-key envelopes recursively', () => {
  const raw = { data: { response: { id: 'x' } } }
  assertDeepEq(unwrapEnvelope()(raw), { id: 'x' }, 'double envelope unwrapped')
})

test('unwrapEnvelope leaves multi-key objects alone', () => {
  const raw = { data: { id: 'x' }, meta: { page: 1 } }
  assertDeepEq(unwrapEnvelope()(raw), raw, 'two keys preserved')
})

test('camelCaseKeys handles deep arrays + objects', () => {
  const raw = { a_b: [{ c_d: 1, e_f: [{ g_h: 2 }] }] }
  assertDeepEq(camelCaseKeys()(raw), { aB: [{ cD: 1, eF: [{ gH: 2 }] }] }, 'deep camelCase')
})

test('rename moves alias to canonical (canonical wins)', () => {
  const r1 = rename({ foo: 'id' })({ foo: 'x', bar: 'y' })
  assertDeepEq(r1, { id: 'x', bar: 'y' }, 'simple rename')
  // When both the alias `foo` and the canonical `id` are present, the
  // canonical wins — the alias is silently dropped.
  const r2 = rename({ foo: 'id' })({ foo: 'x', id: 'y' })
  assertDeepEq(r2, { id: 'y' }, 'canonical wins on conflict')
})

test('alias picks first available aliased source', () => {
  const r = alias('orgId', ['organizationId', 'org_id'])({ organizationId: 'x' })
  assertDeepEq(r, { orgId: 'x' }, 'alias picks first hit')
})

test('wrapAsPage handles bare array', () => {
  const r = wrapAsPage()([1, 2, 3])
  assertDeepEq(r, { items: [1, 2, 3], nextCursor: null, totalCount: 3 }, 'bare array wrapped')
})

test('wrapAsPage handles { results, next, count } shape', () => {
  const r = wrapAsPage({ itemsAt: 'results', cursorFrom: 'next', totalFrom: 'count' })({
    results: [{ id: 1 }], next: 'tok', count: 42,
  })
  assertDeepEq(r, { items: [{ id: 1 }], nextCursor: 'tok', totalCount: 42 }, 'results/next/count mapped')
})

test('coerceNumericFields parses only listed numeric-string fields', () => {
  const r = coerceNumericFields(['targetPrice'])({ targetPrice: '4200', label: '5000' })
  assertDeepEq(r, { targetPrice: 4200, label: '5000' }, 'selective coerce')
})

test('mapArray / mapPageItems route transforms to elements', () => {
  const r1 = mapArray(rename({ a: 'b' }))([{ a: 1 }, { a: 2 }])
  assertDeepEq(r1, [{ b: 1 }, { b: 2 }], 'array items transformed')
  const r2 = mapPageItems(rename({ a: 'b' }))({ items: [{ a: 1 }], nextCursor: null, totalCount: 1 })
  assertDeepEq(r2, { items: [{ b: 1 }], nextCursor: null, totalCount: 1 }, 'page items transformed')
})

test('at applies a transform at a nested path', () => {
  const r = at('nested.inner', rename({ a: 'b' }))({ nested: { inner: { a: 1 } } })
  assertDeepEq(r, { nested: { inner: { b: 1 } } }, 'nested path transformed')
})

test('pluck extracts a nested value or returns original', () => {
  assertDeepEq(pluck('a.b')({ a: { b: 42 } }), 42, 'nested plucked')
  assertDeepEq(pluck('a.b')({ a: {} }), { a: {} }, 'missing path preserves original')
})

// ── 3. Example divergent profile: realistic end-to-end normalization ──────

test('exampleDivergentProfile: snake_case + envelope organization', () => {
  const rawWire = {
    data: {
      organization_id: 'org_acme',
      name: 'Acme Capital Partners LLP',
      short_name: 'Acme',
      forwarding_address: 'research@acme.example.com',
      created_at: '2026-01-15T08:30:00.000Z',
      enabled_broker_ids: ['brk_kotak'],
      time_zone: 'Asia/Kolkata',
      default_currency: 'INR',
    },
  }
  const normalized = normalizeRawUpstream(rawWire, 'organization', exampleDivergentProfile)
  // The mapper must accept the normalized form unchanged.
  const org = mapOrganization(normalized)
  assertEq(org.id as unknown as string, 'org_acme', 'org.id after rename')
  assertEq(org.shortName, 'Acme', 'snake → camel')
  assertEq(org.forwardingAddress, 'research@acme.example.com', 'snake → camel')
})

test('exampleDivergentProfile: research reports via {results,next,count}', () => {
  const rawWire = {
    data: {
      results: [
        // A canonical-shaped research report, keyed with snake_case on the wire.
        {
          id: 'rpt_001',
          organization_id: 'org_acme',
          broker_id: 'brk_kotak',
          source_email_id: 'eml_001',
          source_attachment_id: 'att_001',
          title: 'TCS — 4QFY26 results beat; raising TP',
          published_at: '2026-04-22T07:30:00.000Z',
          received_at: '2026-04-22T09:30:00.000Z',
          report_type: 'earnings_review',
          tickers: ['TCS'],
          sector_ids: ['sec_it'],
          page_count: 14,
          language: 'en',
          status: 'ready',
          summary_id: 'sum_001',
        },
      ],
      next: null,
      count: 1,
    },
  }
  const normalized = normalizeRawUpstream(rawWire, 'researchReports', exampleDivergentProfile)
  const page = mapResearchReportsPage(normalized)
  assertEq(page.totalCount, 1, 'totalCount mapped from count')
  assertEq(page.items.length, 1, '1 report')
  assertEq(page.items[0]!.orgId as unknown as string, 'org_acme', 'orgId renamed')
})

test('exampleDivergentProfile: report summary with numeric-string target', () => {
  const rawWire = {
    data: {
      id: 'sum_001', organization_id: 'org_acme', report_id: 'rpt_001',
      stance: 'bullish', rating: 'Buy',
      target_price: '4200', prior_target_price: '4050', target_currency: 'INR',
      thesis: 't', key_points: [], themes: [], risks: [], catalysts: [],
      confidence: '0.82', generated_at: '2026-04-22T09:35:00.000Z',
      generator_version: 'v1', evidence_ids: [],
    },
  }
  const normalized = normalizeRawUpstream(rawWire, 'reportSummary', exampleDivergentProfile)
  const summary = mapReportSummary(normalized)
  assertEq(summary.targetPrice, 4200, 'numeric-string coerced to number')
  assertEq(summary.confidence, 0.82, 'confidence coerced')
  assertEq(summary.orgId as unknown as string, 'org_acme', 'orgId renamed')
})

test('exampleDivergentProfile: opinions as bare list with numeric strings', () => {
  const rawWire = {
    data: [
      {
        organization_id: 'org_acme', broker_id: 'brk_kotak', ticker: 'TCS',
        rating: 'Buy', stance: 'bullish',
        target_price: '4200', prior_target_price: '4050', target_currency: 'INR',
        last_report_id: 'rpt_001', last_updated_at: '2026-04-22T09:35:00.000Z',
        implied_upside_pct: '7.8',
      },
    ],
  }
  const normalized = normalizeRawUpstream(rawWire, 'opinions', exampleDivergentProfile)
  const ops = mapBrokerStockOpinions(normalized)
  assertEq(ops.length, 1, '1 opinion')
  assertEq(ops[0]!.targetPrice, 4200, 'target coerced')
  assertEq(ops[0]!.impliedUpsidePct, 7.8, 'upside coerced')
})

test('exampleDivergentProfile: brokers + sectors + stocks passthrough', () => {
  const brokers = mapBrokers(normalizeRawUpstream(
    { data: [{ id: 'brk_kotak', name: 'Kotak', short_name: 'Kotak' }] },
    'brokers', exampleDivergentProfile,
  ))
  assertEq(brokers.length, 1, 'brokers count')
  assertEq(brokers[0]!.shortName, 'Kotak', 'broker shortName')

  const sectors = mapSectors(normalizeRawUpstream(
    { data: [{ id: 'sec_it', name: 'IT' }] },
    'sectors', exampleDivergentProfile,
  ))
  assertEq(sectors.length, 1, 'sectors count')

  const stocks = mapStocks(normalizeRawUpstream(
    { data: [{ ticker: 'TCS', name: 'TCS', sector_id: 'sec_it', currency: 'INR' }] },
    'stocks', exampleDivergentProfile,
  ))
  assertEq(stocks.length, 1, 'stocks count')
  assertEq(stocks[0]!.sectorId as unknown as string, 'sec_it', 'snake→camel on sectorId')
})

test('exampleDivergentProfile: KPI + ingestion status pass through mappers', () => {
  const rawKpi = {
    data: {
      organization_id: 'org_acme', as_of: '2026-04-22T12:00:00.000Z',
      brokers_tracked: 3, reports_ingested: 2, stocks_covered: 3, divergence_flags: 0,
      window_deltas: {
        brokers_tracked: { value: 0, window_days: 7 },
        reports_ingested: { value: 2, window_days: 7 },
        stocks_covered: { value: 3, window_days: 30 },
        divergence_flags: { value: 0, window_days: 7 },
      },
    },
  }
  const kpi = mapKpiSnapshot(normalizeRawUpstream(rawKpi, 'kpiSnapshot', exampleDivergentProfile))
  assertEq(kpi.reportsIngested, 2, 'snake→camel on kpi')
  assertEq(kpi.windowDeltas.stocksCovered.windowDays, 30, 'deep snake→camel')

  const rawIngest = {
    data: {
      organization_id: 'org_acme', as_of: '2026-04-22T12:00:00.000Z',
      queued: 0, processing: 0, ready_last24h: 2, failed_last24h: 0,
      throughput_per_hour: '0.083',
    },
  }
  const ingest = mapIngestionStatus(normalizeRawUpstream(rawIngest, 'ingestionStatus', exampleDivergentProfile))
  assertEq(ingest.readyLast24h, 2, 'ready_last24h → readyLast24h')
  assertEq(ingest.throughputPerHour, 0.083, 'numeric-string throughput coerced')
})

test('exampleDivergentProfile: orgScope + user + broker-emails + evidence end-to-end', () => {
  // Session scope.
  const scope = mapOrgScope(normalizeRawUpstream(
    { response: { org_id: 'org_acme', acting_user_id: 'usr_demo' } },
    'sessionScope', exampleDivergentProfile,
  ))
  assertEq(scope.orgId as unknown as string, 'org_acme', 'orgScope.orgId')

  // User (alt ID alias).
  const user = mapUser(normalizeRawUpstream(
    { data: { user_id: 'usr_demo', organization_id: 'org_acme', email: 'x@y.com', display_name: 'X', role: 'analyst', created_at: '2026-01-20T10:00:00.000Z' } },
    'currentUser', exampleDivergentProfile,
  ))
  assertEq(user.id as unknown as string, 'usr_demo', 'user.id from user_id')

  // Broker emails page.
  const pageWire = {
    data: {
      results: [
        {
          id: 'eml_001',
          organization_id: 'org_acme',
          broker_id: 'brk_kotak',
          sender_address: 'research@kotak.com', sender_name: 'K',
          recipient_address: 'r@e.com', subject: 's', body_preview: 'p',
          received_at: '2026-04-22T09:30:00.000Z',
          forwarded_from: [], attachment_ids: [], report_ids: [],
          status: 'ready', status_message: null, source_message_id: 'm',
        },
      ],
      next: null, count: 1,
    },
  }
  const page = mapBrokerEmailsPage(normalizeRawUpstream(pageWire, 'brokerEmails', exampleDivergentProfile))
  assertEq(page.items[0]!.orgId as unknown as string, 'org_acme', 'brokerEmails orgId renamed')

  // Evidence list.
  const evWire = {
    data: [
      {
        id: 'ev_001', organization_id: 'org_acme', report_id: 'rpt_001',
        summary_id: 'sum_001', attachment_id: 'att_001',
        page_number: 1, text_snippet: 't', char_offset_start: null, char_offset_end: null,
        bounding_box: null, supporting_field: 'thesis', field_ref: '',
      },
    ],
  }
  const ev = mapEvidenceSnippets(normalizeRawUpstream(evWire, 'reportEvidence', exampleDivergentProfile))
  assertEq(ev.length, 1, 'evidence count')
  assertEq(ev[0]!.orgId as unknown as string, 'org_acme', 'evidence orgId renamed')
})

// ── Report ────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok)
for (const r of results) {
  if (r.ok) process.stdout.write(`  ✓ ${r.name}\n`)
  else      process.stdout.write(`  ✗ ${r.name}\n     ${r.message}\n`)
}
process.stdout.write(`\n${passed}/${results.length} passed`)
if (failed.length > 0) {
  process.stdout.write(` · ${failed.length} failed\n`)
  process.exit(1)
}
process.stdout.write(`\n`)
