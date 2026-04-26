// Verifier factory — picks one impl based on `AUTH_MODE` env.

import type { AuthMode } from '../../../src/domain'
import type { SessionVerifier } from './types'
import { DevFixtureVerifier } from './devFixtureVerifier'
import { NoAuthVerifier } from './noAuthVerifier'
import { HeaderSignedVerifier } from './headerSignedVerifier'
import { BearerIntrospectVerifier } from './bearerIntrospectVerifier'

export function buildVerifier(env: NodeJS.ProcessEnv = process.env): SessionVerifier {
  const mode = (env.AUTH_MODE ?? 'dev_fixture') as AuthMode
  switch (mode) {
    case 'header_signed':
      return new HeaderSignedVerifier({
        secret: env.MUNSHOT_SESSION_SECRET ?? '',
      })
    case 'bearer_introspect':
      return new BearerIntrospectVerifier({
        introspectUrl: env.MUNSHOT_INTROSPECT_URL ?? '',
        clientId: env.MUNSHOT_INTROSPECT_CLIENT_ID ?? null,
        clientSecret: env.MUNSHOT_INTROSPECT_CLIENT_SECRET ?? null,
      })
    case 'dev_fixture':
      return new DevFixtureVerifier({
        defaultOrgId: env.DEV_AUTH_DEFAULT_ORG_ID ?? 'org_vimana',
        defaultUserId: env.DEV_AUTH_DEFAULT_USER_ID ?? 'usr_vimana_pm',
        defaultEmail: env.DEV_AUTH_DEFAULT_EMAIL ?? 'dev@local',
        defaultRole: (env.DEV_AUTH_DEFAULT_ROLE as 'admin' | 'operator' | 'analyst') ?? 'admin',
      })
    case 'no_auth':
      return new NoAuthVerifier(
        env.DEV_AUTH_DEFAULT_ORG_ID ?? 'org_vimana',
        env.DEV_AUTH_DEFAULT_USER_ID ?? 'usr_vimana_pm',
      )
    default:
      // Unknown mode — fail closed.
      return new NoAuthVerifier('', '')
  }
}
