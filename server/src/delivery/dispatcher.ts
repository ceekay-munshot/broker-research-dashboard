// ─────────────────────────────────────────────────────────────────────────
// Dispatcher — turns one rendered payload + a list of targets into a
// set of `DeliveryAttempt` records. Persists every attempt.
//
// Per (run × target):
//   - if suppression active → record `suppressed` attempt, don't send
//   - if channel unavailable → record `failed` with category `channel_disabled`
//   - else → call channel.send(); record outcome + retry schedule on failure
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, DeliveryAttempt, DeliveryAttemptId, DeliveryRunId, DeliveryTarget,
  DeliveryPayload, DeliveryStatus, DeliveryContentKind, DeliveryErrorCategory,
} from '../../../src/domain'
import {
  asDeliveryAttemptId,
} from '../../../src/lib/ids'
import type { Repo } from '../persistence'
import type { DeliveryRegistry } from './registry'
import { shouldSuppress, recordSuppression } from './suppression'

export interface DispatcherDeps {
  readonly repo: Repo
  readonly registry: DeliveryRegistry
  readonly now?: () => Date
  readonly genId?: (prefix: string) => string
}

export interface DispatchInputs {
  readonly orgId: OrgId
  readonly runId: DeliveryRunId
  readonly contentKind: DeliveryContentKind
  readonly payload: DeliveryPayload
  readonly targets: readonly DeliveryTarget[]
  readonly previewOnly: boolean
}

