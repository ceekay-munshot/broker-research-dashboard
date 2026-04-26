// ─────────────────────────────────────────────────────────────────────────
// Scheduler — owns DeliverySchedules + decides which are due.
//
// Today: invoked by `delivery:run-due` from the CLI.
// Tomorrow: a daemon calls `runDue(now)` on a tick.
//
// Source-freshness gate: each template declares its source dependencies.
// Before rendering, the scheduler asks the SourceManager for current
// health. Failing → defer (status=skipped_freshness). Stale → proceed
// with a degraded badge in the payload.
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, DeliveryContentKind, DeliverySchedule, DeliveryScheduleId,
  DeliveryRun, DeliveryRunId, DeliveryAttempt, DeliveryPayload,
  ScheduleCadence, FreshnessGateOutcome, SourcesHealthSnapshot,
  SourceKind, DeliveryPreview,
} from '../../../src/domain'
import {
  asDeliveryRunId, asDeliveryScheduleId,
} from '../../../src/lib/ids'
import type { Repo } from '../persistence'
import type { InMemoryStore } from '../store/InMemoryStore'
import type { SourceManager } from '../sources'
import type { DeliveryRegistry } from './registry'
import { DeliveryDispatcher } from './dispatcher'
import type { SchedulerResult } from './types'

export interface SchedulerDeps {
  readonly repo: Repo
  readonly store: InMemoryStore
  readonly registry: DeliveryRegistry
  readonly sourceManager?: SourceManager
  readonly now?: () => Date
  readonly genId?: (prefix: string) => string
}

/** Default per-content-kind cadences. Operators can override per-org. */
const DEFAULT_CADENCES: Readonly<Record<DeliveryContentKind, { label: string; cadence: ScheduleCadence }>> = {
  morning_book_brief: {
    label: 'daily 07:30 UTC',
    cadence: { kind: 'daily', atUtcHour: 7, atUtcMinute: 30 },
  },
  intraday_critical: {
    label: 'every 10 min',
    cadence: { kind: 'interval', everySeconds: 10 * 60 },
  },
  coverage_hygiene: {
    label: 'daily 16:00 UTC',
    cadence: { kind: 'daily', atUtcHour: 16, atUtcMinute: 0 },
  },
  weekly_catalyst_brief: {
    label: 'Monday 06:00 UTC',
    cadence: { kind: 'weekly', atUtcHour: 6, atUtcMinute: 0, weekday: 1 },
  },
  source_health_incident: {
    label: 'event-driven',
    cadence: { kind: 'event_driven' },
  },
}

export class DeliveryScheduler {
  private readonly dispatcher: DeliveryDispatcher

  constructor(private readonly deps: SchedulerDeps) {
    this.dispatcher = new DeliveryDispatcher({
      repo: deps.repo, registry: deps.registry, now: deps.now, genId: deps.genId,
    })
  }

  /** Lazily seed default schedules per (org, contentKind) on first use. */
  ensureSchedules(orgIds: readonly OrgId[]): void {
    for (const orgId of orgIds) {
      for (const kind of Object.keys(DEFAULT_CADENCES) as DeliveryContentKind[]) {
        const existing = this.deps.repo.listDeliverySchedules(orgId, { contentKind: kind })
        if (existing.length > 0) continue
        const def = DEFAULT_CADENCES[kind]
        const now = this.now().toISOString()
        const sch: DeliverySchedule = {
          id: asDeliveryScheduleId(`sch_${orgId as unknown as string}_${kind}`),
          orgId,
          contentKind: kind,
          cadenceLabel: def.label,
          cadence: def.cadence,
          enabled: true,
          lastFiredAt: null,
          nextDueAt: nextDueAt(def.cadence, this.now(), null),
          createdAt: now,
          updatedAt: now,
        }
        this.deps.repo.upsertDeliverySchedule(sch)
      }
    }
    this.deps.repo.flush()
  }

  /** Returns the schedules that are due `at-or-before` now. */
  dueSchedules(orgId: OrgId, asOf: Date = this.now()): readonly DeliverySchedule[] {
    return this.deps.repo
      .listDeliverySchedules(orgId, { enabledOnly: true })
      .filter((s) => s.cadence.kind !== 'event_driven')
      .filter((s) => !s.nextDueAt || Date.parse(s.nextDueAt) <= asOf.getTime())
  }

