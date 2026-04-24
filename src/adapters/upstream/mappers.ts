// ─────────────────────────────────────────────────────────────────────────
// Upstream → canonical translation layer.
//
// Every method on `HttpResearchAdapter` and `FixtureUpstreamAdapter` goes
// through the mapper that matches its endpoint. A mapper is responsible
// for four concerns:
//
//   1. Validate the raw JSON has the expected shape.
//      Implemented by delegating to `src/adapters/http/parsers.ts`, which
//      throws `ContractViolationError` on shape mismatch.
//
//   2. Fill optional-field defaults.
//      Upstream-declared-optional fields (see `./types.ts`) that are
//      omitted from the payload get canonical defaults applied here, not
//      in the UI.
//
//   3. Normalize payload-shape differences.
//      Today the upstream contract matches the canonical domain almost
//      exactly; mappers are near-identity. When the upstream ships
//      snake_case, or wraps responses in `{ data: … }`, or renames a
//      field, the change happens in this file and nowhere else.
//
//   4. Enrich errors with endpoint context.
//      A raw parser error like "Organization.enabledBrokerIds[0]" becomes
//      "[upstream:organization] Organization.enabledBrokerIds[0]: …"
//      so the engineer debugging an integration can see which endpoint
//      sent the bad payload.
//
// Mappers never write to the DOM, never inspect scope directly, and never
// decide policy beyond translation. Cross-tenant scope enforcement lives
// in `HttpResearchAdapter` / `FixtureUpstreamAdapter` (see docs/scope.md).
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgScope, Organization, User,
  Broker, Sector, Stock,
  BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion,
  KpiSnapshot, IngestionStatus,
  Page,
} from '../../domain'
import type { ConflictClosure, SectorIntelligence } from '../../engine/types'
import {
  parseOrgScope, parseOrganization, parseUser,
  parseBroker, parseSector, parseStock,
  parseBrokerEmail, parseAttachment,
  parseResearchReport, parseReportSummary, parseEvidenceSnippet,
  parseBrokerStockOpinion, parseConflictClosure, parseSectorIntelligence,
  parseKpiSnapshot, parseIngestionStatus, parsePage,
} from '../http/parsers'
import { ContractViolationError } from '../errors'
import { asBrokerId } from '../../lib/ids'
import { defaults, specForKey, warnMissingOptional } from './degraded'

export interface MappingContext {
  /** Endpoint key from `RESOURCE_CATALOG` (see `degraded.ts`). Used for
   *  error prefixes and dev diagnostics. */
  readonly endpoint: string
}

// ── Helper: endpoint-tagged error wrapping ───────────────────────────────

function tagged<T>(endpoint: string, fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof ContractViolationError) {
      // Re-throw with endpoint prefix for actionable diagnostics.
      throw new ContractViolationError(
        `[upstream:${endpoint}] ${e.message.split(':').slice(0, 1).join(':')}`,
        e.message.split(':').slice(1).join(':').trim(),
        e,
      )
    }
    throw e
  }
}

// ── Session / tenant / catalog ───────────────────────────────────────────

export function mapOrgScope(raw: unknown, ctx: MappingContext = { endpoint: 'sessionScope' }): OrgScope {
  return tagged(ctx.endpoint, () => parseOrgScope(raw))
}

export function mapOrganization(raw: unknown, ctx: MappingContext = { endpoint: 'organization' }): Organization {
  return tagged(ctx.endpoint, () => {
    // Optional fields (timeZone, defaultCurrency) get filled in before we
    // hand to the strict parser, so parsers.ts stays uniform across shapes.
    const x = requireObject(raw, 'Organization', ctx.endpoint)
    if (x.timeZone === undefined) {
      warnMissingOptional(ctx.endpoint, 'timeZone', `"${defaults.timeZone()}"`)
      x.timeZone = defaults.timeZone()
    }
    if (x.defaultCurrency === undefined) {
      warnMissingOptional(ctx.endpoint, 'defaultCurrency', `"${defaults.defaultCurrency()}"`)
      x.defaultCurrency = defaults.defaultCurrency()
    }
    return parseOrganization(x)
  })
}

export function mapUser(raw: unknown, ctx: MappingContext = { endpoint: 'currentUser' }): User {
  return tagged(ctx.endpoint, () => parseUser(raw))
}