export class DeliveryDispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async dispatch(input: DispatchInputs): Promise<readonly DeliveryAttempt[]> {
    const out: DeliveryAttempt[] = []
    for (const target of input.targets) {
      const attempt = await this.attemptOne(input, target, /* attemptNumber */ 1)
      out.push(attempt)
    }
    return out
  }

  /** Replay a single attempt — used by `delivery:resend`. */
  async retry(orgId: OrgId, attemptId: DeliveryAttemptId): Promise<DeliveryAttempt | null> {
    const existing = this.deps.repo.getDeliveryAttempt(orgId, attemptId)
    if (!existing) return null
    if (existing.status === 'sent') return existing
    const channel = this.deps.registry.channel(existing.channel)
    if (!channel || !channel.available) {
      const updated: DeliveryAttempt = {
        ...existing,
        status: 'failed',
        errorCategory: 'channel_disabled',
        errorMessage: 'channel not available',
        nextRetryAt: null,
      }
      this.deps.repo.updateDeliveryAttempt(updated)
      this.deps.repo.flush()
      return updated
    }
    // Synthesize a placeholder payload from what's persisted on the attempt.
    // The actual rich body isn't on the attempt by design (we only persist
    // a summary). For replays we re-enqueue using the stored summary fields.
    const placeholder: DeliveryPayload = {
      fingerprint: existing.fingerprint,
      contentKind: existing.contentKind,
      subject: existing.payloadSummary.title,
      summary: existing.payloadSummary,
      text: existing.inAppBody ?? `${existing.payloadSummary.title}\n${existing.payloadSummary.subtitle}`,
      markdown: null, slackBlocks: null, webhookJson: null,
      clickThrough: existing.clickThrough,
    }
    const startedAt = this.now()
    const result = await channel.send({
      orgId, target: existing.target, payload: placeholder,
      attemptNumber: existing.attemptNumber + 1,
    })
    const finishedAt = this.now()
    const updated: DeliveryAttempt = {
      ...existing,
      attemptNumber: existing.attemptNumber + 1,
      status: result.ok ? 'sent' : 'failed',
      sentAt: result.ok ? finishedAt.toISOString() : null,
      latencyMs: result.latencyMs,
      errorCategory: result.errorCategory ?? null,
      errorMessage: result.errorMessage ?? null,
      nextRetryAt: result.ok ? null : this.scheduleRetry(existing.attemptNumber + 1),
      enqueuedAt: startedAt.toISOString(),
    }
    this.deps.repo.updateDeliveryAttempt(updated)
    this.deps.repo.flush()
    return updated
  }

  // ── Internal ──

  private async attemptOne(
    input: DispatchInputs, target: DeliveryTarget, attemptNumber: number,
  ): Promise<DeliveryAttempt> {
    const enqueuedAt = this.now().toISOString()
    const attemptId = this.id('att')
    const baseAttempt: DeliveryAttempt = {
      id: attemptId,
      runId: input.runId,
      orgId: input.orgId,
      contentKind: input.contentKind,
      channel: target.channel,
      target,
      attemptNumber,
      status: 'queued',
      fingerprint: input.payload.fingerprint,
      enqueuedAt,
      sentAt: null,
      latencyMs: null,
      errorCategory: null,
      errorMessage: null,
      nextRetryAt: null,
      payloadSummary: input.payload.summary,
      inAppBody: target.channel === 'in_app' ? input.payload.text : null,
      clickThrough: input.payload.clickThrough,
    }

    if (input.previewOnly) {
      // Preview attempts are not persisted.
      return { ...baseAttempt, status: 'queued' }
    }

    // Suppression check.
    const suppressed = shouldSuppress(this.deps.repo, {
      orgId: input.orgId,
      contentKind: input.contentKind,
      channel: target.channel,
      targetId: target.id,
      fingerprint: input.payload.fingerprint,
    })
    if (suppressed) {
      const finalAttempt: DeliveryAttempt = { ...baseAttempt, status: 'suppressed' as DeliveryStatus }
      this.deps.repo.appendDeliveryAttempt(finalAttempt)
      return finalAttempt
    }

    // Channel availability.
    const channel = this.deps.registry.channel(target.channel)
    if (!channel || !channel.available) {
      const finalAttempt: DeliveryAttempt = {
        ...baseAttempt,
        status: 'failed',
        errorCategory: 'channel_disabled' as DeliveryErrorCategory,
        errorMessage: channel ? 'channel disabled' : `no channel registered for ${target.channel}`,
      }
      this.deps.repo.appendDeliveryAttempt(finalAttempt)
      return finalAttempt
    }

    // Send.
    const result = await channel.send({
      orgId: input.orgId, target, payload: input.payload, attemptNumber,
    })
    const finalAttempt: DeliveryAttempt = {
      ...baseAttempt,
      status: result.ok ? 'sent' : 'failed',
      sentAt: result.ok ? this.now().toISOString() : null,
      latencyMs: result.latencyMs,
      errorCategory: result.errorCategory ?? null,
      errorMessage: result.errorMessage ?? null,
      nextRetryAt: result.ok ? null : this.scheduleRetry(attemptNumber),
    }
    this.deps.repo.appendDeliveryAttempt(finalAttempt)

    // On success, record suppression so retries don't fan out duplicates.
    if (result.ok) {
      const tmpl = this.deps.registry.template(input.contentKind)
      const ttl = tmpl?.suppressionTtlSeconds ?? 60 * 60
      recordSuppression(this.deps.repo, {
        orgId: input.orgId,
        contentKind: input.contentKind,
        channel: target.channel,
        targetId: target.id,
        fingerprint: input.payload.fingerprint,
        ttlSeconds: ttl,
        now: this.now(),
      })
    }
    return finalAttempt
  }

  private now(): Date { return this.deps.now ? this.deps.now() : new Date() }
  private id(prefix: string): DeliveryAttemptId {
    const raw = this.deps.genId
      ? this.deps.genId(prefix)
      : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    return asDeliveryAttemptId(raw)
  }
  private scheduleRetry(attemptNumber: number): string {
    const cap = 30 * 60   // 30m
    const wait = Math.min(cap, 60 * Math.pow(2, Math.min(attemptNumber - 1, 6)))
    return new Date(this.now().getTime() + wait * 1000).toISOString()
  }
}
