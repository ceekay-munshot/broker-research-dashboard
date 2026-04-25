// ─────────────────────────────────────────────────────────────────────────
// Materialization quality metadata.
//
// One record per materialized `ResearchReport`. Persisted via the Repo
// alongside canonical entities. The `/v1` API does NOT expose these —
// they are an internal operator surface read by the CLI (eval /
// scorecard / field-stats / top-failures).
//
// All scoring is rule-based and deterministic. No ML, no LLM-based
// quality judgments.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BrokerId, OrgId, ReportId, StockTicker,
} from '../../../src/domain'
import type {
  EnrichedReportCandidate, EvidenceSpan, ParsedReportOrigin,
} from './models'

/** Top-level severity for operator triage. */
export type QualityTier = 'high' | 'medium' | 'low'

/** Which layer contributed each summary field. The materializer fills
 *  this in as it composes the output. */
export interface FieldProvenance {
  readonly thesis:    'deterministic' | 'llm' | 'absent'
  readonly keyPoints: 'deterministic' | 'llm' | 'absent'
  readonly themes:    'deterministic' | 'llm' | 'absent'
  readonly risks:     'deterministic' | 'llm' | 'absent'
  readonly catalysts: 'deterministic' | 'llm' | 'absent'
}

export interface MaterializationQuality {
  readonly orgId: OrgId
  readonly reportId: ReportId
  readonly brokerId: BrokerId
  readonly ticker: StockTicker | null
  readonly origin: ParsedReportOrigin

  /** 0..1, the high-level confidence summary. */
  readonly score: number
  readonly tier: QualityTier

  // ── Coverage breakdown ─────────────────────────────────────────────
  /** Did the deterministic layer fill the most important fields? */
  readonly deterministicFieldsCovered: {
    readonly broker: boolean
    readonly ticker: boolean
    readonly rating: boolean
    readonly targetPrice: boolean
    readonly priorTargetPrice: boolean
    readonly reportType: boolean
  }
  /** Did the LLM enrichment add anything beyond deterministic fields? */
  readonly llmContributed: boolean
  /** Per-field provenance for the summary. */
  readonly fieldProvenance: FieldProvenance

  // ── Source quality ─────────────────────────────────────────────────
  readonly sourcesUsed: {
    readonly body: boolean
    readonly attachment: boolean
    readonly linkedWebpage: boolean
    readonly linkedPdf: boolean
  }
  /** Number of evidence snippets attached to the summary. */
  readonly evidenceCount: number
  /** Lower bound on field-level evidence coverage. Computed as
   *  (# of summary fields with ≥1 evidence) / (# of summary fields populated). */
  readonly evidenceCoverage: number

  // ── Completeness flags ─────────────────────────────────────────────
  readonly flags: {
    readonly missingTargetForRatedNote: boolean
    readonly thesisShorterThan: number   // chars; 0 ⇒ no flag
    readonly noEvidenceForFields: readonly string[]
  }

  // ── Module 16: operator corrections ────────────────────────────────
  /** Field names the corrections layer overrode for this report. The
   *  `/v1` API does NOT expose this — operator-only surface. */
  readonly correctedFields: readonly string[]
}

// ── Scoring entry point ──────────────────────────────────────────────────

export interface QualityScoreInput {
  readonly orgId: OrgId
  readonly enriched: EnrichedReportCandidate
  readonly reportId: ReportId
  readonly evidenceSpans: readonly EvidenceSpan[]
  readonly thesis: string
  /** Module 16: fields the corrections layer overrode. */
  readonly correctedFields?: readonly string[]
}