export function mapBroker(raw: unknown, ctx: MappingContext = { endpoint: 'brokers' }): Broker {
  return tagged(ctx.endpoint, () => {
    const x = requireObject(raw, 'Broker', ctx.endpoint)
    fillOptionalArray(x, 'senderDomains', ctx.endpoint)
    fillOptionalArray(x, 'researchAliases', ctx.endpoint)
    fillOptionalArray(x, 'coverageTags', ctx.endpoint)
    fillOptionalNullable(x, 'brandColor', ctx.endpoint)
    fillOptionalNullable(x, 'website', ctx.endpoint)
    return parseBroker(x)
  })
}

export function mapBrokers(raw: unknown): readonly Broker[] {
  const ctx: MappingContext = { endpoint: 'brokers' }
  const arr = requireArray(raw, 'brokers', ctx.endpoint)
  return arr.map((x, i) => mapBroker(x, { endpoint: `${ctx.endpoint}[${i}]` }))
}

export function mapSector(raw: unknown, ctx: MappingContext = { endpoint: 'sectors' }): Sector {
  return tagged(ctx.endpoint, () => {
    const x = requireObject(raw, 'Sector', ctx.endpoint)
    if (x.parentId === undefined) {
      warnMissingOptional(ctx.endpoint, 'parentId', 'null')
      x.parentId = null
    }
    fillOptionalArray(x, 'tickers', ctx.endpoint)
    return parseSector(x)
  })
}

export function mapSectors(raw: unknown): readonly Sector[] {
  const ctx: MappingContext = { endpoint: 'sectors' }
  const arr = requireArray(raw, 'sectors', ctx.endpoint)
  return arr.map((x, i) => mapSector(x, { endpoint: `${ctx.endpoint}[${i}]` }))
}

export function mapStock(raw: unknown, ctx: MappingContext = { endpoint: 'stocks' }): Stock {
  return tagged(ctx.endpoint, () => {
    const x = requireObject(raw, 'Stock', ctx.endpoint)
    fillOptionalNullable(x, 'exchange', ctx.endpoint)
    fillOptionalNullable(x, 'lastPrice', ctx.endpoint)
    fillOptionalNullable(x, 'lastPriceAsOf', ctx.endpoint)
    return parseStock(x)
  })
}

export function mapStocks(raw: unknown): readonly Stock[] {
  const ctx: MappingContext = { endpoint: 'stocks' }
  const arr = requireArray(raw, 'stocks', ctx.endpoint)
  return arr.map((x, i) => mapStock(x, { endpoint: `${ctx.endpoint}[${i}]` }))
}

// ── Inbound pipeline ─────────────────────────────────────────────────────

export function mapBrokerEmail(raw: unknown, ctx: MappingContext = { endpoint: 'brokerEmail' }): BrokerEmail {
  return tagged(ctx.endpoint, () => parseBrokerEmail(raw))
}

export function mapBrokerEmailsPage(raw: unknown): Page<BrokerEmail> {
  const ctx: MappingContext = { endpoint: 'brokerEmails' }
  return tagged(ctx.endpoint, () => parsePage(raw, 'Page<BrokerEmail>', (x, p) => parseBrokerEmail(x, p)))
}

export function mapAttachments(raw: unknown): readonly Attachment[] {
  const ctx: MappingContext = { endpoint: 'attachments' }
  const arr = requireArray(raw, 'attachments', ctx.endpoint)
  return arr.map((x, i) => tagged(`${ctx.endpoint}[${i}]`, () => parseAttachment(x, `attachments[${i}]`)))
}

// ── Normalized research artifacts ────────────────────────────────────────

export function mapResearchReport(raw: unknown, ctx: MappingContext = { endpoint: 'researchReport' }): ResearchReport {
  return tagged(ctx.endpoint, () => parseResearchReport(raw))
}

export function mapResearchReportsPage(raw: unknown): Page<ResearchReport> {
  const ctx: MappingContext = { endpoint: 'researchReports' }
  return tagged(ctx.endpoint, () => parsePage(raw, 'Page<ResearchReport>', (x, p) => parseResearchReport(x, p)))
}

export function mapReportSummary(raw: unknown, ctx: MappingContext = { endpoint: 'reportSummary' }): ReportSummary {
  return tagged(ctx.endpoint, () => parseReportSummary(raw))
}

export function mapEvidenceSnippets(raw: unknown): readonly EvidenceSnippet[] {
  const ctx: MappingContext = { endpoint: 'reportEvidence' }
  const arr = requireArray(raw, 'evidence', ctx.endpoint)
  return arr.map((x, i) => tagged(`${ctx.endpoint}[${i}]`, () => parseEvidenceSnippet(x, `evidence[${i}]`)))
}

