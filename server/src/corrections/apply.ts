// ─────────────────────────────────────────────────────────────────────────
// Apply corrections to pipeline output.
//
// Two pure functions:
//
//   applyArtifactCorrections(parsed, rawArtifact, rules)
//     Runs BEFORE candidate generation. Mutates the parsed-email
//     envelope or its linked refs (broker_override, source_precedence,
//     linked_artifact_inclusion, digest_split_override hints).
//
//   applyCandidateCorrections(candidate, rules)
//     Runs AFTER deterministic extraction, BEFORE LLM enrichment. The
//     LLM therefore sees the corrected facts. Returns the corrected
//     candidate plus a list of `CorrectionApplication` records.
//
// Both functions are pure: same input → same output. Application order
// across multiple matching rules is deterministic (sorted by rule id).
// ─────────────────────────────────────────────────────────────────────────

import type { ParsedEmailArtifact, ParsedReportCandidate, RawEmailArtifact, RawLinkedRef } from '../pipeline/models'
import { stanceFromRating } from '../pipeline/deterministic'
import type {
  CorrectionApplication, CorrectionRule, CorrectionRuleSet,
} from './types'
import { findApplicableRules, type MatchContext } from './matcher'

// ── Artifact-level apply ─────────────────────────────────────────────────

export interface ArtifactCorrectionResult {
  readonly parsed: ParsedEmailArtifact
  readonly artifact: RawEmailArtifact
  readonly applications: readonly CorrectionApplication[]
}

export function applyArtifactCorrections(
  parsed: ParsedEmailArtifact,
  artifact: RawEmailArtifact,
  ruleSet: CorrectionRuleSet,
): ArtifactCorrectionResult {
  const applications: CorrectionApplication[] = []

  const ctx: MatchContext = {
    artifactId: artifact.id,
    messageId: parsed.messageId,
    senderEmailDomain: parsed.senderAddress.split('@')[1],
    subject: parsed.subject,
  }

  const orderedRules = sortRules(findApplicableRules(ruleSet.all, ctx))

  let workingArtifact = artifact
  let workingParsed = parsed

  for (const rule of orderedRules) {
    if (rule.payload.kind === 'linked_artifact_inclusion') {
      const next = applyLinkedInclusion(workingArtifact, rule.payload)
      if (next !== workingArtifact) {
        workingArtifact = next
        workingParsed = {
          ...workingParsed,
          linkedUrls: next.linkedRefs.map((l) => l.url),
        }
        applications.push({
          ruleId: rule.id,
          artifactId: artifact.id,
          fieldsCorrected: ['linkedRefs'],
        })
      }
    }
    // Other artifact-level kinds (broker_override, digest_split_override,
    // source_precedence) are applied at the candidate stage too — see
    // applyCandidateCorrections — because their effect is mostly there.
  }

  return { parsed: workingParsed, artifact: workingArtifact, applications }
}

function applyLinkedInclusion(
  artifact: RawEmailArtifact,
  payload: Extract<CorrectionRule['payload'], { kind: 'linked_artifact_inclusion' }>,
): RawEmailArtifact {
  const allow = new Set(payload.urls)
  const filtered: readonly RawLinkedRef[] = payload.mode === 'include_only'
    ? artifact.linkedRefs.filter((l) => allow.has(l.url))
    : artifact.linkedRefs.filter((l) => !allow.has(l.url))
  if (filtered.length === artifact.linkedRefs.length) return artifact
  return { ...artifact, linkedRefs: filtered }
}

// ── Candidate-level apply ────────────────────────────────────────────────

export interface CandidateCorrectionResult {
  readonly candidate: ParsedReportCandidate
  readonly correctedFields: readonly string[]
  readonly applications: readonly CorrectionApplication[]
}

export function applyCandidateCorrections(
  candidate: ParsedReportCandidate,
  rawArtifact: RawEmailArtifact,
  parsed: ParsedEmailArtifact,
  ruleSet: CorrectionRuleSet,
  conflictSig?: string,
): CandidateCorrectionResult {
  const ctx: MatchContext = {
    artifactId: rawArtifact.id,
    messageId: parsed.messageId,
    brokerId: candidate.brokerId as unknown as string,
    senderEmailDomain: parsed.senderAddress.split('@')[1],
    subject: parsed.subject,
    reportType: candidate.reportType,
    sourceType: inferSourceType(rawArtifact, candidate),
    extractionConflictSignature: conflictSig,
  }

  const ruleHits = sortRules(findApplicableRules(ruleSet.all, ctx))

  let working = candidate
  const correctedFields: string[] = []
  const applications: CorrectionApplication[] = []

  for (const rule of ruleHits) {
    const before = working
    let touchedFields: string[] = []
    switch (rule.payload.kind) {
      case 'broker_override':
        if (working.brokerId !== rule.payload.brokerId) {
          working = { ...working, brokerId: rule.payload.brokerId }
          touchedFields = ['brokerId']
        }
        break
      case 'ticker_override':
        if (working.ticker !== rule.payload.ticker) {
          working = { ...working, ticker: rule.payload.ticker }
          touchedFields = ['ticker']
        }
        break
      case 'rating_override':
        if (working.rating !== rule.payload.rating) {
          working = {
            ...working,
            rating: rule.payload.rating,
            stance: stanceFromRating(rule.payload.rating),
          }
          touchedFields = ['rating', 'stance']
        }
        break
      case 'target_price_override':
        if (working.targetPrice !== rule.payload.targetPrice) {
          working = { ...working, targetPrice: rule.payload.targetPrice }
          touchedFields = ['targetPrice']
        }
        break
      case 'prior_target_override':
        if (working.priorTargetPrice !== rule.payload.priorTargetPrice) {
          working = { ...working, priorTargetPrice: rule.payload.priorTargetPrice }
          touchedFields = ['priorTargetPrice']
        }
        break
      case 'report_type_override':
        if (working.reportType !== rule.payload.reportType) {
          working = { ...working, reportType: rule.payload.reportType }
          touchedFields = ['reportType']
        }
        break
      // Stage-mismatched payloads (handled elsewhere or no-op here).
      default:
        break
    }
    if (touchedFields.length > 0) {
      correctedFields.push(...touchedFields)
      applications.push({
        ruleId: rule.id,
        artifactId: rawArtifact.id,
        fieldsCorrected: touchedFields,
      })
    }
    void before
  }

  return { candidate: working, correctedFields, applications }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sortRules(rules: readonly CorrectionRule[]): readonly CorrectionRule[] {
  // Deterministic order — by createdAt then id. Newer rules win on
  // identical fields because they apply later.
  return [...rules].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt)
    return a.id.localeCompare(b.id)
  })
}

function inferSourceType(
  raw: RawEmailArtifact,
  candidate: ParsedReportCandidate,
): MatchContext['sourceType'] {
  if (candidate.origin === 'direct_attachment') return 'attachment'
  if (raw.linkedRefs.length > 0) {
    const first = raw.linkedRefs[0]!
    return first.hint === 'pdf' ? 'linked_pdf' : 'linked_webpage'
  }
  return 'body'
}
