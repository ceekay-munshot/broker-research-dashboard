// ─────────────────────────────────────────────────────────────────────────
// Upstream payload types — the on-wire JSON shape the external API is
// expected to return.
//
// These are declarative: each interface documents required vs optional
// fields, notes any edge cases, and lines up 1:1 with an endpoint in
// `src/adapters/http/endpoints.ts` and a fixture in `./fixtures/`.
//
// Today they mirror the canonical domain shape very closely — the mapper
// functions in `./mappers.ts` therefore look like near-identity functions.
// That is the point: the *layer* exists so that when the upstream payload
// diverges from the canonical domain (snake_case, wrapped envelopes,
// renamed fields, new metadata blocks), the change happens here and in
// `mappers.ts` — not in `parsers.ts`, not in view models, not in UI.
//
// See docs/upstream-contract.md for the full contract.
// ─────────────────────────────────────────────────────────────────────────

// ── Session / tenant / catalog ───────────────────────────────────────────

export interface UpstreamOrgScope {
  /** Required. Opaque org ID, conventionally prefixed `org_`. */
  orgId: string
  /** Required. The user the token was minted for. Prefixed `usr_`. */
  actingUserId: string
}

export interface UpstreamOrganization {
  /** Required. Matches `UpstreamOrgScope.orgId`. */
  id: string
  /** Required. Human-readable legal/display name. */
  name: string
  /** Required. Short name (≤16 chars), shown in the header. */
  shortName: string
  /** Required. The forwarding address the org points broker auto-forwards at. */
  forwardingAddress: string
  /** Required. ISO-8601 UTC. */
  createdAt: string
  /** Required. Subset of the global broker catalog the org has enabled. */
  enabledBrokerIds: string[]
  /** Optional. IANA zone (e.g. `Asia/Kolkata`). Defaults to `UTC`. */
  timeZone?: string
  /** Optional. ISO-4217. Defaults to `INR`. */
  defaultCurrency?: string
}

export interface UpstreamUser {
  /** Required. Prefixed `usr_`. */
  id: string
  /** Required. Must equal the scope under which the request is made. */
  orgId: string
  /** Required. */
  email: string
  /** Required. Preferred rendered name (not auth-critical). */
  displayName: string
  /** Required. One of: analyst | pm | admin | viewer. */
  role: string
  /** Required. ISO-8601 UTC. */
  createdAt: string
}

export interface UpstreamBroker {
  /** Required. Prefixed `brk_`. Shared across orgs (global catalog). */
  id: string
  /** Required. */
  name: string
  /** Required. Short name used on cards (e.g. `JPM`). */
  shortName: string
  /** Required. Domains emails must originate from to be admitted. May be empty
   *  when the upstream has not yet populated sender allowlists — defaults to []. */
  senderDomains?: string[]
  /** Optional. Alternative display names seen in the wild. Defaults to []. */
  researchAliases?: string[]
  /** Optional. Free-form coverage tags (e.g. `midcap`, `infra`). Defaults to []. */
  coverageTags?: string[]
  /** Optional. Hex brand color. */
  brandColor?: string | null
  /** Optional. Canonical research website. */
  website?: string | null
}

export interface UpstreamSector {
  /** Required. Prefixed `sec_`. */
  id: string
  /** Required. */
  name: string
  /** Optional. Null for top-level sectors. */
  parentId?: string | null
  /** Optional. Tickers that primarily classify under this sector. Defaults to []. */
  tickers?: string[]
}

export interface UpstreamStock {
  /** Required. Exchange ticker (e.g. `TCS`). */
  ticker: string
  /** Required. */
  name: string
  /** Required. Primary sector classification. */
  sectorId: string
  /** Required. ISO-4217. */
  currency: string
  /** Optional. Exchange the ticker trades on. Defaults to null. */
  exchange?: string | null
  /** Optional. Most-recent close price. Defaults to null. */
  lastPrice?: number | null
  /** Optional. ISO-8601 UTC of last price update. Defaults to null. */
  lastPriceAsOf?: string | null
}

// ── Inbound pipeline ─────────────────────────────────────────────────────

