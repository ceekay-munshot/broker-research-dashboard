// Barrel for the Module-27 control plane.

export { resolveOrgSettings } from './resolver'
export { deriveRolloutState } from './rolloutState'
export { appendAudit } from './audit'
export {
  setFeatureFlag, setModuleAccess, setSourceMode, setRolloutState,
  OrgControlServiceError,
} from './service'
export {
  accessibleSurfacesFor, canWrite, defaultModuleAccessFor,
} from './roles'
export type { ResolveArgs, SettingsResult } from './types'
