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
export type * from './catalysts'
export { CATALYST_TYPES, EVENT_MONITORING_WINDOWS } from './catalysts'
export type * from './sources'
export { SOURCE_KINDS } from './sources'
export type * from './delivery'
export { DELIVERY_CONTENT_KINDS, DELIVERY_WORKFLOW_CHANNELS } from './delivery'
export type * from './usage'
export { USAGE_EVENT_TYPES, USAGE_SURFACES } from './usage'
// orgControl: skip type re-export of UserRole (already exported by ./organization).
export type {
  FeatureFlagAssignmentId, PermissionGrantId, ConfigAuditEntryId,
  FeatureFlagKey, FeatureFlagSource, FeatureFlagAssignment,
  AccessibleModule, OrgModuleAccess, PermissionGrant,
  OrgIntegrationConfig, DeliveryRoutingConfig, RolloutState,
  ConfigAuditArea, ConfigAuditEntry, AccessScope, OrgSettings,
} from './orgControl'
export { USER_ROLES, FEATURE_FLAG_KEYS, ROLLOUT_STATES } from './orgControl'
export type * from './session'
