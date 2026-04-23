import type {
  Organization, User, UserRole,
  Broker, BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet, ReportCatalyst, ReportType,
  EvidenceSupportingField,
  Stock, BrokerStockOpinion,
  Sector,
  KpiSnapshot, KpiDelta,
  IngestionStatus, EmailProcessingStatus,
  OrgScope, Page, Stance, Rating,
} from '../../domain'
import type {
  ConflictClosure, ConsensusPoint, DisagreementPoint,
  OutlierClassification, OutlierReason, ResultantLogic, ResultantState,
  StrengthBand, ConfidenceDetail, TargetStats, DisagreementDimension,
  SectorIntelligence, SectorSignal, SectorSignalClassification,
  SectorResultantEntry,
} from '../../engine/types'
import {
  asOrgId, asUserId, asBrokerId, asEmailId, asAttachmentId,
  asReportId, asSummaryId, asEvidenceId, asSectorId, asTicker,
} from '../../lib/ids'
import { ContractViolationError } from '../errors'

// Every response body the frontend accepts passes through one of these
// parsers. A parser asserts the top-level shape, the type of every field
// that the UI or engine depends on, and delegates to child parsers for
// nested aggregates. Failure to match throws ContractViolationError with
// a path like "ConflictClosure.disagreements[2].bullBrokerIds[0]" so
// backend changes surface their origin immediately.

// ─── Primitive asserts ─────────────────────────────────────────────────

function fail(path: string, detail: string): never {
  throw new ContractViolationError(path, detail)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (!isObject(v)) fail(path, `expected object, got ${typeOf(v)}`)
  return v
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, `expected array, got ${typeOf(v)}`)
  return v
}

function asString(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, `expected string, got ${typeOf(v)}`)
  return v
}

function asStringOrNull(v: unknown, path: string): string | null {
  if (v === null) return null
  return asString(v, path)
}

function asNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, `expected finite number, got ${typeOf(v)}`)
  return v
}

function asNumberOrNull(v: unknown, path: string): number | null {
  if (v === null) return null
  return asNumber(v, path)
}

function asInt(v: unknown, path: string): number {
  const n = asNumber(v, path)
  if (!Number.isInteger(n)) fail(path, `expected integer, got ${n}`)
  return n
}

function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, `expected boolean, got ${typeOf(v)}`)
  return v
}

function asEnum<T extends string>(v: unknown, valid: readonly T[], path: string): T {
  const s = asString(v, path)
  if (!valid.includes(s as T)) fail(path, `expected one of ${valid.join('|')}, got ${s}`)
  return s as T
}

function asStringArray(v: unknown, path: string): string[] {
  return asArray(v, path).map((x, i) => asString(x, `${path}[${i}]`))
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

// ─── Enum vocabularies ────────────────────────────────────────────────

const STANCES: readonly Stance[] = ['bullish', 'neutral', 'bearish']
const RATINGS: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'Not Rated']
const REPORT_TYPES: readonly ReportType[] = [
  'initiation', 'update', 'flash', 'earnings_preview', 'earnings_review',
  'morning_note', 'sector_note', 'deep_dive', 'other',
]
const EMAIL_STATES: readonly EmailProcessingStatus[] = [
  'received', 'queued', 'parsing', 'normalizing', 'summarizing', 'ready', 'failed', 'skipped',
]
const USER_ROLES: readonly UserRole[] = ['analyst', 'pm', 'admin', 'viewer']
const EVIDENCE_FIELDS: readonly EvidenceSupportingField[] = [
  'thesis', 'rating', 'targetPrice', 'keyPoint', 'risk', 'catalyst', 'theme',
]
const RESULTANT_STATES: readonly ResultantState[] = [
  'consensus_bullish', 'consensus_bearish', 'mixed_constructive',
  'mixed_cautious', 'unresolved', 'outlier_driven',
]
const STRENGTHS: readonly StrengthBand[] = ['strong', 'moderate', 'weak']
const OUTLIER_REASONS: readonly OutlierReason[] = ['target_price_z', 'rating_contrary', 'stance_contrary']
const DIMENSIONS: readonly DisagreementDimension[] = [
  'stance', 'rating', 'target_price', 'growth', 'margin',
  'demand_or_pricing', 'order_book', 'timing_or_catalyst', 'management_execution',
]
const SIGNAL_CLASSIFICATIONS: readonly SectorSignalClassification[] = [
  'repeated_sector', 'single_name', 'broker_specific', 'unresolved_debate',
]

