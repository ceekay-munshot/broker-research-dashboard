import type {
  Organization, User, UserRole,
  Broker, BrokerEmail, Attachment,
  ResearchReport, ReportSummary, EvidenceSnippet, ReportCatalyst, ReportType,
  EvidenceSupportingField,
  Stock, BrokerStockOpinion,
  Sector,
  KpiSnapshot, KpiDelta,
  IngestionStatus, EmailProcessingStatus,
  PortfolioSnapshot, PortfolioPosition, WatchlistEntry,
  PortfolioDirection, PortfolioConviction,
  AlertEvent, AlertDigest, DigestSection, DigestKind,
  AlertSeverity, AlertTriggerKind, DeliveryChannel, AlertAudience,
  AlertReason, AlertBookContext, AlertLineage,
  PortfolioMembership,
  CalibrationSnapshot, BrokerCalibrationSummary, BrokerSectorBreakdown,
  AlertEffectivenessSummary, AlertEffectivenessByMembership, AlertEffectivenessMembership,
  CoverageSignalResult, OutcomeWindowResult, CalibrationReason,
  ConfidenceBand, ReturnWindow,
  CatalystEvent, CatalystType, CatalystStatus, CatalystImportance,
  CatalystSource, CatalystCalendarEntry, EventRiskFlag,
  ExpectationSnapshot, ExpectationBrokerOpinion, ExpectationStanceMix,
  EventExpectationDelta, EventMonitoringWindow, ExpectationDeltaSign,
  PreEventBrief, PreEventBriefSection, PostEventReview,
  RealizedOutcome, RealizedOutcomeWindow,
  BrokerVerdict, BrokerVerdictKind,
  DivergenceResolution, DivergenceResolutionKind,
  ExpectationError, ExpectationErrorKind,
  CalibrationFeedback, PostEventReviewConfidenceBand,
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
  asReportId, asSummaryId, asEvidenceId, asSectorId, asTicker, asPortfolioId,
  asAlertId, asDigestId, asDigestRunId,
  asCalibrationSnapshotId,
  asCatalystId, asPreEventBriefId, asPostEventReviewId,
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

// ─── Portfolio / watchlist ────────────────────────────────────────────

const PF_DIRECTIONS: readonly PortfolioDirection[] = ['long', 'short', 'hedge']
const PF_CONVICTIONS: readonly PortfolioConviction[] = ['high', 'medium', 'low']

export function parsePortfolioSnapshot(raw: unknown, path = 'PortfolioSnapshot'): PortfolioSnapshot {
  const x = asObject(raw, path)
  return {
    id: asPortfolioId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    asOf: asString(x.asOf, `${path}.asOf`),
    source: asString(x.source, `${path}.source`),
    positions: asArray(x.positions, `${path}.positions`)
      .map((p, i) => parsePortfolioPosition(p, `${path}.positions[${i}]`)),
    watchlist: asArray(x.watchlist, `${path}.watchlist`)
      .map((w, i) => parseWatchlistEntry(w, `${path}.watchlist[${i}]`)),
    totalGrossExposurePct: asNumberOrNull(x.totalGrossExposurePct, `${path}.totalGrossExposurePct`),
    isConfigured: asBoolean(x.isConfigured, `${path}.isConfigured`),
  }
}

function parsePortfolioPosition(raw: unknown, path: string): PortfolioPosition {
  const x = asObject(raw, path)
  const conviction = x.conviction === null
    ? null
    : asEnum<PortfolioConviction>(x.conviction, PF_CONVICTIONS, `${path}.conviction`)
  return {
    portfolioId: asPortfolioId(asString(x.portfolioId, `${path}.portfolioId`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    direction: asEnum<PortfolioDirection>(x.direction, PF_DIRECTIONS, `${path}.direction`),
    weightPct: asNumberOrNull(x.weightPct, `${path}.weightPct`),
    costBasis: asNumberOrNull(x.costBasis, `${path}.costBasis`),
    conviction,
    tags: asStringArray(x.tags, `${path}.tags`),
    ownerUserId: x.ownerUserId === null ? null : asUserId(asString(x.ownerUserId, `${path}.ownerUserId`)),
    openedAt: asStringOrNull(x.openedAt, `${path}.openedAt`),
    note: asStringOrNull(x.note, `${path}.note`),
  }
}

function parseWatchlistEntry(raw: unknown, path: string): WatchlistEntry {
  const x = asObject(raw, path)
  return {
    portfolioId: asPortfolioId(asString(x.portfolioId, `${path}.portfolioId`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    addedAt: asString(x.addedAt, `${path}.addedAt`),
    tags: asStringArray(x.tags, `${path}.tags`),
    ownerUserId: x.ownerUserId === null ? null : asUserId(asString(x.ownerUserId, `${path}.ownerUserId`)),
    note: asStringOrNull(x.note, `${path}.note`),
  }
}

// ─── Alerts / digests (Module 19) ─────────────────────────────────────

const ALERT_SEVERITIES_LOCAL: readonly AlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
const ALERT_KINDS_LOCAL: readonly AlertTriggerKind[] = [
  'new_research_held', 'new_research_watchlist',
  'significant_change_held', 'against_position',
  'unresolved_divergence_held', 'broker_outlier_held',
  'pile_in_book',
  'stale_coverage_high_conviction', 'stale_coverage_held', 'stale_coverage_watchlist',
  'watchlist_fresh_candidate', 'correction_replay_change',
]
const PF_MEMBERSHIPS_LOCAL: readonly PortfolioMembership[] = ['held', 'watchlist', 'adjacent', 'none']
const PF_DIRECTIONS_LOCAL: readonly PortfolioDirection[] = ['long', 'short', 'hedge']
const PF_CONVICTIONS_LOCAL: readonly PortfolioConviction[] = ['high', 'medium', 'low']
const ALERT_AUDIENCES_LOCAL: readonly AlertAudience[] = ['pm', 'analyst', 'team', 'all']
const DIGEST_KINDS_LOCAL: readonly DigestKind[] = ['morning_brief', 'intraday_critical', 'coverage_hygiene']
// Reserved for the future when alerts list deliveries inline.
void ([] as readonly DeliveryChannel[])

export function parseAlertEvent(raw: unknown, path = 'AlertEvent'): AlertEvent {
  const x = asObject(raw, path)
  const reasons = asArray(x.reasons, `${path}.reasons`).map((r, i) => parseAlertReason(r, `${path}.reasons[${i}]`))
  const bookCtx = x.bookContext === null ? null : parseBookContext(x.bookContext, `${path}.bookContext`)
  const lineage = parseLineage(x.lineage, `${path}.lineage`)
  return {
    id: asAlertId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    kind: asEnum<AlertTriggerKind>(x.kind, ALERT_KINDS_LOCAL, `${path}.kind`),
    severity: asEnum<AlertSeverity>(x.severity, ALERT_SEVERITIES_LOCAL, `${path}.severity`),
    audience: asEnum<AlertAudience>(x.audience, ALERT_AUDIENCES_LOCAL, `${path}.audience`),
    headline: asString(x.headline, `${path}.headline`),
    body: asString(x.body, `${path}.body`),
    reasons,
    bookContext: bookCtx,
    lineage,
    fingerprint: asString(x.fingerprint, `${path}.fingerprint`),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    expiresAt: asStringOrNull(x.expiresAt, `${path}.expiresAt`),
    suppressed: asBoolean(x.suppressed, `${path}.suppressed`),
    suppressedReason: asStringOrNull(x.suppressedReason, `${path}.suppressedReason`),
  }
}

function parseAlertReason(raw: unknown, path: string): AlertReason {
  const x = asObject(raw, path)
  const r: AlertReason = {
    code: asString(x.code, `${path}.code`),
    text: asString(x.text, `${path}.text`),
    ...(x.severityDelta !== undefined && x.severityDelta !== null
      ? { severityDelta: asNumber(x.severityDelta, `${path}.severityDelta`) }
      : {}),
  }
  return r
}

function parseBookContext(raw: unknown, path: string): AlertBookContext {
  const x = asObject(raw, path)
  return {
    membership: asEnum<PortfolioMembership>(x.membership, PF_MEMBERSHIPS_LOCAL, `${path}.membership`),
    direction: x.direction === null ? null : asEnum<PortfolioDirection>(x.direction, PF_DIRECTIONS_LOCAL, `${path}.direction`),
    conviction: x.conviction === null ? null : asEnum<PortfolioConviction>(x.conviction, PF_CONVICTIONS_LOCAL, `${path}.conviction`),
    weightPct: asNumberOrNull(x.weightPct, `${path}.weightPct`),
  }
}

function parseLineage(raw: unknown, path: string): AlertLineage {
  const x = asObject(raw, path)
  return {
    reportId: x.reportId === null ? null : asReportId(asString(x.reportId, `${path}.reportId`)),
    brokerId: x.brokerId === null ? null : asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    ticker: x.ticker === null ? null : asTicker(asString(x.ticker, `${path}.ticker`)),
    supersedes: asArray(x.supersedes, `${path}.supersedes`).map((s, i) => asAlertId(asString(s, `${path}.supersedes[${i}]`))),
  }
}

export function parseAlertDigest(raw: unknown, path = 'AlertDigest'): AlertDigest {
  const x = asObject(raw, path)
  const sections = asArray(x.sections, `${path}.sections`).map((s, i) => parseDigestSection(s, `${path}.sections[${i}]`))
  return {
    id: asDigestId(asString(x.id, `${path}.id`)),
    runId: asDigestRunId(asString(x.runId, `${path}.runId`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    kind: asEnum<DigestKind>(x.kind, DIGEST_KINDS_LOCAL, `${path}.kind`),
    title: asString(x.title, `${path}.title`),
    subtitle: asString(x.subtitle, `${path}.subtitle`),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    windowStart: asString(x.windowStart, `${path}.windowStart`),
    windowEnd: asString(x.windowEnd, `${path}.windowEnd`),
    sections,
    alertCount: asInt(x.alertCount, `${path}.alertCount`),
    topSeverity: x.topSeverity === null ? null : asEnum<AlertSeverity>(x.topSeverity, ALERT_SEVERITIES_LOCAL, `${path}.topSeverity`),
    executiveSummary: asStringOrNull(x.executiveSummary, `${path}.executiveSummary`),
    executiveSummaryFromLlm: asBoolean(x.executiveSummaryFromLlm, `${path}.executiveSummaryFromLlm`),
  }
}

function parseDigestSection(raw: unknown, path: string): DigestSection {
  const x = asObject(raw, path)
  return {
    key: asString(x.key, `${path}.key`),
    title: asString(x.title, `${path}.title`),
    subtitle: asString(x.subtitle, `${path}.subtitle`),
    alertIds: asArray(x.alertIds, `${path}.alertIds`).map((a, i) => asAlertId(asString(a, `${path}.alertIds[${i}]`))),
    prose: asStringOrNull(x.prose, `${path}.prose`),
    proseFromLlm: asBoolean(x.proseFromLlm, `${path}.proseFromLlm`),
  }
}

// ─── Calibration / signal effectiveness (Module 20) ────────────────────

const RETURN_WINDOWS_LOCAL: readonly ReturnWindow[] = ['1d', '3d', '5d', '10d', '20d']
const CONFIDENCE_BANDS_LOCAL: readonly ConfidenceBand[] = ['very_low', 'low', 'medium', 'high']
const ALERT_KINDS_LOCAL2: readonly AlertTriggerKind[] = [
  'new_research_held', 'new_research_watchlist',
  'significant_change_held', 'against_position',
  'unresolved_divergence_held', 'broker_outlier_held',
  'pile_in_book',
  'stale_coverage_high_conviction', 'stale_coverage_held', 'stale_coverage_watchlist',
  'watchlist_fresh_candidate', 'correction_replay_change',
]
const ALERT_MEMBERSHIPS_LOCAL: readonly AlertEffectivenessMembership[] = ['all', 'held', 'watchlist']

function parseCalibrationReason(raw: unknown, path: string): CalibrationReason {
  const x = asObject(raw, path)
  return { code: asString(x.code, `${path}.code`), text: asString(x.text, `${path}.text`) }
}

function parseOutcomeWindow(raw: unknown, path: string): OutcomeWindowResult {
  const x = asObject(raw, path)
  return {
    window: asEnum<ReturnWindow>(x.window, RETURN_WINDOWS_LOCAL, `${path}.window`),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
    medianReturnPct: asNumber(x.medianReturnPct, `${path}.medianReturnPct`),
    p25ReturnPct: asNumber(x.p25ReturnPct, `${path}.p25ReturnPct`),
    p75ReturnPct: asNumber(x.p75ReturnPct, `${path}.p75ReturnPct`),
    upsideAvgPct: asNumber(x.upsideAvgPct, `${path}.upsideAvgPct`),
    downsideAvgPct: asNumber(x.downsideAvgPct, `${path}.downsideAvgPct`),
    stddevPct: asNumber(x.stddevPct, `${path}.stddevPct`),
    meanRelReturnPct: x.meanRelReturnPct === null ? null : asNumber(x.meanRelReturnPct, `${path}.meanRelReturnPct`),
    directionalSampleSize: asInt(x.directionalSampleSize, `${path}.directionalSampleSize`),
  }
}

function parseBrokerSectorBreakdown(raw: unknown, path: string): BrokerSectorBreakdown {
  const x = asObject(raw, path)
  return {
    sectorId: asSectorId(asString(x.sectorId, `${path}.sectorId`)),
    sectorName: asStringOrNull(x.sectorName, `${path}.sectorName`),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
  }
}

export function parseBrokerCalibrationSummary(raw: unknown, path = 'BrokerCalibrationSummary'): BrokerCalibrationSummary {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    brokerShortName: asString(x.brokerShortName, `${path}.brokerShortName`),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    score: asNumber(x.score, `${path}.score`),
    confidence: asEnum<ConfidenceBand>(x.confidence, CONFIDENCE_BANDS_LOCAL, `${path}.confidence`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
    byWindow: asArray(x.byWindow, `${path}.byWindow`).map((w, i) => parseOutcomeWindow(w, `${path}.byWindow[${i}]`)),
    heldByWindow: asArray(x.heldByWindow, `${path}.heldByWindow`).map((w, i) => parseOutcomeWindow(w, `${path}.heldByWindow[${i}]`)),
    bySector: asArray(x.bySector, `${path}.bySector`).map((s, i) => parseBrokerSectorBreakdown(s, `${path}.bySector[${i}]`)),
    longHitRate: x.longHitRate === null ? null : asNumber(x.longHitRate, `${path}.longHitRate`),
    shortHitRate: x.shortHitRate === null ? null : asNumber(x.shortHitRate, `${path}.shortHitRate`),
    againstPositionHitRate: x.againstPositionHitRate === null ? null : asNumber(x.againstPositionHitRate, `${path}.againstPositionHitRate`),
    againstPositionSampleSize: asInt(x.againstPositionSampleSize, `${path}.againstPositionSampleSize`),
    reasons: asArray(x.reasons, `${path}.reasons`).map((r, i) => parseCalibrationReason(r, `${path}.reasons[${i}]`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
  }
}

function parseAlertEffectivenessByMembership(raw: unknown, path: string): AlertEffectivenessByMembership {
  const x = asObject(raw, path)
  return {
    membership: asEnum<AlertEffectivenessMembership>(x.membership, ALERT_MEMBERSHIPS_LOCAL, `${path}.membership`),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
  }
}

export function parseAlertEffectivenessSummary(raw: unknown, path = 'AlertEffectivenessSummary'): AlertEffectivenessSummary {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    kind: asEnum<AlertTriggerKind>(x.kind, ALERT_KINDS_LOCAL2, `${path}.kind`),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    score: asNumber(x.score, `${path}.score`),
    confidence: asEnum<ConfidenceBand>(x.confidence, CONFIDENCE_BANDS_LOCAL, `${path}.confidence`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
    byWindow: asArray(x.byWindow, `${path}.byWindow`).map((w, i) => parseOutcomeWindow(w, `${path}.byWindow[${i}]`)),
    byMembership: asArray(x.byMembership, `${path}.byMembership`).map((m, i) => parseAlertEffectivenessByMembership(m, `${path}.byMembership[${i}]`)),
    reasons: asArray(x.reasons, `${path}.reasons`).map((r, i) => parseCalibrationReason(r, `${path}.reasons[${i}]`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
  }
}

export function parseCoverageSignalResult(raw: unknown, path = 'CoverageSignalResult'): CoverageSignalResult {
  const x = asObject(raw, path)
  const topRaw = asArray(x.topBrokers, `${path}.topBrokers`)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    sampleSize: asInt(x.sampleSize, `${path}.sampleSize`),
    score: x.score === null ? null : asNumber(x.score, `${path}.score`),
    confidence: asEnum<ConfidenceBand>(x.confidence, CONFIDENCE_BANDS_LOCAL, `${path}.confidence`),
    hitRate: x.hitRate === null ? null : asNumber(x.hitRate, `${path}.hitRate`),
    meanReturnPct: asNumber(x.meanReturnPct, `${path}.meanReturnPct`),
    topBrokers: topRaw.map((b, i) => {
      const o = asObject(b, `${path}.topBrokers[${i}]`)
      return {
        brokerId: asBrokerId(asString(o.brokerId, `${path}.topBrokers[${i}].brokerId`)),
        brokerShortName: asString(o.brokerShortName, `${path}.topBrokers[${i}].brokerShortName`),
        sampleSize: asInt(o.sampleSize, `${path}.topBrokers[${i}].sampleSize`),
        score: asNumber(o.score, `${path}.topBrokers[${i}].score`),
        hitRate: o.hitRate === null ? null : asNumber(o.hitRate, `${path}.topBrokers[${i}].hitRate`),
      }
    }),
    recentAlertEffectivenessNote: asStringOrNull(x.recentAlertEffectivenessNote, `${path}.recentAlertEffectivenessNote`),
    reasons: asArray(x.reasons, `${path}.reasons`).map((r, i) => parseCalibrationReason(r, `${path}.reasons[${i}]`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
  }
}

const CAL_SOURCES_LOCAL: readonly CalibrationSnapshot['source'][] = ['cli', 'cron', 'fixture', 'replay', 'bootstrap']

export function parseCalibrationSnapshot(raw: unknown, path = 'CalibrationSnapshot'): CalibrationSnapshot {
  const x = asObject(raw, path)
  const counters = asObject(x.counters, `${path}.counters`)
  return {
    id: asCalibrationSnapshotId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    methodologyVersion: asString(x.methodologyVersion, `${path}.methodologyVersion`),
    source: asEnum(x.source, CAL_SOURCES_LOCAL, `${path}.source`),
    brokerCalibrations: asArray(x.brokerCalibrations, `${path}.brokerCalibrations`)
      .map((b, i) => parseBrokerCalibrationSummary(b, `${path}.brokerCalibrations[${i}]`)),
    alertEffectiveness: asArray(x.alertEffectiveness, `${path}.alertEffectiveness`)
      .map((a, i) => parseAlertEffectivenessSummary(a, `${path}.alertEffectiveness[${i}]`)),
    coverageByTicker: asArray(x.coverageByTicker, `${path}.coverageByTicker`)
      .map((c, i) => parseCoverageSignalResult(c, `${path}.coverageByTicker[${i}]`)),
    counters: {
      events: asInt(counters.events, `${path}.counters.events`),
      outcomes: asInt(counters.outcomes, `${path}.counters.outcomes`),
      directionalEvents: asInt(counters.directionalEvents, `${path}.counters.directionalEvents`),
      priceCoveredTickers: asInt(counters.priceCoveredTickers, `${path}.counters.priceCoveredTickers`),
      benchmarkCoveredTickers: asInt(counters.benchmarkCoveredTickers, `${path}.counters.benchmarkCoveredTickers`),
      skippedNoPrice: asInt(counters.skippedNoPrice, `${path}.counters.skippedNoPrice`),
    },
  }
}

// ─── Catalysts (Module 21) ────────────────────────────────────────────

const CATALYST_TYPES_LOCAL: readonly CatalystType[] = [
  'earnings', 'guidance_update', 'investor_day', 'capital_markets_day',
  'product_launch', 'agm', 'regulatory_decision', 'mna', 'other',
]
const CATALYST_STATUSES_LOCAL: readonly CatalystStatus[] = ['scheduled', 'estimated', 'overdue', 'completed', 'cancelled']
const CATALYST_IMPORTANCES_LOCAL: readonly CatalystImportance[] = ['critical', 'high', 'medium', 'low']
const RISK_FLAGS_LOCAL: readonly EventRiskFlag[] = [
  'thin_coverage', 'widening_divergence', 'against_position_pressure',
  'stale_coverage', 'high_calibration_brokers_silent', 'outlier_active',
]
const EVENT_WINDOWS_LOCAL: readonly EventMonitoringWindow[] = ['24h', '3d', '7d', '14d', '30d']
const DELTA_SIGNS_LOCAL: readonly ExpectationDeltaSign[] = ['more_bullish', 'more_cautious', 'flat', 'mixed']
const PE_SECTION_KEYS: readonly PreEventBriefSection['key'][] = [
  'event_summary', 'why_it_matters', 'expectation_snapshot', 'recent_changes',
  'unresolved_questions', 'top_reads', 'calibration_context', 'risk_flags',
]

function parseCatalystSource(raw: unknown, path: string): CatalystSource {
  const x = asObject(raw, path)
  return {
    id: asString(x.id, `${path}.id`),
    label: asString(x.label, `${path}.label`),
    confidence: asNumber(x.confidence, `${path}.confidence`),
  }
}

export function parseCatalystEvent(raw: unknown, path = 'CatalystEvent'): CatalystEvent {
  const x = asObject(raw, path)
  return {
    id: asCatalystId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    type: asEnum<CatalystType>(x.type, CATALYST_TYPES_LOCAL, `${path}.type`),
    status: asEnum<CatalystStatus>(x.status, CATALYST_STATUSES_LOCAL, `${path}.status`),
    importance: asEnum<CatalystImportance>(x.importance, CATALYST_IMPORTANCES_LOCAL, `${path}.importance`),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    stockName: asStringOrNull(x.stockName, `${path}.stockName`),
    sectorId: x.sectorId === null ? null : asSectorId(asString(x.sectorId, `${path}.sectorId`)),
    headline: asString(x.headline, `${path}.headline`),
    description: asString(x.description, `${path}.description`),
    expectedAt: asString(x.expectedAt, `${path}.expectedAt`),
    expectedDate: asString(x.expectedDate, `${path}.expectedDate`),
    hasIntradayTime: asBoolean(x.hasIntradayTime, `${path}.hasIntradayTime`),
    source: parseCatalystSource(x.source, `${path}.source`),
    updatedAt: asString(x.updatedAt, `${path}.updatedAt`),
    tags: asStringArray(x.tags, `${path}.tags`),
  }
}

function parseExpectationStanceMix(raw: unknown, path: string): ExpectationStanceMix {
  const x = asObject(raw, path)
  return {
    bullish: asInt(x.bullish, `${path}.bullish`),
    neutral: asInt(x.neutral, `${path}.neutral`),
    bearish: asInt(x.bearish, `${path}.bearish`),
  }
}

const CONFIDENCE_BANDS_FOR_OPINION: readonly ConfidenceBand[] = ['very_low', 'low', 'medium', 'high']

function parseExpectationOpinion(raw: unknown, path: string): ExpectationBrokerOpinion {
  const x = asObject(raw, path)
  return {
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    brokerShortName: asString(x.brokerShortName, `${path}.brokerShortName`),
    rating: asStringOrNull(x.rating, `${path}.rating`),
    stance: asEnum<'bullish' | 'neutral' | 'bearish'>(x.stance, ['bullish', 'neutral', 'bearish'], `${path}.stance`),
    targetPrice: x.targetPrice === null ? null : asNumber(x.targetPrice, `${path}.targetPrice`),
    priorTargetPrice: x.priorTargetPrice === null ? null : asNumber(x.priorTargetPrice, `${path}.priorTargetPrice`),
    targetCurrency: asStringOrNull(x.targetCurrency, `${path}.targetCurrency`),
    impliedUpsidePct: x.impliedUpsidePct === null ? null : asNumber(x.impliedUpsidePct, `${path}.impliedUpsidePct`),
    lastReportId: asReportId(asString(x.lastReportId, `${path}.lastReportId`)),
    lastUpdatedAt: asString(x.lastUpdatedAt, `${path}.lastUpdatedAt`),
    calibrationScore: x.calibrationScore === null ? null : asNumber(x.calibrationScore, `${path}.calibrationScore`),
    calibrationConfidence: x.calibrationConfidence === null ? null
      : asEnum<ConfidenceBand>(x.calibrationConfidence, CONFIDENCE_BANDS_FOR_OPINION, `${path}.calibrationConfidence`),
  }
}

export function parseExpectationSnapshot(raw: unknown, path = 'ExpectationSnapshot'): ExpectationSnapshot {
  const x = asObject(raw, path)
  return {
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    catalystId: asCatalystId(asString(x.catalystId, `${path}.catalystId`)),
    asOf: asString(x.asOf, `${path}.asOf`),
    distinctBrokers: asInt(x.distinctBrokers, `${path}.distinctBrokers`),
    stanceMix: parseExpectationStanceMix(x.stanceMix, `${path}.stanceMix`),
    avgTargetPrice: x.avgTargetPrice === null ? null : asNumber(x.avgTargetPrice, `${path}.avgTargetPrice`),
    medianTargetPrice: x.medianTargetPrice === null ? null : asNumber(x.medianTargetPrice, `${path}.medianTargetPrice`),
    targetSpreadPct: x.targetSpreadPct === null ? null : asNumber(x.targetSpreadPct, `${path}.targetSpreadPct`),
    avgImpliedUpsidePct: x.avgImpliedUpsidePct === null ? null : asNumber(x.avgImpliedUpsidePct, `${path}.avgImpliedUpsidePct`),
    hasDivergence: asBoolean(x.hasDivergence, `${path}.hasDivergence`),
    opinions: asArray(x.opinions, `${path}.opinions`).map((o, i) => parseExpectationOpinion(o, `${path}.opinions[${i}]`)),
    tiltSummary: asString(x.tiltSummary, `${path}.tiltSummary`),
  }
}

export function parseExpectationDelta(raw: unknown, path = 'EventExpectationDelta'): EventExpectationDelta {
  const x = asObject(raw, path)
  return {
    catalystId: asCatalystId(asString(x.catalystId, `${path}.catalystId`)),
    window: asEnum<EventMonitoringWindow>(x.window, EVENT_WINDOWS_LOCAL, `${path}.window`),
    priorAsOf: asString(x.priorAsOf, `${path}.priorAsOf`),
    currentAsOf: asString(x.currentAsOf, `${path}.currentAsOf`),
    stanceShift: asEnum<ExpectationDeltaSign>(x.stanceShift, DELTA_SIGNS_LOCAL, `${path}.stanceShift`),
    meanTargetChangePct: x.meanTargetChangePct === null ? null : asNumber(x.meanTargetChangePct, `${path}.meanTargetChangePct`),
    opinionUpdates: asInt(x.opinionUpdates, `${path}.opinionUpdates`),
    ratingDowngrades: asInt(x.ratingDowngrades, `${path}.ratingDowngrades`),
    ratingUpgrades: asInt(x.ratingUpgrades, `${path}.ratingUpgrades`),
    divergenceShift: asEnum<'widened' | 'narrowed' | 'unchanged'>(x.divergenceShift, ['widened', 'narrowed', 'unchanged'], `${path}.divergenceShift`),
    againstPositionAlerts: asInt(x.againstPositionAlerts, `${path}.againstPositionAlerts`),
    outlierEmergence: asInt(x.outlierEmergence, `${path}.outlierEmergence`),
    coverageIntensityDelta: asInt(x.coverageIntensityDelta, `${path}.coverageIntensityDelta`),
    reasons: asArray(x.reasons, `${path}.reasons`).map((r, i) => {
      const o = asObject(r, `${path}.reasons[${i}]`)
      return { code: asString(o.code, `${path}.reasons[${i}].code`), text: asString(o.text, `${path}.reasons[${i}].text`) }
    }),
  }
}

function parsePreEventSection(raw: unknown, path: string): PreEventBriefSection {
  const x = asObject(raw, path)
  return {
    key: asEnum<PreEventBriefSection['key']>(x.key, PE_SECTION_KEYS, `${path}.key`),
    title: asString(x.title, `${path}.title`),
    subtitle: asString(x.subtitle, `${path}.subtitle`),
    prose: asStringOrNull(x.prose, `${path}.prose`),
    proseFromLlm: asBoolean(x.proseFromLlm, `${path}.proseFromLlm`),
    reportIds: asArray(x.reportIds, `${path}.reportIds`).map((r, i) => asReportId(asString(r, `${path}.reportIds[${i}]`))),
    alertIds: asArray(x.alertIds, `${path}.alertIds`).map((a, i) => asAlertId(asString(a, `${path}.alertIds[${i}]`))),
    bullets: asArray(x.bullets, `${path}.bullets`).map((b, i) => asString(b, `${path}.bullets[${i}]`)),
  }
}

export function parsePreEventBrief(raw: unknown, path = 'PreEventBrief'): PreEventBrief {
  const x = asObject(raw, path)
  return {
    id: asPreEventBriefId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    catalystId: asCatalystId(asString(x.catalystId, `${path}.catalystId`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    daysUntilEvent: asInt(x.daysUntilEvent, `${path}.daysUntilEvent`),
    snapshot: parseExpectationSnapshot(x.snapshot, `${path}.snapshot`),
    delta7d: x.delta7d === null ? null : parseExpectationDelta(x.delta7d, `${path}.delta7d`),
    delta30d: x.delta30d === null ? null : parseExpectationDelta(x.delta30d, `${path}.delta30d`),
    sections: asArray(x.sections, `${path}.sections`).map((s, i) => parsePreEventSection(s, `${path}.sections[${i}]`)),
    riskFlags: asArray(x.riskFlags, `${path}.riskFlags`)
      .map((f, i) => asEnum<EventRiskFlag>(f, RISK_FLAGS_LOCAL, `${path}.riskFlags[${i}]`)),
    executiveSummary: asStringOrNull(x.executiveSummary, `${path}.executiveSummary`),
    executiveSummaryFromLlm: asBoolean(x.executiveSummaryFromLlm, `${path}.executiveSummaryFromLlm`),
  }
}

// ── Module 22 helpers ──────────────────────────────────────────────────

const REALIZED_DIRECTIONS: readonly RealizedOutcomeWindow['direction'][] = ['up', 'down', 'flat', 'unknown']
const REALIZED_HEADLINE_DIRECTIONS: readonly RealizedOutcome['headlineDirection'][] = ['up', 'down', 'flat', 'mixed', 'unknown']
const REALIZED_WINDOWS: readonly RealizedOutcomeWindow['window'][] = ['1d', '3d', '5d', '10d']
const VERDICT_KINDS: readonly BrokerVerdictKind[] = ['right', 'wrong', 'inconclusive', 'no_view']
const DIV_RES_KINDS: readonly DivergenceResolutionKind[] = ['resolved', 'persisted', 'widened', 'outlier_vindicated', 'outlier_invalidated', 'no_divergence_pre']
const EXP_ERROR_KINDS: readonly ExpectationErrorKind[] = [
  'overly_bullish', 'overly_cautious', 'target_dispersion_too_wide',
  'target_dispersion_too_narrow', 'high_calibration_brokers_wrong',
  'outlier_was_right', 'thin_coverage_pre_event',
  'against_position_useful', 'against_position_not_useful',
  'no_significant_error',
]
const POST_REVIEW_BANDS: readonly PostEventReviewConfidenceBand[] = ['very_low', 'low', 'medium', 'high']
const STANCES_LOCAL_PE: readonly ('bullish' | 'neutral' | 'bearish')[] = ['bullish', 'neutral', 'bearish']

function parseRealizedOutcomeWindow(raw: unknown, path: string): RealizedOutcomeWindow {
  const x = asObject(raw, path)
  return {
    window: asEnum<RealizedOutcomeWindow['window']>(x.window, REALIZED_WINDOWS, `${path}.window`),
    rawReturnPct: x.rawReturnPct === null ? null : asNumber(x.rawReturnPct, `${path}.rawReturnPct`),
    benchmarkRelReturnPct: x.benchmarkRelReturnPct === null ? null : asNumber(x.benchmarkRelReturnPct, `${path}.benchmarkRelReturnPct`),
    direction: asEnum<RealizedOutcomeWindow['direction']>(x.direction, REALIZED_DIRECTIONS, `${path}.direction`),
  }
}

function parseRealizedOutcome(raw: unknown, path: string): RealizedOutcome {
  const x = asObject(raw, path)
  return {
    ticker: asTicker(asString(x.ticker, `${path}.ticker`)),
    anchorDate: asString(x.anchorDate, `${path}.anchorDate`),
    anchorPrice: x.anchorPrice === null ? null : asNumber(x.anchorPrice, `${path}.anchorPrice`),
    anchorCurrency: asStringOrNull(x.anchorCurrency, `${path}.anchorCurrency`),
    windows: asArray(x.windows, `${path}.windows`).map((w, i) => parseRealizedOutcomeWindow(w, `${path}.windows[${i}]`)),
    headlineDirection: asEnum<RealizedOutcome['headlineDirection']>(x.headlineDirection, REALIZED_HEADLINE_DIRECTIONS, `${path}.headlineDirection`),
    hasCoverage: asBoolean(x.hasCoverage, `${path}.hasCoverage`),
    coverageNote: asStringOrNull(x.coverageNote, `${path}.coverageNote`),
  }
}

function parseBrokerVerdict(raw: unknown, path: string): BrokerVerdict {
  const x = asObject(raw, path)
  return {
    brokerId: asBrokerId(asString(x.brokerId, `${path}.brokerId`)),
    brokerShortName: asString(x.brokerShortName, `${path}.brokerShortName`),
    preStance: asEnum<'bullish' | 'neutral' | 'bearish'>(x.preStance, STANCES_LOCAL_PE, `${path}.preStance`),
    preRating: asStringOrNull(x.preRating, `${path}.preRating`),
    preTargetPrice: x.preTargetPrice === null ? null : asNumber(x.preTargetPrice, `${path}.preTargetPrice`),
    realizedDirection: asEnum<RealizedOutcome['headlineDirection']>(x.realizedDirection, REALIZED_HEADLINE_DIRECTIONS, `${path}.realizedDirection`),
    verdict: asEnum<BrokerVerdictKind>(x.verdict, VERDICT_KINDS, `${path}.verdict`),
    calibrationScore: x.calibrationScore === null ? null : asNumber(x.calibrationScore, `${path}.calibrationScore`),
    hadDirectionalView: asBoolean(x.hadDirectionalView, `${path}.hadDirectionalView`),
    reason: asString(x.reason, `${path}.reason`),
  }
}

function parseDivergenceResolution(raw: unknown, path: string): DivergenceResolution {
  const x = asObject(raw, path)
  return {
    kind: asEnum<DivergenceResolutionKind>(x.kind, DIV_RES_KINDS, `${path}.kind`),
    preClosureState: asStringOrNull(x.preClosureState, `${path}.preClosureState`),
    postClosureState: asStringOrNull(x.postClosureState, `${path}.postClosureState`),
    preOutlierBrokerIds: asArray(x.preOutlierBrokerIds, `${path}.preOutlierBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.preOutlierBrokerIds[${i}]`))),
    vindicatedOutlierBrokerIds: asArray(x.vindicatedOutlierBrokerIds, `${path}.vindicatedOutlierBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.vindicatedOutlierBrokerIds[${i}]`))),
    invalidatedOutlierBrokerIds: asArray(x.invalidatedOutlierBrokerIds, `${path}.invalidatedOutlierBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.invalidatedOutlierBrokerIds[${i}]`))),
    note: asString(x.note, `${path}.note`),
  }
}

function parseExpectationError(raw: unknown, path: string): ExpectationError {
  const x = asObject(raw, path)
  return {
    kind: asEnum<ExpectationErrorKind>(x.kind, EXP_ERROR_KINDS, `${path}.kind`),
    text: asString(x.text, `${path}.text`),
    magnitude: asNumber(x.magnitude, `${path}.magnitude`),
  }
}

function parseCalibrationFeedback(raw: unknown, path: string): CalibrationFeedback {
  const x = asObject(raw, path)
  const ctype = asObject(x.catalystTypePerformance, `${path}.catalystTypePerformance`)
  return {
    brokerCorrectness: asArray(x.brokerCorrectness, `${path}.brokerCorrectness`).map((b, i) => {
      const o = asObject(b, `${path}.brokerCorrectness[${i}]`)
      return {
        brokerId: asBrokerId(asString(o.brokerId, `${path}.brokerCorrectness[${i}].brokerId`)),
        correct: asInt(o.correct, `${path}.brokerCorrectness[${i}].correct`),
        wrong: asInt(o.wrong, `${path}.brokerCorrectness[${i}].wrong`),
        inconclusive: asInt(o.inconclusive, `${path}.brokerCorrectness[${i}].inconclusive`),
      }
    }),
    catalystTypePerformance: {
      type: asEnum<CatalystType>(ctype.type, CATALYST_TYPES_LOCAL, `${path}.catalystTypePerformance.type`),
      directionallyRight: asInt(ctype.directionallyRight, `${path}.catalystTypePerformance.directionallyRight`),
      directionallyWrong: asInt(ctype.directionallyWrong, `${path}.catalystTypePerformance.directionallyWrong`),
      inconclusive: asInt(ctype.inconclusive, `${path}.catalystTypePerformance.inconclusive`),
    },
    preEventAlertUsefulness: asArray(x.preEventAlertUsefulness, `${path}.preEventAlertUsefulness`).map((a, i) => {
      const o = asObject(a, `${path}.preEventAlertUsefulness[${i}]`)
      return {
        alertId: asAlertId(asString(o.alertId, `${path}.preEventAlertUsefulness[${i}].alertId`)),
        useful: asBoolean(o.useful, `${path}.preEventAlertUsefulness[${i}].useful`),
        note: asString(o.note, `${path}.preEventAlertUsefulness[${i}].note`),
      }
    }),
    eventDriven: asBoolean(x.eventDriven, `${path}.eventDriven`),
    methodologyVersion: asString(x.methodologyVersion, `${path}.methodologyVersion`),
  }
}

export function parsePostEventReview(raw: unknown, path = 'PostEventReview'): PostEventReview {
  const x = asObject(raw, path)
  return {
    id: asPostEventReviewId(asString(x.id, `${path}.id`)),
    orgId: asOrgId(asString(x.orgId, `${path}.orgId`)),
    catalystId: asCatalystId(asString(x.catalystId, `${path}.catalystId`)),
    generatedAt: asString(x.generatedAt, `${path}.generatedAt`),
    reviewedAt: asString(x.reviewedAt, `${path}.reviewedAt`),
    preEventSnapshot: parseExpectationSnapshot(x.preEventSnapshot, `${path}.preEventSnapshot`),
    postEventSnapshot: x.postEventSnapshot === null ? null : parseExpectationSnapshot(x.postEventSnapshot, `${path}.postEventSnapshot`),
    realizedOutcome: parseRealizedOutcome(x.realizedOutcome, `${path}.realizedOutcome`),
    brokerVerdicts: asArray(x.brokerVerdicts, `${path}.brokerVerdicts`).map((v, i) => parseBrokerVerdict(v, `${path}.brokerVerdicts[${i}]`)),
    directionallyRightBrokerIds: asArray(x.directionallyRightBrokerIds, `${path}.directionallyRightBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.directionallyRightBrokerIds[${i}]`))),
    directionallyWrongBrokerIds: asArray(x.directionallyWrongBrokerIds, `${path}.directionallyWrongBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.directionallyWrongBrokerIds[${i}]`))),
    inconclusiveBrokerIds: asArray(x.inconclusiveBrokerIds, `${path}.inconclusiveBrokerIds`)
      .map((b, i) => asBrokerId(asString(b, `${path}.inconclusiveBrokerIds[${i}]`))),
    divergenceResolution: parseDivergenceResolution(x.divergenceResolution, `${path}.divergenceResolution`),
    expectationErrors: asArray(x.expectationErrors, `${path}.expectationErrors`).map((e, i) => parseExpectationError(e, `${path}.expectationErrors[${i}]`)),
    topPostEventReportIds: asArray(x.topPostEventReportIds, `${path}.topPostEventReportIds`)
      .map((r, i) => asReportId(asString(r, `${path}.topPostEventReportIds[${i}]`))),
    calibrationFeedback: parseCalibrationFeedback(x.calibrationFeedback, `${path}.calibrationFeedback`),
    outcomeSummary: asString(x.outcomeSummary, `${path}.outcomeSummary`),
    confidence: asEnum<PostEventReviewConfidenceBand>(x.confidence, POST_REVIEW_BANDS, `${path}.confidence`),
    notes: asArray(x.notes, `${path}.notes`).map((n, i) => asString(n, `${path}.notes[${i}]`)),
    executiveSummary: asStringOrNull(x.executiveSummary, `${path}.executiveSummary`),
    executiveSummaryFromLlm: asBoolean(x.executiveSummaryFromLlm, `${path}.executiveSummaryFromLlm`),
  }
}

// Touch types we don't currently use as values — keeps imports stable.
void ([] as readonly CatalystCalendarEntry[])

// Silence "declared but not used" for unused asBoolean helper in the build.
// It's kept exported because future body-bearing endpoints may need it.
export { asBoolean }
