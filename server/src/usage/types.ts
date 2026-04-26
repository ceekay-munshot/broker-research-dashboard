// Internal helpers shared by the aggregator + ROI computer.

import type {
  UsageEvent, OrgUsageSnapshot, PilotRoiSnapshot, OrgId,
} from '../../../src/domain'
import type { Repo } from '../persistence'

export interface AggregatorInputs {
  readonly orgId: OrgId
  readonly events: readonly UsageEvent[]
  readonly windowMs: number
  readonly now: Date
  /** Optional: deliveries known for the window — drives delivery
   *  engagement metrics. */
  readonly deliveryAttempts: readonly import('../../../src/domain').DeliveryAttempt[]
}

export interface ComputeArgs {
  readonly orgId: OrgId
  readonly windowDays: number
  readonly repo: Repo
  readonly now?: Date
}

export type Snapshot = OrgUsageSnapshot
export type Roi = PilotRoiSnapshot