// ─── Page<T> ──────────────────────────────────────────────────────────

export function parsePage<T>(raw: unknown, path: string, parseItem: (x: unknown, p: string) => T): Page<T> {
  const x = asObject(raw, path)
  return {
    items: asArray(x.items, `${path}.items`).map((item, i) => parseItem(item, `${path}.items[${i}]`)),
    nextCursor: asStringOrNull(x.nextCursor, `${path}.nextCursor`),
    totalCount: asInt(x.totalCount, `${path}.totalCount`),
  }
}

// ─── Session / tenant / catalog ───────────────────────────────────────

export function parseOrgScope(raw: unknown, path = 'OrgScope'): OrgScope {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    actingUserId: asUserId(asString(x.actingUserId, `${path}.actingUserId`)),
  }
}

export function parseOrganization(raw: unknown, path = 'Organization'): Organization {
  const x = asObject(raw, path)
  return {
    id: asOrgId(asString(x.id, `${path}.id`)),
    name: asString(x.name, `${path}.name`),
    shortName: asString(x.shortName, `${path}.shortName`),
    forwardingAddress: asString(x.forwardingAddress, `${path}.forwardingAddress`),
    createdAt: asString(x.createdAt, `${path}.createdAt`),
    enabledBrokerIds: asStringArray(x.enabledBrokerIds, `${path}.enabledBrokerIds`).map(asBrokerId),
    timeZone: asString(x.timeZone, `${path}.timeZone`),
    defaultCurrency: asString(x.defaultCurrency, `${path}.defaultCurrency`),
  }
}

export function parseUser(raw: unknown, path = 'User'): User {
  const x = asObject(raw, path)
  return {
    id: asUserId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    email: asString(x.email, `${path}.email`),
    displayName: asString(x.displayName, `${path}.displayName`),
    role: asEnum(x.role, USER_ROLES, `${path}.role`),
    createdAt: asString(x.createdAt, `${path}.createdAt`),
  }
}

export function parseBroker(raw: unknown, path = 'Broker'): Broker {
  const x = asObject(raw, path)
  return {
    id: asBrokerId(asString(x.id, `${path}.id`)),
    name: asString(x.name, `${path}.name`),
    shortName: asString(x.shortName, `${path}.shortName`),
    senderDomains: asStringArray(x.senderDomains, `${path}.senderDomains`),
    researchAliases: asStringArray(x.researchAliases, `${path}.researchAliases`),
    coverageTags: asStringArray(x.coverageTags, `${path}.coverageTags`),
    brandColor: asStringOrNull(x.brandColor, `${path}.brandColor`),
    website: asStringOrNull(x.website, `${path}.website`),
  }
}

export function parseSector(raw: unknown, path = 'Sector'): Sector {
  const x = asObject(raw, path)
  return {
    id: asSectorId(asString(x.id, `${path}.id`)),
    name: asString(x.name, `${path}.name`),
    parentId: x.parentId === null ? null : asSectorId(asString(x.parentId, `${path}.parentId`)),
    tickers: asStringArray(x.tickers, `${path}.tickers`).map(asTicker),
  }
}

export function parseStock(raw: unknown, path = 'Stock'): Stock {
  const x = asObject(raw, path)
  return {
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    name: asString(x.name, `${path}.name`),
    sectorId: asSectorId(asString(x.sectorId, `${path}.sectorId`)),
    currency: asString(x.currency, `${path}.currency`),
    exchange: asStringOrNull(x.exchange, `${path}.exchange`),
    lastPrice: asNumberOrNull(x.lastPrice, `${path}.lastPrice`),
    lastPriceAsOf: asStringOrNull(x.lastPriceAsOf, `${path}.lastPriceAsOf`),
  }
}

