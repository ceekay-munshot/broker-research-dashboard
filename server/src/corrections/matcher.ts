// ─────────────────────────────────────────────────────────────────────────
// Pure rule-vs-context matcher.
//
// The pipeline calls `findApplicableRules(rules, ctx)` at two stages:
//
//   1. Artifact stage — `ctx` carries `artifactId`, `messageId`,
//      sender domain, subject, parser-profile-id-best-guess, etc.
//
//   2. Candidate stage — `ctx` adds `brokerId`, `ticker`, `reportType`,
//      `sourceType`, conflict signature.
//
// A rule matches iff every set field in `rule.scope` matches the
// corresponding field in `ctx`. Empty scopes never match (operators
// must be explicit about what they're targeting).
// ─────────────────────────────────────────────────────────────────────────

import type { CorrectionRule, CorrectionScope } from './types'

export interface MatchContext {
  readonly artifactId?: string
  readonly messageId?: string
  readonly reportId?: string

  readonly brokerId?: string
  readonly senderEmailDomain?: string
  readonly subject?: string
  readonly parserProfile?: string
  readonly reportType?: string
  readonly sourceType?: 'body' | 'attachment' | 'linked_webpage' | 'linked_pdf' | 'mixed'
  readonly linkedDomain?: string
  readonly extractionConflictSignature?: string
}

/** Return only the rules whose scope matches `ctx`. */
export function findApplicableRules(
  rules: readonly CorrectionRule[],
  ctx: MatchContext,
): readonly CorrectionRule[] {
  const out: CorrectionRule[] = []
  for (const r of rules) {
    if (!r.enabled || r.supersededBy) continue
    if (matchesScope(r.scope, ctx)) out.push(r)
  }
  return out
}

export function matchesScope(scope: CorrectionScope, ctx: MatchContext): boolean {
  // Empty scope never matches — operators must be explicit.
  if (isEmptyScope(scope)) return false

  // One-off scoping: any one of these fields is sufficient.
  if (scope.artifactId !== undefined && scope.artifactId !== ctx.artifactId) return false
  if (scope.messageId  !== undefined && scope.messageId  !== ctx.messageId)  return false
  if (scope.reportId   !== undefined && (scope.reportId as unknown as string) !== ctx.reportId) return false

  // Pattern scoping: every set field must match.
  if (scope.brokerId !== undefined && (scope.brokerId as unknown as string) !== ctx.brokerId) return false
  if (scope.senderEmailDomain !== undefined && scope.senderEmailDomain.toLowerCase() !== (ctx.senderEmailDomain ?? '').toLowerCase()) return false
  if (scope.subjectRegex !== undefined) {
    if (!ctx.subject) return false
    try {
      if (!new RegExp(scope.subjectRegex, 'i').test(ctx.subject)) return false
    } catch { return false }
  }
  if (scope.parserProfile !== undefined && scope.parserProfile !== ctx.parserProfile) return false
  if (scope.reportType !== undefined && scope.reportType !== ctx.reportType) return false
  if (scope.sourceType !== undefined && scope.sourceType !== ctx.sourceType) return false
  if (scope.linkedDomain !== undefined && scope.linkedDomain.toLowerCase() !== (ctx.linkedDomain ?? '').toLowerCase()) return false
  if (scope.extractionConflictSignature !== undefined
      && scope.extractionConflictSignature !== ctx.extractionConflictSignature) return false

  return true
}

function isEmptyScope(s: CorrectionScope): boolean {
  return s.artifactId === undefined
    && s.messageId === undefined
    && s.reportId === undefined
    && s.brokerId === undefined
    && s.senderEmailDomain === undefined
    && s.subjectRegex === undefined
    && s.parserProfile === undefined
    && s.reportType === undefined
    && s.sourceType === undefined
    && s.linkedDomain === undefined
    && s.extractionConflictSignature === undefined
}

/** Build a stable `extractionConflictSignature` from a sorted vocab list
 *  so corrections can be scoped to specific conflicts. */
export function conflictSignature(category: string, values: readonly string[]): string {
  return `${category}:${[...values].sort().join(',')}`
}
