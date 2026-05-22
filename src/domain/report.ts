import type {
  OrgId, BrokerId, EmailId, AttachmentId,
  ReportId, SummaryId, EvidenceId, SectorId, StockTicker,
} from './ids'
import type { Iso8601, Stance, Rating, Confidence, IsoCurrency } from './common'
import type { EmailProcessingStatus } from './status'
import type { BrokerResolution } from './broker'

// Canonical taxonomy of broker research formats. Keep this explicit — the UI
// will filter/group by these categories.
export type ReportType =
  | 'initiation'
  | 'update'
  | 'flash'
  | 'earnings_preview'
  | 'earnings_review'
  | 'morning_note'
  | 'sector_note'
  | 'deep_dive'
  | 'other'

// Normalized research artifact extracted from one BrokerEmail + (optionally)
// one Attachment. In Phase 1 each email produces 0 or 1 reports; the
// one-email-many-reports case (morning notes covering multiple tickers) is
// structurally supported via the ticker[] array but not split into siblings.
export interface ResearchReport {
  readonly id: ReportId
  readonly orgId: OrgId
  readonly brokerId: BrokerId
  readonly sourceEmailId: EmailId
  readonly sourceAttachmentId: AttachmentId | null
  readonly title: string
  readonly publishedAt: Iso8601
  readonly receivedAt: Iso8601
  readonly reportType: ReportType
  readonly tickers: readonly StockTicker[]
  readonly sectorIds: readonly SectorId[]
  readonly pageCount: number | null
  readonly language: string
  readonly status: EmailProcessingStatus
  readonly summaryId: SummaryId | null
  // Note-level broker identity + provenance, recovered from the forwarded
  // email by the serverOutput broker resolver. Optional: absent on
  // HTTP / upstream / mock reports.
  readonly brokerResolution?: BrokerResolution
  // True when the resolved research house is also a covered listed company
  // in this same note — the ticker is kept, never deleted.
  readonly brokerStockConflict?: boolean
}

// The Phase-1 output: a structured synthesis of a single research report.
// Every claim can (and should) be traced back to one or more EvidenceSnippets.
export interface ReportSummary {
  readonly id: SummaryId
  readonly orgId: OrgId
  readonly reportId: ReportId
  readonly stance: Stance
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetCurrency: IsoCurrency | null
  readonly thesis: string
  readonly keyPoints: readonly string[]
  readonly themes: readonly string[]
  readonly risks: readonly string[]
  readonly catalysts: readonly ReportCatalyst[]
  readonly confidence: Confidence
  readonly generatedAt: Iso8601
  readonly generatorVersion: string
  readonly evidenceIds: readonly EvidenceId[]
  // Note-insight enrichments — frontend-derived from forwarded email text by
  // the deterministic extractor (src/adapters/serverOutput/noteInsight.ts).
  // Optional: absent on HTTP / upstream / mock summaries.
  readonly keyNumbers?: readonly ReportKeyNumber[]
  readonly watchpoints?: readonly string[]
  readonly upsidePct?: number | null
  readonly actionLabel?: string | null
}

export interface ReportCatalyst {
  readonly label: string
  readonly expectedOn: Iso8601 | null
}

/** One labelled metric lifted verbatim from broker-note prose by the
 *  deterministic note-insight extractor. Display-only — never an engine input. */
export interface ReportKeyNumber {
  readonly label: string
  readonly value: string
}

// Which structured field in a ReportSummary this snippet backs. `fieldRef` is
// an arbitrary selector into that field — typically the array index for
// `keyPoint`/`risk`/`theme`/`catalyst`, and the empty string for singletons
// like `thesis`/`rating`/`targetPrice`.
export type EvidenceSupportingField =
  | 'thesis'
  | 'rating'
  | 'targetPrice'
  | 'keyPoint'
  | 'risk'
  | 'catalyst'
  | 'theme'

// Audit-trail citation from the source PDF into the normalized summary.
// Without these the summary is un-verifiable — the product requirement that
// summaries be auditable is enforced by the UI always rendering at least one
// evidence snippet per bullet.
export interface EvidenceSnippet {
  readonly id: EvidenceId
  readonly orgId: OrgId
  readonly reportId: ReportId
  readonly summaryId: SummaryId | null
  readonly attachmentId: AttachmentId
  readonly pageNumber: number
  readonly textSnippet: string
  readonly charOffsetStart: number | null
  readonly charOffsetEnd: number | null
  // Axis-aligned rect in PDF points, [x1, y1, x2, y2]. Null when the parser
  // could not resolve bounding geometry (e.g. OCR'd text with low confidence).
  readonly boundingBox: readonly [number, number, number, number] | null
  readonly supportingField: EvidenceSupportingField
  readonly fieldRef: string
}