// ─── Inbound pipeline ─────────────────────────────────────────────────

export function parseBrokerEmail(raw: unknown, path = 'BrokerEmail'): BrokerEmail {
  const x = asObject(raw, path)
  return {
    id: asEmailId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    brokerId: x.brokerId === null ? null : asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    senderAddress: asString(x.senderAddress, `${path}.senderAddress`),
    senderName: asString(x.senderName, `${path}.senderName`),
    recipientAddress: asString(x.recipientAddress, `${path}.recipientAddress`),
    subject: asString(x.subject, `${path}.subject`),
    bodyPreview: asString(x.bodyPreview, `${path}.bodyPreview`),
    receivedAt: asString(x.receivedAt, `${path}.receivedAt`),
    forwardedFrom: asStringArray(x.forwardedFrom, `${path}.forwardedFrom`),
    attachmentIds: asStringArray(x.attachmentIds, `${path}.attachmentIds`).map(asAttachmentId),
    reportIds: asStringArray(x.reportIds, `${path}.reportIds`).map(asReportId),
    status: asEnum(x.status, EMAIL_STATES, `${path}.status`),
    statusMessage: asStringOrNull(x.statusMessage, `${path}.statusMessage`),
    sourceMessageId: asString(x.sourceMessageId, `${path}.sourceMessageId`),
  }
}

export function parseAttachment(raw: unknown, path = 'Attachment'): Attachment {
  const x = asObject(raw, path)
  return {
    id: asAttachmentId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    emailId: asEmailId(asString(x.emailId, `${path}.emailId`)),
    filename: asString(x.filename, `${path}.filename`),
    mimeType: asString(x.mimeType, `${path}.mimeType`),
    sizeBytes: asInt(x.sizeBytes, `${path}.sizeBytes`),
    checksumSha256: asString(x.checksumSha256, `${path}.checksumSha256`),
    storageRef: asString(x.storageRef, `${path}.storageRef`),
    pageCount: x.pageCount === null ? null : asInt(x.pageCount, `${path}.pageCount`),
    language: asStringOrNull(x.language, `${path}.language`),
    parseStatus: asEnum(x.parseStatus, EMAIL_STATES, `${path}.parseStatus`),
    parseErrorMessage: asStringOrNull(x.parseErrorMessage, `${path}.parseErrorMessage`),
  }
}

// ─── Research artifacts ───────────────────────────────────────────────

export function parseResearchReport(raw: unknown, path = 'ResearchReport'): ResearchReport {
  const x = asObject(raw, path)
  return {
    id: asReportId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    sourceEmailId: asEmailId(asString(x.sourceEmailId, `${path}.sourceEmailId`)),
    sourceAttachmentId: x.sourceAttachmentId === null
      ? null
      : asAttachmentId(asString(x.sourceAttachmentId, `${path}.sourceAttachmentId`)),
    title: asString(x.title, `${path}.title`),
    publishedAt: asString(x.publishedAt, `${path}.publishedAt`),
    receivedAt: asString(x.receivedAt, `${path}.receivedAt`),
    reportType: asEnum(x.reportType, REPORT_TYPES, `${path}.reportType`),
    tickers: asStringArray(x.tickers, `${path}.tickers`).map(asTicker),
    sectorIds: asStringArray(x.sectorIds, `${path}.sectorIds`).map(asSectorId),
    pageCount: x.pageCount === null ? null : asInt(x.pageCount, `${path}.pageCount`),
    language: asString(x.language, `${path}.language`),
    status: asEnum(x.status, EMAIL_STATES, `${path}.status`),
    summaryId: x.summaryId === null ? null : asSummaryId(asString(x.summaryId, `${path}.summaryId`)),
  }
}

