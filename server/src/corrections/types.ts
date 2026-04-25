// ─────────────────────────────────────────────────────────────────────────
// Correction / adjudication model.
//
// A `CorrectionRule` is a durable, server-side, operator-applied
// override that mutates pipeline output deterministically. Corrections
// fall into two classes:
//
//   - One-off:   `scope.artifactId` (or `messageId` / `reportId`) is
//                set; the rule fires for exactly one artifact.
//   - Reusable:  scope is broker / parser-profile / sender-domain /
//                subject-regex / report-type / source-type /
//                conflict-signature; the rule fires for every future
//                artifact that matches.
//
// Rules are NEVER an opaque ML layer. Each rule has a typed payload, a
// scope predicate, an audit trail, supersession links, and impact
// counters. Operators read and reason about them as data.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BrokerId, OrgId, Rating, ReportId, ReportType, StockTicker, Iso8601, EvidenceId,
} from '../../../src/domain'

export type CorrectionPayload =
  | { readonly kind: 'broker_override';        readonly brokerId: BrokerId }
  | { readonly kind: 'ticker_override';        readonly ticker: StockTicker }
  | { readonly kind: 'rating_override';        readonly rating: Rating | null }
  | { readonly kind: 'target_price_override';  readonly targetPrice: number | null }
  | { readonly kind: 'prior_target_override';  readonly priorTargetPrice: number | null }
  | { readonly kind: 'report_type_override';   readonly reportType: ReportType }
  | {
      readonly kind: 'digest_split_override'
      readonly sections: readonly { readonly ticker: StockTicker; readonly headline?: string }[]
    }
  | {
      readonly kind: 'source_precedence'
      readonly preferred: 'body' | 'attachment' | 'linked'
    }
  | {
      readonly kind: 'linked_artifact_inclusion'
      readonly mode: 'include_only' | 'exclude'
      readonly urls: readonly string[]
    }
  | {
      readonly kind: 'evidence_acceptance'
      readonly mode: 'accept' | 'reject'
      readonly evidenceIds: readonly EvidenceId[]
    }
  | {
      readonly kind: 'summary_field_action'
      readonly mode: 'suppress' | 'approve'
      readonly fields: readonly ('thesis' | 'keyPoints' | 'themes' | 'risks' | 'catalysts')[]
    }

export type CorrectionType = CorrectionPayload['kind']

/** When a rule is one-off, set one of `artifactId` / `messageId` /
 *  `reportId`. When reusable, set one or more of the pattern fields.
 *  Multiple pattern fields combine via AND. An empty scope matches
 *  nothing (defensive — operators are forced to be explicit). */
export interface CorrectionScope {
  // One-off targeting
  readonly artifactId?: string
  readonly messageId?: string
  readonly reportId?: ReportId

  // Reusable pattern targeting
  readonly brokerId?: BrokerId
  readonly senderEmailDomain?: string
  readonly subjectRegex?: string
  readonly parserProfile?: string
  readonly reportType?: ReportType
  readonly sourceType?: 'body' | 'attachment' | 'linked_webpage' | 'linked_pdf' | 'mixed'
  readonly linkedDomain?: string
  /** Conflict signature like "CONFLICTING_RATINGS:Buy,Sell". Useful for
   *  rules that should fire only when the deterministic extractor saw
   *  a specific conflict. */
  readonly extractionConflictSignature?: string
}

export interface CorrectionAuditEntry {
  readonly at: Iso8601
  readonly actor: string
  readonly action: 'created' | 'enabled' | 'disabled' | 'superseded' | 'note'
  readonly note?: string
  /** When `action='superseded'`, the rule that replaced it. */
  readonly replacedBy?: string
}

export interface CorrectionRule {
  readonly id: string
  readonly orgId: OrgId
  readonly isReusable: boolean
  readonly scope: CorrectionScope
  readonly payload: CorrectionPayload
  readonly createdAt: Iso8601
  readonly createdBy: string
  readonly note: string
  readonly enabled: boolean
  readonly supersededBy?: string
  /** How many artifacts this rule has fired on across runs. */
  readonly applicationCount: number
  /** How many review-queue items this rule has resolved. */
  readonly reviewItemsResolved: number
  /** Aggregate quality-score delta from before/after replays of all
   *  affected artifacts. Positive ⇒ corrections improved quality. */
  readonly aggregateQualityDelta: number
  readonly audit: readonly CorrectionAuditEntry[]
}

/** Lightweight bucket of rules indexed by rule type for cheap lookup
 *  during pipeline application. */
export interface CorrectionRuleSet {
  readonly all: readonly CorrectionRule[]
  readonly byType: ReadonlyMap<CorrectionType, readonly CorrectionRule[]>
}

export function indexRules(rules: readonly CorrectionRule[]): CorrectionRuleSet {
  const byType = new Map<CorrectionType, CorrectionRule[]>()
  for (const r of rules) {
    if (!r.enabled || r.supersededBy) continue
    const arr = byType.get(r.payload.kind) ?? []
    arr.push(r)
    byType.set(r.payload.kind, arr)
  }
  return {
    all: rules.filter((r) => r.enabled && !r.supersededBy),
    byType: new Map(
      [...byType.entries()].map(([k, v]) => [k, v]),
    ),
  }
}

/** When the pipeline applies a correction, it records the impact in this
 *  shape so the runner can persist it after the run. */
export interface CorrectionApplication {
  readonly ruleId: string
  readonly artifactId: string
  readonly fieldsCorrected: readonly string[]
}
