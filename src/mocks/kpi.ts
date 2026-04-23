import type { KpiSnapshot, IngestionStatus } from '../domain'
import { asOrgId } from '../lib/ids'

const AS_OF = '2026-04-23T08:42:00.000Z'

// Derived: these counters are cheaply computed from the other fixtures.
// They are persisted here so the Module-1 KPI cards can render without the
// UI having to derive them itself.
export const kpiSnapshots: readonly KpiSnapshot[] = [
  {
    orgId: asOrgId('org_aranya'),
    asOf: AS_OF,
    brokersTracked: 10,
    reportsIngested: 26,
    stocksCovered: 15,
    divergenceFlags: 4,
    windowDeltas: {
      brokersTracked:  { value:  0, windowDays: 30 },
      reportsIngested: { value: 22, windowDays:  7 },
      stocksCovered:   { value:  3, windowDays: 30 },
      divergenceFlags: { value:  2, windowDays:  7 },
    },
  },
  {
    orgId: asOrgId('org_sahyadri'),
    asOf: AS_OF,
    brokersTracked: 5,
    reportsIngested: 5,
    stocksCovered: 5,
    divergenceFlags: 0,
    windowDeltas: {
      brokersTracked:  { value: 1, windowDays: 30 },
      reportsIngested: { value: 4, windowDays:  7 },
      stocksCovered:   { value: 3, windowDays: 30 },
      divergenceFlags: { value: 0, windowDays:  7 },
    },
  },
]

export const ingestionStatuses: readonly IngestionStatus[] = [
  {
    orgId: asOrgId('org_aranya'),
    asOf: AS_OF,
    queued: 3,
    processing: 2,
    readyLast24h: 8,
    failedLast24h: 1,
    throughputPerHour: 6,
  },
  {
    orgId: asOrgId('org_sahyadri'),
    asOf: AS_OF,
    queued: 1,
    processing: 1,
    readyLast24h: 1,
    failedLast24h: 0,
    throughputPerHour: 1,
  },
]
