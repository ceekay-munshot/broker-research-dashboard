// Barrel for the canonical domain model. Import everything from
// `src/domain` — the physical file split is an implementation detail.

export type * from './ids'
export type * from './common'
export type * from './organization'
export type * from './broker'
export type * from './report'
export type * from './stock'
export type * from './sector'
export type * from './kpi'
export type * from './status'
export type * from './portfolio'
export type * from './alerts'
export { ALERT_SEVERITIES, ALERT_TRIGGER_KINDS } from './alerts'
export type * from './calibration'
export { RETURN_WINDOWS, WINDOW_DAYS, SIGNAL_EVENT_KINDS } from './calibration'
