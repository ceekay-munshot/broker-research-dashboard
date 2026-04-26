// Deterministic dedup / suppression.
//
// Each candidate alert carries a stable `fingerprint` derived from its
// rule + lineage (orgId + kind + ticker + reportId, etc.). When the
// engine emits a candidate, we check the prior persisted alerts within
// the rule's suppression window. If a matching fingerprint is already
// present, we mark the candidate `suppressed=true` (still persisting it
// so an operator can see what was collapsed) and do not re-deliver.
//
// Pure logic. No I/O.

import { createHash } from 'node:crypto'
import type {
  AlertEvent, AlertTriggerKind,
  ReportId, StockTicker, BrokerId, OrgId,
} from '../../../src/domain'

export function buildFingerprint(input: {
  readonly orgId: OrgId
  readonly kind: AlertTriggerKind
  readonly ticker: StockTicker | null
  readonly brokerId: BrokerId | null
  readonly reportId: ReportId | null
  /** Optional discriminator that bumps when the underlying signal moves
   *  (e.g. a new target Δ). Defaults to empty string. */
  readonly bucket?: string
}): string {
  const parts = [
    input.orgId as unknown as string,
    input.kind,
    (input.ticker as unknown as string) ?? '',
    (input.brokerId as unknown as string) ?? '',
    (input.reportId as unknown as string) ?? '',
    input.bucket ?? '',
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)
}

/** Decide whether a candidate is suppressed against the prior alert
 *  feed. Returns the suppression record or null. */
export function suppressionDecision(
  candidateFingerprint: string,
  windowMinutes: number,
  now: Date,
  priors: readonly AlertEvent[],
): { suppressed: true; reason: string; priorId: string } | { suppressed: false } {
  const cutoffMs = now.getTime() - windowMinutes * 60_000
  for (const a of priors) {
    if (a.fingerprint !== candidateFingerprint) continue
    if (a.suppressed) continue
    const t = Date.parse(a.generatedAt)
    if (Number.isFinite(t) && t >= cutoffMs) {
      return {
        suppressed: true,
        reason: `prior alert ${a.id} fired within ${windowMinutes}m`,
        priorId: a.id as unknown as string,
      }
    }
  }
  return { suppressed: false }
}
