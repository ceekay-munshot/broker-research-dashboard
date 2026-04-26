// Internal types for the Module-28 auth + tenant-isolation layer.

import type { IncomingMessage } from 'node:http'
import type {
  AuthMode, VerifiedSession, SessionVerificationResult,
} from '../../../src/domain'

export interface VerifyArgs {
  readonly req: IncomingMessage
  readonly nodeEnv: string
}

/** Pluggable session verifier. Implementations live alongside this file. */
export interface SessionVerifier {
  readonly mode: AuthMode
  readonly description: string
  /** Whether this verifier is allowed to run at all in production. */
  readonly productionSafe: boolean
  verify(args: VerifyArgs): Promise<SessionVerificationResult>
}

export type { AuthMode, VerifiedSession, SessionVerificationResult }