  /** Run all due schedules for an org. */
  async runDue(orgId: OrgId): Promise<readonly SchedulerResult[]> {
    const out: SchedulerResult[] = []
    for (const sch of this.dueSchedules(orgId)) {
      const result = await this.runSchedule(orgId, sch.id, 'scheduled')
      if (result) out.push(result)
    }
    return out
  }

  /** Run one specific schedule (or content kind) on demand. */
  async runOne(
    orgId: OrgId, contentKind: DeliveryContentKind, trigger: 'cli' | 'event' | 'scheduled' = 'cli',
  ): Promise<SchedulerResult | null> {
    const schedules = this.deps.repo.listDeliverySchedules(orgId, { contentKind })
    const sch = schedules[0]
    if (sch) return this.runSchedule(orgId, sch.id, trigger)
    // No schedule yet — synthesize an ad-hoc run.
    return this.run(orgId, null, contentKind, trigger)
  }

  /** Render-only preview with the same gating as a real run. */
  async preview(orgId: OrgId, contentKind: DeliveryContentKind): Promise<DeliveryPreview> {
    const tmpl = this.deps.registry.template(contentKind)
    const now = this.now()
    if (!tmpl) {
      return {
        orgId, contentKind, generatedAt: now.toISOString(),
        freshnessGate: { checked: false, dependsOn: [], blockingFailing: [], degradingStale: [], decision: 'proceed' },
        payload: null, wouldDeliverTo: [], wouldSuppressFor: [],
        reason: `no template registered for ${contentKind}`,
      }
    }
    const sourcesHealth = this.snapshot(orgId)
    const gate = computeGate(tmpl.dependsOnSources, sourcesHealth, contentKind)
    if (gate.decision === 'defer') {
      return {
        orgId, contentKind, generatedAt: now.toISOString(),
        freshnessGate: gate, payload: null, wouldDeliverTo: [], wouldSuppressFor: [],
        reason: `deferred: source(s) ${gate.blockingFailing.join(', ')} are failing`,
      }
    }
    const payload = tmpl.render({ orgId, now, sourcesHealth }, this.deps.store)
    const targets = this.deps.registry.subscriptions.resolveTargets(orgId, contentKind)
    if (!payload) {
      return {
        orgId, contentKind, generatedAt: now.toISOString(),
        freshnessGate: gate, payload: null, wouldDeliverTo: [], wouldSuppressFor: [],
        reason: 'template returned no payload (nothing to say)',
      }
    }
    const wouldSend: typeof targets[number][] = []
    const wouldSuppress: typeof targets[number][] = []
    for (const target of targets) {
      const sup = this.deps.repo.findDeliverySuppression(orgId, {
        contentKind, targetId: target.id, fingerprint: payload.fingerprint,
      })
      if (sup) wouldSuppress.push(target)
      else wouldSend.push(target)
    }
    return {
      orgId, contentKind, generatedAt: now.toISOString(),
      freshnessGate: gate, payload,
      wouldDeliverTo: wouldSend, wouldSuppressFor: wouldSuppress, reason: null,
    }
  }

  // ── Internal ──

  private async runSchedule(
    orgId: OrgId, scheduleId: DeliveryScheduleId, trigger: DeliveryRun['trigger'],
  ): Promise<SchedulerResult | null> {
    const sch = this.deps.repo.getDeliverySchedule(orgId, scheduleId)
    if (!sch) return null
    const result = await this.run(orgId, scheduleId, sch.contentKind, trigger)
    if (result) {
      const finishedAt = this.now()
      this.deps.repo.upsertDeliverySchedule({
        ...sch,
        lastFiredAt: finishedAt.toISOString(),
        nextDueAt: nextDueAt(sch.cadence, finishedAt, finishedAt.toISOString()),
        updatedAt: finishedAt.toISOString(),
      })
      this.deps.repo.flush()
    }
    return result
  }

