// ─────────────────────────────────────────────────────────────────────────
// Evaluation harness types.
//
// A `GoldFixture` pairs a raw upstream artifact with the canonical
// outputs we expect from a clean pipeline run. The `compareToGold`
// function (`./compare.ts`) produces a `EvalResult` per fixture, and
// `aggregateScorecards` (`./scorecard.ts`) rolls them up by broker /
// parser-profile / source-type / report-type.
//
// Everything is plain data; no React, no DB. Operators run the eval
// via `npm run ops -- eval` or `npm run test:eval`.
// ─────────────────────────────────────────────────────────────────────────

import type { Rating, ReportType, Stance, StockTicker } from '../../../src/domain'
import type { PipelineErrorCategory } from '../pipeline/errors'
import type { ParsedReportOrigin } from '../pipeline/models'
import type { RawEmailArtifact } from '../pipeline/models'

/** What we expect a pipeline run to produce for one raw artifact. */
export interface ExpectedReport {
  readonly ticker: StockTicker | string
  readonly rating?: Rating
  readonly stance?: Stance
  readonly targetPrice?: number
  readonly priorTargetPrice?: number
  readonly reportType?: ReportType
}

export interface ExpectedOutputs {
  readonly broker: string                                  // brokerId
  readonly origin?: ParsedReportOrigin                     // dominant origin
  /** Single-report shorthand. Use `perTicker` for digests. */
  readonly primary?: ExpectedReport
  /** Per-ticker outputs for digest fixtures. Keyed by ticker. */
  readonly perTicker?: Readonly<Record<string, ExpectedReport>>
  /** Lower bound on materialized reports. */
  readonly minReports?: number
  /** Lower bound on evidence snippets across all reports. */
  readonly minEvidence?: number
  /** True if a linked artifact (webpage / pdf) should contribute evidence. */
  readonly linkedArtifactsContributed?: boolean
  /** Whether materialization should succeed at all (`materialized_ready`).
   *  Defaults to true. */
  readonly expectMaterialization?: boolean
  /** Review categories we expect to see (any of these passes). */
  readonly expectReviewCategories?: readonly PipelineErrorCategory[]
}

export interface GoldFixture {
  readonly name: string
  readonly profile: string                                 // parser profile id
  readonly sourceType: 'body' | 'attachment' | 'linked_webpage' | 'linked_pdf' | 'mixed'
  readonly notes?: string
  readonly raw: RawEmailArtifact
  readonly expected: ExpectedOutputs
}

// ── Field-level outcomes ────────────────────────────────────────────────

/** Outcome per evaluated field. Matches an expectation either exactly
 *  (`match`), partially (e.g. ticker right but target off by < 10%), or
 *  not at all (`missing` / `wrong`). */
export type FieldOutcome = 'match' | 'partial' | 'missing' | 'wrong' | 'extra'

export interface FieldComparison {
  readonly field: string
  readonly outcome: FieldOutcome
  readonly expected?: unknown
  readonly actual?: unknown
  /** Which layer produced the actual value. Computed from the
   *  per-report `MaterializationQuality.fieldProvenance`. */
  readonly source?: 'deterministic' | 'llm' | 'absent'
  readonly note?: string
}

export interface EvalResult {
  readonly fixture: GoldFixture
  /** Did the pipeline outcome match `expectMaterialization`? */
  readonly outcomeOk: boolean
  /** Pipeline outcome the run actually produced. */
  readonly actualOutcome: 'materialized_ready' | 'failed' | 'review_needed'
  /** Comparisons per evaluated field. */
  readonly fields: readonly FieldComparison[]
  /** True if every required field matched at least partially. */
  readonly passed: boolean
  /** 0..1 — fraction of `match` outcomes among comparisons. */
  readonly score: number
  /** Review queue categories observed during the run. */
  readonly reviewCategories: readonly PipelineErrorCategory[]
  /** The MaterializationQuality records the run produced (one per report). */
  readonly quality: readonly import('../pipeline/quality').MaterializationQuality[]
}

// ── Scorecards ──────────────────────────────────────────────────────────

export interface ScorecardBucket {
  readonly key: string
  readonly fixtures: number
  readonly passed: number
  readonly failed: number
  readonly score: number                                   // mean of EvalResult.score
  /** Per-field success rate. */
  readonly perField: Readonly<Record<string, number>>
  /** Counters for deterministic vs LLM contribution. */
  readonly deterministicFieldsCount: number
  readonly llmFieldsCount: number
}

export interface Scorecards {
  readonly overall: ScorecardBucket
  readonly byBroker: readonly ScorecardBucket[]
  readonly byProfile: readonly ScorecardBucket[]
  readonly bySourceType: readonly ScorecardBucket[]
  readonly byReportType: readonly ScorecardBucket[]
  readonly byEnrichmentMode: readonly ScorecardBucket[]    // 'deterministic-only' vs 'llm-enabled'
}