export function scoreMaterializationQuality(input: QualityScoreInput): MaterializationQuality {
  const c = input.enriched.candidate
  const e = input.enriched.enrichment

  // Deterministic-field coverage.
  const det = {
    broker: true, // resolved via allowlist before we got here
    ticker: c.ticker !== null,
    rating: c.rating !== null,
    targetPrice: c.targetPrice !== null,
    priorTargetPrice: c.priorTargetPrice !== null,
    reportType: c.reportType !== 'other',
  }
  const detTrue = Object.values(det).filter(Boolean).length

  // Source coverage based on evidence provenance.
  const sourcesUsed = {
    body: input.evidenceSpans.some((s) => s.provenance.kind === 'email_body'),
    attachment: input.evidenceSpans.some((s) => s.provenance.kind === 'email_attachment'),
    linkedWebpage: input.evidenceSpans.some((s) => s.provenance.kind === 'linked_webpage'),
    linkedPdf: input.evidenceSpans.some((s) => s.provenance.kind === 'linked_pdf'),
  }

  // Field provenance — which layer filled each summary field.
  const provFor = (
    detSeed: string | readonly string[] | undefined,
    llmSeed: string | readonly string[] | undefined,
  ): 'deterministic' | 'llm' | 'absent' => {
    const detPresent = isNonEmpty(detSeed)
    const llmPresent = isNonEmpty(llmSeed)
    if (detPresent && !llmPresent) return 'deterministic'
    if (llmPresent) return 'llm'
    return 'absent'
  }
  const fieldProvenance: FieldProvenance = {
    thesis:    provFor(c.summaryOneLine, e?.thesis),
    keyPoints: provFor(undefined,        e?.keyPoints),
    themes:    provFor(undefined,        e?.themes),
    risks:     provFor(undefined,        e?.risks),
    catalysts: provFor(undefined,        e?.catalysts?.map((x) => x.label)),
  }

  // Evidence coverage — fraction of summary fields backed by ≥1 evidence span.
  const populatedFields: (keyof FieldProvenance)[] =
    (['thesis', 'keyPoints', 'themes', 'risks', 'catalysts'] as const)
      .filter((f) => fieldProvenance[f] !== 'absent')
  const fieldHasEvidence = (f: keyof FieldProvenance): boolean => {
    const m: Record<keyof FieldProvenance, EvidenceSpan['supportingField']> = {
      thesis: 'thesis', keyPoints: 'keyPoint', themes: 'theme',
      risks: 'risk', catalysts: 'catalyst',
    }
    return input.evidenceSpans.some((s) => s.supportingField === m[f])
  }
  const evidenceCovered = populatedFields.filter(fieldHasEvidence).length
  const evidenceCoverage = populatedFields.length === 0 ? 0 : evidenceCovered / populatedFields.length

  // Flags.
  const noEvidenceFor: string[] = populatedFields
    .filter((f) => !fieldHasEvidence(f))
    .map((f) => String(f))
  const flags = {
    missingTargetForRatedNote: c.rating !== null && c.rating !== 'Not Rated' && c.targetPrice === null,
    thesisShorterThan: input.thesis.length < 30 ? input.thesis.length : 0,
    noEvidenceForFields: noEvidenceFor,
  }

  // Composite score: weighted average of three signals.
  // - deterministic coverage (max 6 fields)
  // - evidence coverage (already 0..1)
  // - source diversity (max 4 sources, but typical = 1-2)
  const detComponent = detTrue / 6
  const sourceCount = Object.values(sourcesUsed).filter(Boolean).length
  const sourceComponent = Math.min(sourceCount / 2, 1)
  const score = round2(0.5 * detComponent + 0.3 * evidenceCoverage + 0.2 * sourceComponent)
  const tier: QualityTier = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low'

  return {
    orgId: input.orgId,
    reportId: input.reportId,
    brokerId: c.brokerId,
    ticker: c.ticker,
    origin: c.origin,
    score,
    tier,
    deterministicFieldsCovered: det,
    llmContributed: e !== null,
    fieldProvenance,
    sourcesUsed,
    evidenceCount: input.evidenceSpans.length,
    evidenceCoverage: round2(evidenceCoverage),
    flags,
    correctedFields: input.correctedFields ?? [],
  }
}

function isNonEmpty(v: string | readonly string[] | undefined): boolean {
  if (v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  return v.length > 0
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