function parseCatalyst(raw: unknown, path: string): ReportCatalyst {
  const x = asObject(raw, path)
  return {
    label: asString(x.label, `${path}.label`),
    expectedOn: asStringOrNull(x.expectedOn, `${path}.expectedOn`),
  }
}

export function parseReportSummary(raw: unknown, path = 'ReportSummary'): ReportSummary {
  const x = asObject(raw, path)
  return {
    id: asSummaryId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    reportId: asReportId(asString(x.reportId, `${path}.reportId`)),
    stance: asEnum(x.stance, STANCES, `${path}.stance`),
    rating: x.rating === null ? null : asEnum(x.rating, RATINGS, `${path}.rating`),
    targetPrice: asNumberOrNull(x.targetPrice, `${path}.targetPrice`),
    priorTargetPrice: asNumberOrNull(x.priorTargetPrice, `${path}.priorTargetPrice`),
    targetCurrency: asStringOrNull(x.targetCurrency, `${path}.targetCurrency`),
    thesis: asString(x.thesis, `${path}.thesis`),
    keyPoints: asStringArray(x.keyPoints, `${path}.keyPoints`),
    themes: asStringArray(x.themes, `${path}.themes`),
    risks: asStringArray(x.risks, `${path}.risks`),
    catalysts: asArray(x.catalysts, `${path}.catalysts`).map((c, i) => parseCatalyst(c, `${path}.catalysts[${i}]`)),
    confidence: asNumber(x.confidence, `${path}.confidence`),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    generatorVersion: asString(x.generatorVersion, `${path}.generatorVersion`),
    evidenceIds: asStringArray(x.evidenceIds, `${path}.evidenceIds`).map(asEvidenceId),
  }
}

export function parseEvidenceSnippet(raw: unknown, path = 'EvidenceSnippet'): EvidenceSnippet {
  const x = asObject(raw, path)
  const box = x.boundingBox
  const boundingBox: EvidenceSnippet['boundingBox'] = box === null
    ? null
    : (() => {
        const arr = asArray(box, `${path}.boundingBox`)
        if (arr.length !== 4) fail(`${path}.boundingBox`, `expected 4 numbers, got ${arr.length}`)
        return [
          asNumber(arr[0], `${path}.boundingBox[0]`),
          asNumber(arr[1], `${path}.boundingBox[1]`),
          asNumber(arr[2], `${path}.boundingBox[2]`),
          asNumber(arr[3], `${path}.boundingBox[3]`),
        ] as [number, number, number, number]
      })()
  return {
    id: asEvidenceId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    reportId: asReportId(asString(x.reportId, `${path}.reportId`)),
    summaryId: x.summaryId === null ? null : asSummaryId(asString(x.summaryId, `${path}.summaryId`)),
    attachmentId: asAttachmentId(asString(x.attachmentId, `${path}.attachmentId`)),
    pageNumber: asInt(x.pageNumber, `${path}.pageNumber`),
    textSnippet: asString(x.textSnippet, `${path}.textSnippet`),
    charOffsetStart: x.charOffsetStart === null ? null : asInt(x.charOffsetStart, `${path}.charOffsetStart`),
    charOffsetEnd: x.charOffsetEnd === null ? null : asInt(x.charOffsetEnd, `${path}.charOffsetEnd`),
    boundingBox,
    supportingField: asEnum(x.supportingField, EVIDENCE_FIELDS, `${path}.supportingField`),
    fieldRef: asString(x.fieldRef, `${path}.fieldRef`),
  }
}

// ─── Derived analytics ────────────────────────────────────────────────

