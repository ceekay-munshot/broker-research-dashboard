// ─────────────────────────────────────────────────────────────────────────
// Internal pipeline models — durable, server-side artifact types.
//
// These are the *internal* records the pipeline carries between stages.
// They are *not* what the frontend consumes — that is the canonical
// `/v1` domain in `src/domain/`. The materializer (`./materialize/`)
// converts these into canonical entities at the very end.
//
// Every record here is plain data; no methods, no behavior. The
// orchestrator in `./pipeline.ts` mutates the artifact's `state` and
// attaches outputs as it advances.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId, BrokerId, ReportType, Rating, Stance, Iso8601, StockTicker, SectorId } from '../../../src/domain'
import type { ProcessingState } from './states'
import type { ProvenanceRef } from './provenance'
import type { PipelineErrorCategory } from './errors'

// ── Raw artifact types ──────────────────────────────────────────────────

/** A raw email envelope as it lands from the upstream MTA / forwarder. */
export interface RawEmailArtifact {
  readonly id: string                  // pipeline-internal id (sha of messageId)
  readonly receivedAt: Iso8601
  readonly orgId: OrgId
  /** RFC-5322 envelope: messageId, from, to, subject, body. */
  readonly envelope: {
    readonly messageId: string
    readonly from: string
    readonly to: string
    readonly subject: string
    readonly receivedAt: Iso8601
    readonly bodyText: string
    readonly bodyHtml: string | null
    readonly forwardedBy: readonly string[]
  }
  readonly attachmentRefs: readonly RawAttachmentRef[]
  readonly linkedRefs: readonly RawLinkedRef[]
}

/** Reference to an attachment payload — bytes loaded lazily by the
 *  AttachmentTextExtractor boundary. The `text` field is optional and
 *  pre-extracted by tests / fixtures; production wires a real PDF
 *  extractor. */
export interface RawAttachmentRef {
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly checksumSha256?: string
  readonly storageRef: string
  readonly pageCount?: number | null
  readonly language?: string | null
  /** Pre-extracted text — for fixtures + integration tests. */
  readonly text?: string
}

/** Reference to a URL the email body links to (broker site, PDF host, etc.). */
export interface RawLinkedRef {
  readonly url: string
  /** Hint: 'webpage' | 'pdf' — caller's best guess; may be revised after fetch. */
  readonly hint: 'webpage' | 'pdf' | 'unknown'
  /** Pre-fetched content for tests. Production wires a fetch boundary. */
  readonly cachedText?: string
  readonly cachedContentType?: string
}

/** Lifecycle wrapper around a single email + its attachments + linked
 *  artifacts. The orchestrator threads `state` forward through this. */
export interface RawEmailArtifactJob {
  artifact: RawEmailArtifact
  state: ProcessingState
  history: ProcessingHistoryEntry[]
  parsedEmail?: ParsedEmailArtifact
  attachmentTexts?: ReadonlyMap<string, ExtractedTextArtifact>
  linkedTexts?: ReadonlyMap<string, ExtractedTextArtifact>
  candidates?: readonly ParsedReportCandidate[]
  enriched?: readonly EnrichedReportCandidate[]
  materialized?: MaterializedOutputs
  error?: { readonly category: PipelineErrorCategory; readonly detail: string }
}

export interface ProcessingHistoryEntry {
  readonly at: Iso8601
  readonly state: ProcessingState
  readonly note?: string
}

// ── Intermediate artifact types ─────────────────────────────────────────

/** The output of `extract/email.ts` — the email envelope reified into
 *  text and an attachment-name list. */
export interface ParsedEmailArtifact {
  readonly orgId: OrgId
  readonly messageId: string
  readonly subject: string
  readonly bodyText: string
  readonly bodyHtml: string | null
  readonly senderAddress: string
  readonly senderName: string
  readonly recipientAddress: string
  readonly forwardedBy: readonly string[]
  readonly receivedAt: Iso8601
  readonly attachmentNames: readonly string[]
  readonly linkedUrls: readonly string[]
}

/** Output of any text extractor (attachment, linked artifact, or body
 *  itself). The text is whatever the extractor surfaced; provenance
 *  carries where it came from. */
