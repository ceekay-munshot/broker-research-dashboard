// ─────────────────────────────────────────────────────────────────────────
// Degraded-data policy.
//
// The external upstream API is expected to ship incrementally. On day 1 some
// resources will be fully populated, some will be stubbed (empty lists, null
// derived analytics), and a couple may not exist yet at all (the endpoint
// returns 404, or the field is absent).
//
// This module answers three questions for every resource:
//
//   1. Is the RESOURCE required for the dashboard to render meaningfully,
//      or may the upstream omit it (404 or empty)?
//   2. When an OPTIONAL FIELD is missing, what canonical default do we
//      substitute?
//   3. When the upstream is clearly incomplete, what signal do we surface
//      in dev mode so the engineer on this repo knows?
//
// Production policy: fail closed on required-resource errors; substitute
// canonical defaults for optional fields; never silently swallow a scope
// mismatch (those always throw).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Classification of each resource the dashboard consumes.
 *
 * - `required`:  Dashboard bootstrap fails without this. An upstream 404
 *                here is an integration bug — the adapter propagates the
 *                error to the UI.
 *
 * - `list`:      A pageable or flat list endpoint. Empty lists are always
 *                acceptable; total absence (404) is degraded but tolerable.
 *                The adapter treats 404 as an empty list in `upstream`
 *                mode when that endpoint is listed as degradable here.
 *
 * - `optional`:  Nice-to-have. A 404 or null response is fine — the UI
 *                renders its empty / loading state.
 *
 * - `derived`:   Computed analytics (conflict closures, sector
 *                intelligence). If the upstream hasn't implemented these
 *                yet, the UI still shows the raw inputs from other
 *                endpoints — just the derived views are empty.
 */
export type ResourceRequirement = 'required' | 'list' | 'optional' | 'derived'

export interface ResourceSpec {
  readonly key: string
  readonly endpoint: string
  readonly requirement: ResourceRequirement
  /** One-line description for docs + dev warnings. */
  readonly description: string
  /** True if the upstream may return 404 at this endpoint without the
   *  dashboard considering it a hard error. */
  readonly tolerate404: boolean
}

export const RESOURCE_CATALOG: readonly ResourceSpec[] = [
  // Session + tenant — required for bootstrap.
  { key: 'sessionScope',       endpoint: 'GET /v1/session/scope',       requirement: 'required', description: 'Resolves orgId + actingUserId from the bearer token.',              tolerate404: false },
  { key: 'organization',       endpoint: 'GET /v1/organization',        requirement: 'required', description: 'The tenant the dashboard is running under.',                        tolerate404: false },
  { key: 'currentUser',        endpoint: 'GET /v1/me',                  requirement: 'required', description: 'The user acting on the org.',                                       tolerate404: false },

  // Catalogs — required to render filters / labels.
  { key: 'brokers',            endpoint: 'GET /v1/brokers',             requirement: 'required', description: 'Global broker catalog, filtered to org-enabled brokers.',          tolerate404: false },
  { key: 'sectors',            endpoint: 'GET /v1/sectors',             requirement: 'required', description: 'Global sector taxonomy.',                                             tolerate404: false },
  { key: 'stocks',             endpoint: 'GET /v1/stocks',              requirement: 'required', description: 'Global stock catalog (tickers relevant to the org).',                tolerate404: false },

  // Inbound pipeline — list endpoints tolerate 404 / empty.
  { key: 'brokerEmails',       endpoint: 'GET /v1/broker-emails',       requirement: 'list',     description: 'Admitted broker emails.',                                             tolerate404: true },
  { key: 'brokerEmail',        endpoint: 'GET /v1/broker-emails/:id',   requirement: 'optional', description: 'Single email detail.',                                                tolerate404: true },
  { key: 'attachments',        endpoint: 'GET /v1/broker-emails/:id/attachments', requirement: 'list', description: 'Attachments on one email.',                                     tolerate404: true },

  // Normalized research — required for the dashboard to be useful, but empty
  // lists are acceptable on a fresh tenant.
  { key: 'researchReports',    endpoint: 'GET /v1/research-reports',    requirement: 'required', description: 'Normalized research reports for the org.',                          tolerate404: false },
  { key: 'researchReport',     endpoint: 'GET /v1/research-reports/:id',requirement: 'optional', description: 'Single report detail.',                                               tolerate404: true },
  { key: 'reportSummary',      endpoint: 'GET /v1/research-reports/:id/summary',  requirement: 'optional', description: 'Structured summary. Null when the summary model has not yet processed the report.', tolerate404: true },
  { key: 'reportEvidence',     endpoint: 'GET /v1/research-reports/:id/evidence', requirement: 'list',     description: 'Audit-trail citations backing the summary.',                tolerate404: true },

  // Derived analytics — can be absent on day 1 without breaking the UI.
  { key: 'opinions',           endpoint: 'GET /v1/opinions',            requirement: 'list',     description: 'Most-recent opinion per broker × ticker.',                            tolerate404: true },
  { key: 'conflictClosures',   endpoint: 'GET /v1/conflict-closures',   requirement: 'derived', description: 'Street-wide closure aggregate per ticker.',                           tolerate404: true },
  { key: 'conflictClosure',    endpoint: 'GET /v1/conflict-closures/:ticker', requirement: 'derived', description: 'Closure for a single ticker.',                                  tolerate404: true },
  { key: 'sectorIntelligence', endpoint: 'GET /v1/sector-intelligence', requirement: 'derived', description: 'Sector-level signal roll-up.',                                        tolerate404: true },
  { key: 'sectorIntelligenceFor', endpoint: 'GET /v1/sector-intelligence/:id', requirement: 'derived', description: 'Sector-level aggregate for one sector.',                       tolerate404: true },

  // Dashboard / ops — required for header + ingestion chip.
  { key: 'kpiSnapshot',        endpoint: 'GET /v1/kpi-snapshot',        requirement: 'required', description: 'Headline KPIs for the dashboard header.',                            tolerate404: false },
  { key: 'ingestionStatus',    endpoint: 'GET /v1/ingestion-status',    requirement: 'required', description: 'Pipeline ops counters shown in the header chip.',                    tolerate404: false },

  // Portfolio / watchlist — fully optional. 404 is treated as "no portfolio".
  { key: 'portfolioSnapshot',  endpoint: 'GET /v1/portfolio-snapshot',  requirement: 'optional', description: "Org's current portfolio + watchlist snapshot. 404 → no portfolio configured.", tolerate404: true },

  // Alerts / digests (Module 19) — fully optional. 404 is treated as "no alerts yet".
  { key: 'alerts',             endpoint: 'GET /v1/alerts',              requirement: 'list',     description: 'Recent alert feed for the org.', tolerate404: true },
  { key: 'alert',              endpoint: 'GET /v1/alerts/:id',          requirement: 'optional', description: 'Single alert detail.', tolerate404: true },
  { key: 'alertDigests',       endpoint: 'GET /v1/alert-digests',       requirement: 'list',     description: 'Authored digests for the org.', tolerate404: true },
  { key: 'alertDigest',        endpoint: 'GET /v1/alert-digests/:id',   requirement: 'optional', description: 'Single digest detail.', tolerate404: true },
  { key: 'latestAlertDigest',  endpoint: 'GET /v1/alert-digests/latest', requirement: 'optional', description: 'Latest digest of a given kind.', tolerate404: true },
] as const