// ── Derived analytics ────────────────────────────────────────────────────

export function mapBrokerStockOpinions(raw: unknown): readonly BrokerStockOpinion[] {
  const ctx: MappingContext = { endpoint: 'opinions' }
  const arr = requireArray(raw, 'opinions', ctx.endpoint)
  return arr.map((x, i) => tagged(`${ctx.endpoint}[${i}]`, () => parseBrokerStockOpinion(x, `opinions[${i}]`)))
}

export function mapConflictClosure(raw: unknown, ctx: MappingContext = { endpoint: 'conflictClosure' }): ConflictClosure {
  return tagged(ctx.endpoint, () => parseConflictClosure(raw))
}

export function mapConflictClosures(raw: unknown): readonly ConflictClosure[] {
  const ctx: MappingContext = { endpoint: 'conflictClosures' }
  const arr = requireArray(raw, 'conflict-closures', ctx.endpoint)
  return arr.map((x, i) => tagged(`${ctx.endpoint}[${i}]`, () => parseConflictClosure(x, `conflict-closures[${i}]`)))
}

export function mapSectorIntelligence(raw: unknown, ctx: MappingContext = { endpoint: 'sectorIntelligenceFor' }): SectorIntelligence {
  return tagged(ctx.endpoint, () => parseSectorIntelligence(raw))
}

export function mapSectorIntelligenceList(raw: unknown): readonly SectorIntelligence[] {
  const ctx: MappingContext = { endpoint: 'sectorIntelligence' }
  const arr = requireArray(raw, 'sector-intelligence', ctx.endpoint)
  return arr.map((x, i) => tagged(`${ctx.endpoint}[${i}]`, () => parseSectorIntelligence(x, `sector-intelligence[${i}]`)))
}

// ── Dashboard + ops ──────────────────────────────────────────────────────

export function mapKpiSnapshot(raw: unknown, ctx: MappingContext = { endpoint: 'kpiSnapshot' }): KpiSnapshot {
  return tagged(ctx.endpoint, () => parseKpiSnapshot(raw))
}

export function mapIngestionStatus(raw: unknown, ctx: MappingContext = { endpoint: 'ingestionStatus' }): IngestionStatus {
  return tagged(ctx.endpoint, () => parseIngestionStatus(raw))
}

// ── Degraded-mode helpers exposed for adapters ───────────────────────────

/** Given a list endpoint key, return an empty Page when the upstream 404s.
 *  Only legal for resource keys whose spec tolerates 404. */
export function emptyPageForDegradedEndpoint<T>(endpointKey: string): Page<T> {
  const spec = specForKey(endpointKey)
  if (!spec || !spec.tolerate404) {
    throw new Error(`emptyPageForDegradedEndpoint: ${endpointKey} is not marked as tolerating 404`)
  }
  const d = defaults.emptyPage<T>()
  return { items: d.items as readonly T[], nextCursor: d.nextCursor, totalCount: d.totalCount }
}

export function emptyListForDegradedEndpoint<T>(endpointKey: string): readonly T[] {
  const spec = specForKey(endpointKey)
  if (!spec || !spec.tolerate404) {
    throw new Error(`emptyListForDegradedEndpoint: ${endpointKey} is not marked as tolerating 404`)
  }
  return []
}

// ── Internals ────────────────────────────────────────────────────────────

function requireObject(raw: unknown, kind: string, endpoint: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ContractViolationError(
      `[upstream:${endpoint}] ${kind}`,
      `expected object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`,
    )
  }
  return { ...(raw as Record<string, unknown>) }
}

function requireArray(raw: unknown, kind: string, endpoint: string): unknown[] {
  if (!Array.isArray(raw)) {
    throw new ContractViolationError(
      `[upstream:${endpoint}] ${kind}`,
      `expected array, got ${raw === null ? 'null' : typeof raw}`,
    )
  }
  return raw
}

function fillOptionalArray(x: Record<string, unknown>, field: string, endpoint: string): void {
  if (x[field] === undefined) {
    warnMissingOptional(endpoint, field, '[]')
    x[field] = []
  }
}

function fillOptionalNullable(x: Record<string, unknown>, field: string, endpoint: string): void {
  if (x[field] === undefined) {
    warnMissingOptional(endpoint, field, 'null')
    x[field] = null
  }
}

// Exported helper for tests that want to cast a string to a BrokerId without
// pulling in the full domain module path.
export const asBrokerIdForTest = asBrokerId