export interface UpstreamBrokerEmail {
  id: string
  /** Must match the request scope; cross-tenant mismatches are rejected. */
  orgId: string
  /** Null when the sender could not be matched to a known broker. */
  brokerId: string | null
  senderAddress: string
  senderName: string
  recipientAddress: string
  subject: string
  bodyPreview: string
  receivedAt: string
  /** Trace of forwarding hops. Required but may be empty. */
  forwardedFrom: string[]
  /** Required but may be empty. */
  attachmentIds: string[]
  /** Required but may be empty. */
  reportIds: string[]
  /** received | queued | parsing | normalizing | summarizing | ready | failed | skipped */
  status: string
  /** Human-readable status (esp. for `failed` / `skipped`). */
  statusMessage: string | null
  /** RFC-5322 Message-ID, used to dedupe. */
  sourceMessageId: string
}

export interface UpstreamAttachment {
  id: string
  orgId: string
  emailId: string
  filename: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  storageRef: string
  /** Null when parser has not yet resolved page count. */
  pageCount: number | null
  language: string | null
  parseStatus: string
  parseErrorMessage: string | null
}

// ── Normalized research artifacts ────────────────────────────────────────

export interface UpstreamResearchReport {
  id: string
  orgId: string
  brokerId: string
  sourceEmailId: string
  /** Null for HTML-only reports that had no PDF attachment. */
  sourceAttachmentId: string | null
  title: string
  publishedAt: string
  receivedAt: string
  reportType: string
  tickers: string[]
  sectorIds: string[]
  pageCount: number | null
  language: string
  status: string
  /** Null when the summary model has not yet processed this report. */
  summaryId: string | null
}

export interface UpstreamReportCatalyst {
  label: string
  expectedOn: string | null
}

export interface UpstreamReportSummary {
  id: string
  orgId: string
  reportId: string
  /** bullish | neutral | bearish */
  stance: string
  /** Buy | Overweight | Hold | Underweight | Sell | Not Rated | null */
  rating: string | null
  targetPrice: number | null
  priorTargetPrice: number | null
  targetCurrency: string | null
  thesis: string
  keyPoints: string[]
  themes: string[]
  risks: string[]
  catalysts: UpstreamReportCatalyst[]
  /** 0..1 inclusive. */
  confidence: number
  generatedAt: string
  generatorVersion: string
  evidenceIds: string[]
}

export interface UpstreamEvidenceSnippet {
  id: string
  orgId: string
  reportId: string
  summaryId: string | null
  attachmentId: string
  pageNumber: number
  textSnippet: string
  charOffsetStart: number | null
  charOffsetEnd: number | null
  /** Axis-aligned rect `[x1,y1,x2,y2]` in PDF points, or null. */
  boundingBox: [number, number, number, number] | null
  /** thesis | rating | targetPrice | keyPoint | risk | catalyst | theme */
  supportingField: string
  fieldRef: string
}

// ── Derived analytics ────────────────────────────────────────────────────

export interface UpstreamBrokerStockOpinion {
  orgId: string
  brokerId: string
  ticker: string
  rating: string | null
  stance: string
  targetPrice: number | null
  priorTargetPrice: number | null
  targetCurrency: string | null
  lastReportId: string
  lastUpdatedAt: string
  impliedUpsidePct: number | null
}

/** Full ConflictClosure shape — see `src/engine/types.ts` for field detail.
 *  This is a large aggregate; the mapper delegates to parsers.ts. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UpstreamConflictClosure { [k: string]: unknown }

/** Full SectorIntelligence shape — see `src/engine/types.ts`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UpstreamSectorIntelligence { [k: string]: unknown }

// ── Dashboard + ops ──────────────────────────────────────────────────────

export interface UpstreamKpiDelta {
  value: number
  windowDays: number
}

export interface UpstreamKpiSnapshot {
  orgId: string
  asOf: string
  brokersTracked: number
  reportsIngested: number
  stocksCovered: number
  divergenceFlags: number
  windowDeltas: {
    brokersTracked: UpstreamKpiDelta
    reportsIngested: UpstreamKpiDelta
    stocksCovered: UpstreamKpiDelta
    divergenceFlags: UpstreamKpiDelta
  }
}

export interface UpstreamIngestionStatus {
  orgId: string
  asOf: string
  queued: number
  processing: number
  readyLast24h: number
  failedLast24h: number
  throughputPerHour: number
}

// ── Pagination ───────────────────────────────────────────────────────────

export interface UpstreamPage<T> {
  /** Required. Empty array is allowed. */
  items: T[]
  /** Required. Null indicates the final page. */
  nextCursor: string | null
  /** Required. Total across all pages for this query. */
  totalCount: number
}