  private async run(
    orgId: OrgId,
    scheduleId: DeliveryScheduleId | null,
    contentKind: DeliveryContentKind,
    trigger: DeliveryRun['trigger'],
  ): Promise<SchedulerResult | null> {
    const tmpl = this.deps.registry.template(contentKind)
    if (!tmpl) return null
    const startedAt = this.now()
    const sourcesHealth = this.snapshot(orgId)
    const gate = computeGate(tmpl.dependsOnSources, sourcesHealth, contentKind)
    let payload: DeliveryPayload | null = null
    let attempts: readonly DeliveryAttempt[] = []
    let runStatus: DeliveryRun['status'] = 'success'
    let note: string | null = null

    if (gate.decision === 'defer') {
      runStatus = 'skipped_freshness'
      note = `source(s) ${gate.blockingFailing.join(', ')} are failing`
    } else {
      payload = tmpl.render({ orgId, now: startedAt, sourcesHealth }, this.deps.store)
      if (!payload) {
        runStatus = 'skipped_empty'
        note = 'template returned no payload'
      } else {
        const targets = this.deps.registry.subscriptions.resolveTargets(orgId, contentKind)
        const runId = this.id('run') as unknown as DeliveryRunId
        attempts = await this.dispatcher.dispatch({
          orgId, runId, contentKind, payload, targets, previewOnly: false,
        })
        const sent = attempts.filter((a) => a.status === 'sent').length
        const failed = attempts.filter((a) => a.status === 'failed').length
        const suppressed = attempts.filter((a) => a.status === 'suppressed').length
        if (attempts.length === 0) { runStatus = 'success'; note = 'no targets configured' }
        else if (sent === attempts.length) runStatus = 'success'
        else if (sent === 0 && failed === 0 && suppressed === attempts.length) runStatus = 'suppressed'
        else if (failed > 0 && sent === 0) runStatus = 'failed'
        else runStatus = 'partial'
      }
    }

    const finishedAt = this.now()
    const runId = (attempts[0]?.runId) ?? (this.id('run') as unknown as DeliveryRunId)
    const run: DeliveryRun = {
      id: runId,
      orgId,
      scheduleId,
      contentKind,
      trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      fingerprint: payload?.fingerprint ?? '',
      freshnessGate: gate,
      attemptIds: attempts.map((a) => a.id),
      status: runStatus,
      note,
    }
    this.deps.repo.appendDeliveryRun(run)
    this.deps.repo.flush()
    return { run, attempts, previewOnly: false }
  }

  private snapshot(orgId: OrgId): SourcesHealthSnapshot | null {
    if (!this.deps.sourceManager) return null
    try { return this.deps.sourceManager.snapshot(orgId) } catch { return null }
  }

  private now(): Date { return this.deps.now ? this.deps.now() : new Date() }
  private id(prefix: string): DeliveryRunId {
    const raw = this.deps.genId
      ? this.deps.genId(prefix)
      : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    return asDeliveryRunId(raw)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeGate(
  deps: readonly SourceKind[], snap: SourcesHealthSnapshot | null, contentKind: DeliveryContentKind,
): FreshnessGateOutcome {
  // Source-health incidents always proceed — that's how operators learn
  // the source IS failing.
  if (contentKind === 'source_health_incident') {
    return { checked: false, dependsOn: deps, blockingFailing: [], degradingStale: [], decision: 'proceed' }
  }
  if (!snap || deps.length === 0) {
    return { checked: false, dependsOn: deps, blockingFailing: [], degradingStale: [], decision: 'proceed' }
  }
  const blocking: SourceKind[] = []
  const degrading: SourceKind[] = []
  for (const k of deps) {
    const s = snap.sources.find((x) => x.kind === k)
    if (!s) continue
    if (s.status === 'failing') blocking.push(k)
    else if (s.status === 'stale') degrading.push(k)
  }
  let decision: FreshnessGateOutcome['decision'] = 'proceed'
  if (blocking.length > 0) decision = 'defer'
  else if (degrading.length > 0) decision = 'proceed_degraded'
  return { checked: true, dependsOn: deps, blockingFailing: blocking, degradingStale: degrading, decision }
}

function nextDueAt(cadence: ScheduleCadence, now: Date, lastFiredIso: string | null): string | null {
  if (cadence.kind === 'event_driven') return null
  if (cadence.kind === 'interval') {
    const base = lastFiredIso ? new Date(lastFiredIso) : now
    return new Date(base.getTime() + cadence.everySeconds * 1000).toISOString()
  }
  if (cadence.kind === 'daily') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      cadence.atUtcHour, cadence.atUtcMinute, 0))
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString()
  }
  // weekly
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    cadence.atUtcHour, cadence.atUtcMinute, 0))
  while (d.getUTCDay() !== cadence.weekday || d.getTime() <= now.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString()
}
