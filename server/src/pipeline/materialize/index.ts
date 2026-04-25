// Materialize layer — turns an enriched candidate into the canonical
// `/v1` entities the dashboard already consumes.
//
// The frontend never sees ParsedReportCandidate / LlmEnrichment / any
// pipeline-internal type. It sees `BrokerEmail`, `Attachment`,
// `ResearchReport`, `ReportSummary`, `EvidenceSnippet`,
// `BrokerStockOpinion` — all defined in `src/domain/`.

import { createHash } from 'node:crypto'
import type {
  Attachment, BrokerEmail, BrokerStockOpinion, EvidenceSnippet,
  ResearchReport, ReportSummary, OrgId, ReportId, SummaryId,
  AttachmentId, EvidenceId, SectorId, EmailProcessingStatus,
} from '../../../../src/domain'
import {
  asAttachmentId, asEmailId, asEvidenceId, asReportId, asSummaryId,
} from '../../../../src/lib/ids'
import { stocks as stockCatalog } from '../../config/organizations'
import type {
  EnrichedReportCandidate, EvidenceSpan, ParsedEmailArtifact,
  RawAttachmentRef,
} from '../models'
import { scoreMaterializationQuality, type MaterializationQuality } from '../quality'

const GENERATOR_VERSION = 'pipeline@2026.04.13'

/**
 * Idempotent materialization. Calling this twice with the same input
 * produces byte-identical IDs so re-running the pipeline doesn't
 * duplicate records in the store.
 */
export interface MaterializeInput {
  readonly orgId: OrgId
  readonly parsedEmail: ParsedEmailArtifact
  readonly attachmentRefs: readonly RawAttachmentRef[]
  readonly enriched: readonly EnrichedReportCandidate[]
  readonly receivedAt: string
}

export interface MaterializeResult {
  readonly email: BrokerEmail
  readonly attachments: readonly Attachment[]
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly quality: readonly MaterializationQuality[]
}

