// Internal types for the delivery layer (not part of /v1).

import type {
  OrgId, DeliveryContentKind, DeliveryPayload, DeliveryTarget,
  DeliveryAttempt, DeliveryAttemptId, DeliveryRun, DeliverySchedule,
  WorkflowSubscription, FreshnessGateOutcome, SourcesHealthSnapshot,
} from '../../../src/domain'

/** Inputs the templates need to render. The scheduler hands a snapshot
 *  of the canonical store + sources health to each template. */
export interface TemplateInputs {
  readonly orgId: OrgId
  readonly now: Date
  readonly sourcesHealth: SourcesHealthSnapshot | null
}

/** A template's own metadata + render fn. Pure transform. */
export interface DeliveryTemplateImpl {
  readonly contentKind: DeliveryContentKind
  readonly displayName: string
  readonly dependsOnSources: readonly import('../../../src/domain').SourceKind[]
  readonly suppressionTtlSeconds: number
  /** Returns null when there's "nothing to say" (e.g. no critical alerts). */
  render(input: TemplateInputs, store: import('../store/InMemoryStore').InMemoryStore): DeliveryPayload | null
}

/** A channel sends one payload to one target. */
export interface ChannelSendInputs {
  readonly orgId: OrgId
  readonly target: DeliveryTarget
  readonly payload: DeliveryPayload
  readonly attemptNumber: number
}

export interface ChannelSendResult {
  readonly ok: boolean
  readonly latencyMs: number
  readonly errorCategory?: import('../../../src/domain').DeliveryErrorCategory
  readonly errorMessage?: string
}

export interface DeliveryChannelImpl {
  readonly channel: import('../../../src/domain').DeliveryChannel
  /** Whether the channel is reachable in this env (config + secret present). */
  readonly available: boolean
  /** Free-form description for the operator UI. */
  readonly description: string
  send(input: ChannelSendInputs): Promise<ChannelSendResult>
}

/** Snapshot used by the dispatcher to decide what to do per (run, target). */
export interface DispatchPlan {
  readonly target: DeliveryTarget
  readonly action: 'send' | 'suppress' | 'channel_unavailable'
  readonly reason: string | null
}

export interface SchedulerResult {
  readonly run: DeliveryRun
  readonly attempts: readonly DeliveryAttempt[]
  readonly previewOnly: boolean
}

/** Re-exports kept tight for the cli/registry. */
export type { DeliverySchedule, WorkflowSubscription, DeliveryAttemptId, FreshnessGateOutcome }
