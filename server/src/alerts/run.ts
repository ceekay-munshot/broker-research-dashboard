// Orchestrator: gather inputs from the canonical store, run all triggers,
// apply suppression + persistence, build digests, optionally enrich
// prose, and return a deterministic AlertRunResult.
//
// This is the single entry point for both the server bootstrap (called
// once at startup against the in-memory store) and the CLI (called
// against the persistent Repo for replay / preview / digest generation).

import type {
  AlertEvent, AlertDigest, DigestKind, DigestRun, DigestRunId,
  OrgId, PortfolioSnapshot, ResearchReport, ReportSummary,
  BrokerStockOpinion, Stock, Broker,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'
import { asAlertId, asDigestRunId } from '../../../src/lib/ids'
import { RULES } from './triggers'
import { suppressionDecision } from './suppression'
import { buildDigest } from './digest'
import { enrichDigestProse, type ProseProvider, defaultProseProvider } from './prose'
import type { AlertPersistence } from './types'

export interface AlertRunInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly now?: Date
  /** Window the run considers. Defaults to now-7d. */
  readonly windowStart?: Date
  /** Persist into the canonical store + repo. The caller decides when
   *  it's safe (e.g. in dev/CLI we always persist; in eval/diff we may
   *  prefer dry-run). */
  readonly persistence: AlertPersistence
  readonly source: 'cli' | 'cron' | 'fixture' | 'replay' | 'bootstrap'
  readonly proseProvider?: ProseProvider
  /** Which digests to materialize. Defaults to all. */
  readonly digestKinds?: readonly DigestKind[]
}

export interface AlertRunResult {
  readonly orgId: OrgId
  readonly emitted: readonly AlertEvent[]
  readonly suppressed: readonly AlertEvent[]
  readonly digests: readonly AlertDigest[]
  readonly runs: readonly DigestRun[]
  readonly llmCallCount: number
  readonly llmCostUsd: number | null
}

const DEFAULT_DIGEST_KINDS: readonly DigestKind[] = ['morning_brief', 'intraday_critical', 'coverage_hygiene']

export async function runAlerts(inputs: AlertRunInputs): Promise<AlertRunResult> {
  const now = inputs.now ?? new Date()
  const windowStart = inputs.windowStart ?? new Date(now.getTime() - 7 * 24 * 3600e3)
  const proseProvider = inputs.proseProvider ?? defaultProseProvider()

  // ── 1. Run every trigger and collect candidates ──
  const candidates = RULES.flatMap((entry) =>
    entry.rule.enabled
      ? entry.trigger({
          orgId: inputs.orgId,
          snapshot: inputs.snapshot,
          reports: inputs.reports,
          summaries: inputs.summaries,
          opinions: inputs.opinions,
          closures: inputs.closures,
          stocks: inputs.stocks,
          brokers: inputs.brokers.map((b) => ({ id: b.id, shortName: b.shortName })),
          now,
          windowStart,
        })
      : [],
  )

  // ── 2. Apply suppression / dedup against the prior 24h feed ──
  const priors = inputs.persistence.listRecentAlerts(inputs.orgId, now.getTime() - 24 * 3600e3)
  const emitted: AlertEvent[] = []
  const suppressed: AlertEvent[] = []

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!
    const ruleEntry = RULES.find((r) => r.rule.kind === c.kind)
    const windowMin = ruleEntry?.rule.suppressionWindowMinutes ?? 60
    const dec = suppressionDecision(c.fingerprint, windowMin, now, [...priors, ...emitted])
    const id = asAlertId(`alrt_${inputs.orgId as unknown as string}_${c.kind}_${c.fingerprint}_${now.getTime()}_${i}`)
    const ruleAudience = ruleEntry?.rule.audience ?? 'analyst'
    const generatedAt = now.toISOString()
    const expiresAt = c.expiresInHours !== null
      ? new Date(now.getTime() + c.expiresInHours * 3600e3).toISOString()
      : null

    const event: AlertEvent = {
      id,
      orgId: inputs.orgId,
      kind: c.kind,
      severity: c.severity,
      audience: ruleAudience,
      headline: c.headline,
      body: c.body,
      reasons: c.reasons,
      bookContext: c.bookMembership === null
        ? null
        : {
            membership: c.bookMembership,
            direction: c.bookDirection,
            conviction: c.bookConviction,
            weightPct: c.bookWeightPct,
          },
      lineage: {
        reportId: c.reportId,
        brokerId: c.brokerId,
        ticker: c.ticker,
        supersedes: dec.suppressed ? [asAlertId(dec.priorId)] : [],
      },
      fingerprint: c.fingerprint,
      generatedAt,
      expiresAt,
      suppressed: dec.suppressed,
      suppressedReason: dec.suppressed ? dec.reason : null,
    }
    inputs.persistence.upsertAlert(event)
    if (dec.suppressed) suppressed.push(event)
    else emitted.push(event)
  }

  // ── 3. Build digests over the visible (non-suppressed) feed plus
  //       any prior visible alerts that fall within the window ──
  const allVisible = [
    ...emitted,
    ...priors.filter((p) => !p.suppressed),
  ]
  const digestKinds = inputs.digestKinds ?? DEFAULT_DIGEST_KINDS

  const digests: AlertDigest[] = []
  const runs: DigestRun[] = []
  let totalLlmCalls = 0
  let totalLlmCost = 0

  for (const kind of digestKinds) {
    const runId: DigestRunId = asDigestRunId(`drun_${kind}_${inputs.orgId as unknown as string}_${now.getTime()}`)
    const digestWindowStart = digestWindowStartFor(kind, now)
    const startedAt = new Date().toISOString()

    let digest = buildDigest({
      orgId: inputs.orgId,
      kind,
      runId,
      alerts: allVisible,
      now,
      windowStart: digestWindowStart,
      windowEnd: now,
    })

    // Optional prose enrichment.
    const enriched = await enrichDigestProse(digest, allVisible, proseProvider)
    digest = enriched.digest
    totalLlmCalls += enriched.llmCallCount
    if (enriched.llmCostUsd !== null) totalLlmCost += enriched.llmCostUsd

    inputs.persistence.upsertDigest(digest)

    const run: DigestRun = {
      id: runId,
      orgId: inputs.orgId,
      kind,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'success',
      alertsEvaluated: candidates.length,
      alertsEmitted: emitted.length,
      alertsSuppressed: suppressed.length,
      digestId: digest.id,
      llmCallCount: enriched.llmCallCount,
      llmCostUsd: enriched.llmCostUsd,
      error: null,
      source: inputs.source,
    }
    inputs.persistence.upsertDigestRun(run)
    digests.push(digest)
    runs.push(run)
  }

  return {
    orgId: inputs.orgId,
    emitted,
    suppressed,
    digests,
    runs,
    llmCallCount: totalLlmCalls,
    llmCostUsd: totalLlmCalls > 0 ? totalLlmCost : null,
  }
}

function digestWindowStartFor(kind: DigestKind, now: Date): Date {
  if (kind === 'intraday_critical') return new Date(now.getTime() - 4 * 3600e3)
  if (kind === 'coverage_hygiene')  return new Date(now.getTime() - 30 * 24 * 3600e3)
  return new Date(now.getTime() - 36 * 3600e3) // morning_brief
}
