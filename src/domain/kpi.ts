import type { OrgId } from './ids'
import type { Iso8601 } from './common'

export interface KpiDelta {
  readonly value: number
  readonly windowDays: number
}

// Dashboard KPI snapshot. Derived; cached server-side in production. The
// counters map one-to-one to the four cards on the Module-1 dashboard.
export interface KpiSnapshot {
  readonly orgId: OrgId
  readonly asOf: Iso8601
  readonly brokersTracked: number
  readonly reportsIngested: number
  readonly stocksCovered: number
  readonly divergenceFlags: number
  readonly windowDeltas: {
    readonly brokersTracked: KpiDelta
    readonly reportsIngested: KpiDelta
    readonly stocksCovered: KpiDelta
    readonly divergenceFlags: KpiDelta
  }
}