/** Lookup a resource spec by `key`; returns undefined when the key is not
 *  in the catalog (caller should treat that as a code bug, not a data bug). */
export function specForKey(key: string): ResourceSpec | undefined {
  return RESOURCE_CATALOG.find((s) => s.key === key)
}

/**
 * Warn once per missing optional field, in dev mode only. Hosts running
 * production builds see nothing; developers see a single line per field
 * telling them what the upstream left out and what default was applied.
 * Also pushes the warning into the diagnostics store so the dev chip and
 * `window.__upstreamDiagnostics()` can show it.
 */
const warnedOnce = new Set<string>()
export function warnMissingOptional(
  endpointKey: string,
  fieldPath: string,
  defaultApplied: string,
): void {
  if (!isDev()) return
  const tag = `${endpointKey}:${fieldPath}`
  if (warnedOnce.has(tag)) return
  warnedOnce.add(tag)
  const message = `[upstream/${endpointKey}] optional field \`${fieldPath}\` missing; using default=${defaultApplied}. See docs/upstream-contract.md.`
  // eslint-disable-next-line no-console
  console.warn(message)
  recordDiagnosticsWarning(message)
}

// Injected by diagnostics module at load time (see diagnostics.ts). Keeps
// degraded.ts free of any import edge that would pull the whole
// diagnostics module into environments that don't need it.
let recordDiagnosticsWarning: (msg: string) => void = () => { /* noop until wired */ }
export function __setDiagnosticsWarningSink(fn: (msg: string) => void): void {
  recordDiagnosticsWarning = fn
}

function isDev(): boolean {
  try {
    return !!import.meta.env?.DEV
  } catch {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  }
}

/** Default value helpers used by mappers when an optional field is omitted. */
export const defaults = {
  stringArray: (): readonly string[] => [],
  stringOrNull: (): string | null => null,
  numberOrNull: (): number | null => null,
  timeZone: (): string => 'UTC',
  defaultCurrency: (): string => 'INR',
  emptyPage: <T>(): { items: readonly T[]; nextCursor: string | null; totalCount: number } => ({
    items: [], nextCursor: null, totalCount: 0,
  }),
} as const
