// Barrel for the Module-28 auth + tenant-isolation layer.

export { buildVerifier } from './verifier'
export { DevFixtureVerifier } from './devFixtureVerifier'
export { NoAuthVerifier } from './noAuthVerifier'
export { HeaderSignedVerifier } from './headerSignedVerifier'
export { BearerIntrospectVerifier } from './bearerIntrospectVerifier'
export { authenticate } from './middleware'
export type { AuthMiddlewareOptions } from './middleware'
export {
  ROUTE_PERMISSIONS, roleAllows, findRoutePermission, listAllProtectedRoutes,
} from './permissions'
export { recordDenial } from './audit'
export type { SessionVerifier, VerifyArgs } from './types'