export function parseBrokerStockOpinion(raw: unknown, path = 'BrokerStockOpinion'): BrokerStockOpinion {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    rating: x.rating === null ? null : asEnum(x.rating, RATINGS, `${path}.rating`),
    stance: asEnum(x.stance, STANCES, `${path}.stance`),
    targetPrice: asNumberOrNull(x.targetPrice, `${path}.targetPrice`),
    priorTargetPrice: asNumberOrNull(x.priorTargetPrice, `${path}.priorTargetPrice`),
    targetCurrency: asStringOrNull(x.targetCurrency, `${path}.targetCurrency`),
    lastReportId: asReportId(asString(x.lastReportId, `${path}.lastReportId`)),
    lastUpdatedAt: asString(x.lastUpdatedAt, `${path}.lastUpdatedAt`),
    impliedUpsidePct: asNumberOrNull(x.impliedUpsidePct, `${path}.impliedUpsidePct`),
  }
}

function parseStanceDistribution(raw: unknown, path: string): Record<Stance, number> {
  const x = asObject(raw, path)
  return {
    bullish: asInt(x.bullish, `${path}.bullish`),
    neutral: asInt(x.neutral, `${path}.neutral`),
    bearish: asInt(x.bearish, `${path}.bearish`),
  }
}

function parseRatingDistribution(raw: unknown, path: string): Partial<Record<Rating, number>> {
  const x = asObject(raw, path)
  const out: Partial<Record<Rating, number>> = {}
  for (const key of Object.keys(x)) {
    if (!RATINGS.includes(key as Rating)) fail(`${path}.${key}`, `unknown rating key`)
    out[key as Rating] = asInt(x[key], `${path}.${key}`)
  }
  return out
}

function parseTargetStats(raw: unknown, path: string): TargetStats {
  const x = asObject(raw, path)
  return {
    count: asInt(x.count, `${path}.count`),
    mean: asNumberOrNull(x.mean, `${path}.mean`),
    median: asNumberOrNull(x.median, `${path}.median`),
    high: asNumberOrNull(x.high, `${path}.high`),
    low: asNumberOrNull(x.low, `${path}.low`),
    stdev: asNumberOrNull(x.stdev, `${path}.stdev`),
    spreadPct: asNumberOrNull(x.spreadPct, `${path}.spreadPct`),
  }
}

function parseConsensusPoint(raw: unknown, path: string): ConsensusPoint {
  const x = asObject(raw, path)
  return {
    dimension: asEnum(x.dimension, DIMENSIONS, `${path}.dimension`),
    topic: asString(x.topic, `${path}.topic`),
    claim: asString(x.claim, `${path}.claim`),
    polarity: asEnum(x.polarity, STANCES, `${path}.polarity`),
    supportingBrokerIds: asStringArray(x.supportingBrokerIds, `${path}.supportingBrokerIds`).map(asBrokerId),
    supportingClaims: asStringArray(x.supportingClaims, `${path}.supportingClaims`),
    evidenceIds: asStringArray(x.evidenceIds, `${path}.evidenceIds`).map(asEvidenceId),
  }
}

function parseDisagreementPoint(raw: unknown, path: string): DisagreementPoint {
  const x = asObject(raw, path)
  return {
    dimension: asEnum(x.dimension, DIMENSIONS, `${path}.dimension`),
    topic: asString(x.topic, `${path}.topic`),
    bullClaims: asStringArray(x.bullClaims, `${path}.bullClaims`),
    bearClaims: asStringArray(x.bearClaims, `${path}.bearClaims`),
    bullBrokerIds: asStringArray(x.bullBrokerIds, `${path}.bullBrokerIds`).map(asBrokerId),
    bearBrokerIds: asStringArray(x.bearBrokerIds, `${path}.bearBrokerIds`).map(asBrokerId),
    bullEvidenceIds: asStringArray(x.bullEvidenceIds, `${path}.bullEvidenceIds`).map(asEvidenceId),
    bearEvidenceIds: asStringArray(x.bearEvidenceIds, `${path}.bearEvidenceIds`).map(asEvidenceId),
  }
}