export function materialize(input: MaterializeInput): MaterializeResult {
  const emailId = asEmailId(deterministicId('eml', input.parsedEmail.messageId))

  // ── BrokerEmail + Attachments ───────────────────────────────────────
  const attachments: Attachment[] = input.attachmentRefs.map((a, idx) => {
    const attId = asAttachmentId(deterministicId('att', `${input.parsedEmail.messageId}:${a.filename}:${idx}`))
    return {
      id: attId,
      orgId: input.orgId,
      emailId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      checksumSha256: a.checksumSha256 ?? sha256(a.text ?? a.filename),
      storageRef: a.storageRef,
      pageCount: a.pageCount ?? null,
      language: a.language ?? null,
      parseStatus: 'ready',
      parseErrorMessage: null,
    }
  })

  const reports: ResearchReport[] = []
  const summaries: ReportSummary[] = []
  const evidence: EvidenceSnippet[] = []
  const opinions: BrokerStockOpinion[] = []
  const quality: MaterializationQuality[] = []

  for (let i = 0; i < input.enriched.length; i++) {
    const ec = input.enriched[i]!
    const reportId = asReportId(deterministicId('rpt', `${input.parsedEmail.messageId}:${i}:${ec.candidate.ticker ?? '_'}`))
    const summaryId = asSummaryId(deterministicId('sum', `${input.parsedEmail.messageId}:${i}:${ec.candidate.ticker ?? '_'}`))
    const sectorIds: readonly SectorId[] = ec.candidate.sectorId ? [ec.candidate.sectorId] : []

    // ── ResearchReport ───────────────────────────────────────────────
    const report: ResearchReport = {
      id: reportId,
      orgId: input.orgId,
      brokerId: ec.candidate.brokerId,
      sourceEmailId: emailId,
      sourceAttachmentId: attachments[0]?.id ?? null,
      title: ec.candidate.title || input.parsedEmail.subject,
      publishedAt: ec.candidate.publishedAt,
      receivedAt: ec.candidate.receivedAt,
      reportType: ec.candidate.reportType,
      tickers: ec.candidate.ticker ? [ec.candidate.ticker] : [],
      sectorIds,
      pageCount: input.attachmentRefs[0]?.pageCount ?? null,
      language: input.attachmentRefs[0]?.language ?? 'en',
      status: 'ready' as EmailProcessingStatus,
      summaryId,
    }
    reports.push(report)

    // ── ReportSummary ────────────────────────────────────────────────
    const enrich = ec.enrichment
    const stock = ec.candidate.ticker
      ? stockCatalog.find((s) => s.ticker === ec.candidate.ticker) ?? null
      : null

    const evidenceIds: EvidenceId[] = []
    const allEvidenceSpans: EvidenceSpan[] = [
      ...ec.candidate.deterministicEvidence,
      ...(enrich?.evidence ?? []),
    ]
    for (let e = 0; e < allEvidenceSpans.length; e++) {
      const span = allEvidenceSpans[e]!
      const evId = asEvidenceId(deterministicId('ev', `${reportId}:${span.supportingField}:${e}`))
      evidence.push(spanToSnippet(evId, input.orgId, reportId, summaryId, attachments[0]?.id ?? null, span))
      evidenceIds.push(evId)
    }

    const summary: ReportSummary = {
      id: summaryId,
      orgId: input.orgId,
      reportId,
      stance: ec.candidate.stance,
      rating: ec.candidate.rating,
      targetPrice: ec.candidate.targetPrice,
      priorTargetPrice: ec.candidate.priorTargetPrice,
      targetCurrency: stock?.currency ?? null,
      thesis: enrich?.thesis ?? ec.candidate.summaryOneLine,
      keyPoints: enrich?.keyPoints ?? [],
      themes: enrich?.themes ?? [],
      risks: enrich?.risks ?? [],
      catalysts: (enrich?.catalysts ?? []).map((c) => ({
        label: c.label, expectedOn: c.expectedOn,
      })),
      confidence: scoreConfidence(ec),
      generatedAt: ec.candidate.publishedAt,
      generatorVersion: enrich ? `${GENERATOR_VERSION}+${enrich.providerId}` : GENERATOR_VERSION,
      evidenceIds,
    }
    summaries.push(summary)

    // ── BrokerStockOpinion ──────────────────────────────────────────
    if (ec.candidate.ticker && ec.candidate.rating !== null && ec.candidate.targetPrice !== null) {
      opinions.push({
        orgId: input.orgId,
        brokerId: ec.candidate.brokerId,
        ticker: ec.candidate.ticker,
        rating: ec.candidate.rating,
        stance: ec.candidate.stance,
        targetPrice: ec.candidate.targetPrice,
        priorTargetPrice: ec.candidate.priorTargetPrice,
        targetCurrency: stock?.currency ?? null,
        lastReportId: reportId,
        lastUpdatedAt: ec.candidate.publishedAt,
        impliedUpsidePct: stock?.lastPrice
          ? ((ec.candidate.targetPrice / stock.lastPrice) - 1) * 100
          : null,
      })
    }

    // ── MaterializationQuality (Module 15) ──────────────────────────
    quality.push(scoreMaterializationQuality({
      orgId: input.orgId,
      enriched: ec,
      reportId,
      evidenceSpans: allEvidenceSpans,
      thesis: summary.thesis,
    }))
  }

  // ── BrokerEmail (after we know the report ids) ─────────────────────
  const email: BrokerEmail = {
    id: emailId,
    orgId: input.orgId,
    brokerId: input.enriched[0]?.candidate.brokerId ?? throwHere('brokerId'),
    senderAddress: input.parsedEmail.senderAddress,
    senderName: input.parsedEmail.senderName,
    recipientAddress: input.parsedEmail.recipientAddress,
    subject: input.parsedEmail.subject,
    bodyPreview: input.parsedEmail.bodyText.slice(0, 280),
    receivedAt: input.parsedEmail.receivedAt,
    forwardedFrom: input.parsedEmail.forwardedBy,
    attachmentIds: attachments.map((a) => a.id),
    reportIds: reports.map((r) => r.id),
    status: reports.length > 0 ? 'ready' : 'skipped',
    statusMessage: reports.length > 0 ? null : 'No tickers resolved; no report materialized.',
    sourceMessageId: input.parsedEmail.messageId,
  }

  return { email, attachments, reports, summaries, evidence, opinions, quality }
}

// ── Helpers ──────────────────────────────────────────────────────────

function spanToSnippet(
  id: EvidenceId,
  orgId: OrgId,
  reportId: ReportId,
  summaryId: SummaryId,
  attachmentId: AttachmentId | null,
  span: EvidenceSpan,
): EvidenceSnippet {
  return {
    id,
    orgId,
    reportId,
    summaryId,
    attachmentId: attachmentId ?? asAttachmentId('att_none'),
    pageNumber: span.provenance.page ?? 1,
    textSnippet: span.text,
    charOffsetStart: span.provenance.charStart ?? null,
    charOffsetEnd: span.provenance.charEnd ?? null,
    boundingBox: null,
    supportingField: span.supportingField,
    fieldRef: span.fieldRef,
  }
}

function scoreConfidence(ec: EnrichedReportCandidate): number {
  let score = 0.4
  if (ec.candidate.rating !== null) score += 0.2
  if (ec.candidate.targetPrice !== null) score += 0.2
  if (ec.enrichment) score += 0.1
  if (ec.candidate.deterministicEvidence.length > 0) score += 0.1
  return Math.min(1, score)
}

export function deterministicId(prefix: string, input: string): string {
  return `${prefix}_${sha256(input).slice(0, 12)}`
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function throwHere(field: string): never {
  throw new Error(`materialize(): missing required field ${field}`)
}