export interface ExtractedTextArtifact {
  readonly text: string
  readonly provenance: ProvenanceRef
  readonly contentType: string
  readonly tokenCountEstimate?: number
}

/** Deterministic-only candidate. The LLM enrichment step optionally
 *  augments this; the materializer always falls back to these
 *  deterministic fields when no LLM enrichment is available. */
export interface ParsedReportCandidate {
  readonly ticker: StockTicker | null
  readonly sectorId: SectorId | null
  readonly brokerId: BrokerId
  readonly orgId: OrgId
  readonly reportType: ReportType
  readonly rating: Rating | null
  readonly stance: Stance
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly publishedAt: Iso8601
  readonly receivedAt: Iso8601
  readonly title: string
  /** A short, deterministic single-line "why it matters". */
  readonly summaryOneLine: string
  /** Provenance-tagged evidence snippets (deterministic, mechanically pulled). */
  readonly deterministicEvidence: readonly EvidenceSpan[]
  /** Where the candidate came from in the parent email. */
  readonly origin: ParsedReportOrigin
  /** When the upstream is a digest, this carries the section that
   *  produced this candidate — useful for source precedence rules. */
  readonly digestSection?: string
}

export type ParsedReportOrigin =
  | 'direct_attachment'
  | 'direct_body'
  | 'digest_split'

export interface EvidenceSpan {
  readonly text: string
  readonly provenance: ProvenanceRef
  readonly supportingField: 'thesis' | 'rating' | 'targetPrice' | 'keyPoint' | 'risk' | 'catalyst' | 'theme'
  readonly fieldRef: string
}

/** LLM enrichment output. Every field here is *optional* — the
 *  materializer fills missing ones from the deterministic candidate. */
export interface LlmEnrichment {
  readonly thesis?: string
  readonly keyPoints?: readonly string[]
  readonly themes?: readonly string[]
  readonly risks?: readonly string[]
  readonly catalysts?: readonly { readonly label: string; readonly expectedOn: string | null }[]
  readonly evidence?: readonly EvidenceSpan[]
  /** Free-form provider id for telemetry / provenance. */
  readonly providerId: string
}

/** A parsed candidate plus its (optional) enrichment. */
export interface EnrichedReportCandidate {
  readonly candidate: ParsedReportCandidate
  readonly enrichment: LlmEnrichment | null
}

// ── Final-stage outputs ─────────────────────────────────────────────────

/** What the materializer produces. The shape mirrors what the canonical
 *  store accepts via its upsert* methods. The `quality` field is an
 *  internal operator surface (Module 15); the `/v1` API never exposes it. */
export interface MaterializedOutputs {
  readonly email: import('../../../src/domain').BrokerEmail
  readonly attachments: readonly import('../../../src/domain').Attachment[]
  readonly reports: readonly import('../../../src/domain').ResearchReport[]
  readonly summaries: readonly import('../../../src/domain').ReportSummary[]
  readonly evidence: readonly import('../../../src/domain').EvidenceSnippet[]
  readonly opinions: readonly import('../../../src/domain').BrokerStockOpinion[]
  readonly quality: readonly import('./quality').MaterializationQuality[]
}

/** A pipeline run over a batch of jobs. Returned by `runner.runJobs()`. */
export interface MaterializationJob {
  readonly startedAt: Iso8601
  readonly completedAt: Iso8601
  readonly orgId: OrgId
  readonly jobs: readonly RawEmailArtifactJob[]
  readonly counts: {
    readonly total: number
    readonly materialized: number
    readonly failed: number
    readonly reviewNeeded: number
  }
}

// ── Review queue ────────────────────────────────────────────────────────

export interface ReviewQueueItem {
  readonly id: string
  readonly orgId: OrgId
  readonly artifactId: string                  // RawEmailArtifact.id
  readonly reasonCategory: PipelineErrorCategory
  readonly detail: string
  readonly enqueuedAt: Iso8601
  readonly snapshot: {
    readonly subject: string
    readonly senderAddress: string
    readonly attachmentNames: readonly string[]
    readonly linkedUrls: readonly string[]
  }
}