function parseOutlierClassification(raw: unknown, path: string): OutlierClassification {
  const x = asObject(raw, path)
  const reasons = asArray(x.reasons, `${path}.reasons`).map((r, i) =>
    asEnum(r, OUTLIER_REASONS, `${path}.reasons[${i}]`))
  const direction = asString(x.direction, `${path}.direction`)
  if (direction !== 'bullish' && direction !== 'bearish') {
    fail(`${path}.direction`, `expected bullish|bearish, got ${direction}`)
  }
  return {
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    reasons,
    primaryReason: asEnum(x.primaryReason, OUTLIER_REASONS, `${path}.primaryReason`),
    direction,
    targetZScore: asNumberOrNull(x.targetZScore, `${path}.targetZScore`),
    notes: asString(x.notes, `${path}.notes`),
  }
}

function parseResultantLogic(raw: unknown, path: string): ResultantLogic {
  const x = asObject(raw, path)
  return {
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    state: asEnum(x.state, RESULTANT_STATES, `${path}.state`),
    strength: asEnum(x.strength, STRENGTHS, `${path}.strength`),
    narrative: asString(x.narrative, `${path}.narrative`),
    keyDrivers: asStringArray(x.keyDrivers, `${path}.keyDrivers`),
    openQuestions: asStringArray(x.openQuestions, `${path}.openQuestions`),
    asOf: asString(x.asOf, `${path}.asOf`),
  }
}

function parseConfidenceDetail(raw: unknown, path: string): ConfidenceDetail {
  const x = asObject(raw, path)
  return {
    score: asNumber(x.score, `${path}.score`),
    band: asEnum(x.band, STRENGTHS, `${path}.band`),
    rationale: asStringArray(x.rationale, `${path}.rationale`),
  }
}

export function parseConflictClosure(raw: unknown, path = 'ConflictClosure'): ConflictClosure {
  const x = asObject(raw, path)
  return {
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    asOf: asString(x.asOf, `${path}.asOf`),
    brokerCount: asInt(x.brokerCount, `${path}.brokerCount`),
    brokerIds: asStringArray(x.brokerIds, `${path}.brokerIds`).map(asBrokerId),
    lastReportIds: asStringArray(x.lastReportIds, `${path}.lastReportIds`).map(asReportId),
    stanceDistribution: parseStanceDistribution(x.stanceDistribution, `${path}.stanceDistribution`),
    ratingDistribution: parseRatingDistribution(x.ratingDistribution, `${path}.ratingDistribution`),
    targetStats: parseTargetStats(x.targetStats, `${path}.targetStats`),
    consensus: asArray(x.consensus, `${path}.consensus`).map((c, i) => parseConsensusPoint(c, `${path}.consensus[${i}]`)),
    disagreements: asArray(x.disagreements, `${path}.disagreements`).map((d, i) => parseDisagreementPoint(d, `${path}.disagreements[${i}]`)),
    outliers: asArray(x.outliers, `${path}.outliers`).map((o, i) => parseOutlierClassification(o, `${path}.outliers[${i}]`)),
    resultant: parseResultantLogic(x.resultant, `${path}.resultant`),
    confidence: parseConfidenceDetail(x.confidence, `${path}.confidence`),
  }
}

// ─── Sector intelligence ──────────────────────────────────────────────

function parseSectorSignal(raw: unknown, path: string): SectorSignal {
  const x = asObject(raw, path)
  return {
    theme: asString(x.theme, `${path}.theme`),
    classification: asEnum(x.classification, SIGNAL_CLASSIFICATIONS, `${path}.classification`),
    tickers: asStringArray(x.tickers, `${path}.tickers`).map(asTicker),
    brokerIds: asStringArray(x.brokerIds, `${path}.brokerIds`).map(asBrokerId),
    stanceLean: asEnum(x.stanceLean, STANCES, `${path}.stanceLean`),
    evidenceIds: asStringArray(x.evidenceIds, `${path}.evidenceIds`).map(asEvidenceId),
    mentionCount: asInt(x.mentionCount, `${path}.mentionCount`),
    firstSeen: asString(x.firstSeen, `${path}.firstSeen`),
    lastSeen: asString(x.lastSeen, `${path}.lastSeen`),
  }
}

function parseSectorResultantEntry(raw: unknown, path: string): SectorResultantEntry {
  const x = asObject(raw, path)
  return {
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    state: asEnum(x.state, RESULTANT_STATES, `${path}.state`),
    strength: asEnum(x.strength, STRENGTHS, `${path}.strength`),
  }
}

export function parseSectorIntelligence(raw: unknown, path = 'SectorIntelligence'): SectorIntelligence {
  const x = asObject(raw, path)
  return {
    sectorId: asSectorId(asString(x.sectorId, `${path}.sectorId`)),
    sectorName: asString(x.sectorName, `${path}.sectorName`),
    periodStart: asString(x.periodStart, `${path}.periodStart`),
    periodEnd: asString(x.periodEnd, `${path}.periodEnd`),
    asOf: asString(x.asOf, `${path}.asOf`),
    reportCount: asInt(x.reportCount, `${path}.reportCount`),
    tickerCount: asInt(x.tickerCount, `${path}.tickerCount`),
    brokerCount: asInt(x.brokerCount, `${path}.brokerCount`),
    aggregateStance: asEnum(x.aggregateStance, STANCES, `${path}.aggregateStance`),
    aggregateStanceScore: asNumber(x.aggregateStanceScore, `${path}.aggregateStanceScore`),
    signals: asArray(x.signals, `${path}.signals`).map((s, i) => parseSectorSignal(s, `${path}.signals[${i}]`)),
    resultantStates: asArray(x.resultantStates, `${path}.resultantStates`).map((r, i) => parseSectorResultantEntry(r, `${path}.resultantStates[${i}]`)),
  }
}

// ─── KPI + ops ────────────────────────────────────────────────────────

function parseKpiDelta(raw: unknown, path: string): KpiDelta {
  const x = asObject(raw, path)
  return {
    value: asNumber(x.value, `${path}.value`),
    windowDays: asInt(x.windowDays, `${path}.windowDays`),
  }
}

export function parseKpiSnapshot(raw: unknown, path = 'KpiSnapshot'): KpiSnapshot {
  const x = asObject(raw, path)
  const deltas = asObject(x.windowDeltas, `${path}.windowDeltas`)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    asOf: asString(x.asOf, `${path}.asOf`),
    brokersTracked: asInt(x.brokersTracked, `${path}.brokersTracked`),
    reportsIngested: asInt(x.reportsIngested, `${path}.reportsIngested`),
    stocksCovered: asInt(x.stocksCovered, `${path}.stocksCovered`),
    divergenceFlags: asInt(x.divergenceFlags, `${path}.divergenceFlags`),
    windowDeltas: {
      brokersTracked:  parseKpiDelta(deltas.brokersTracked,  `${path}.windowDeltas.brokersTracked`),
      reportsIngested: parseKpiDelta(deltas.reportsIngested, `${path}.windowDeltas.reportsIngested`),
      stocksCovered:   parseKpiDelta(deltas.stocksCovered,   `${path}.windowDeltas.stocksCovered`),
      divergenceFlags: parseKpiDelta(deltas.divergenceFlags, `${path}.windowDeltas.divergenceFlags`),
    },
  }
}

export function parseIngestionStatus(raw: unknown, path = 'IngestionStatus'): IngestionStatus {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    asOf: asString(x.asOf, `${path}.asOf`),
    queued: asInt(x.queued, `${path}.queued`),
    processing: asInt(x.processing, `${path}.processing`),
    readyLast24h: asInt(x.readyLast24h, `${path}.readyLast24h`),
    failedLast24h: asInt(x.failedLast24h, `${path}.failedLast24h`),
    throughputPerHour: asNumber(x.throughputPerHour, `${path}.throughputPerHour`),
  }
}

// Silence "declared but not used" for unused asBoolean helper in the build.
// It's kept exported because future body-bearing endpoints may need it.
export { asBoolean }
