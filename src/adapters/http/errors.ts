import {
  AdapterError, OrgScopeViolationError, NotFoundError,
  InvalidQueryError, UnauthenticatedError,
} from '../errors'

// Uniform error envelope the backend returns on non-2xx responses:
//   { "error": { "code": string, "message": string, "details"?: unknown,
//                "requestId"?: string } }
interface ErrorEnvelope {
  readonly error: {
    readonly code?: string
    readonly message?: string
    readonly details?: unknown
    readonly requestId?: string
  }
}

function isErrorEnvelope(x: unknown): x is ErrorEnvelope {
  return typeof x === 'object' && x !== null && 'error' in x && typeof (x as { error: unknown }).error === 'object'
}

/**
 * Map a fetch Response into the right AdapterError subclass. Reads the
 * JSON body if present so the server's machine-readable code + message
 * are preserved; falls back to status-line text if the body isn't JSON.
 */
export async function mapHttpError(response: Response, requestPath: string): Promise<AdapterError> {
  const status = response.status
  let code = 'HTTP_ERROR'
  let message = `${status} ${response.statusText || 'error'}`
  let details: unknown = null
  let requestId: string | undefined

  try {
    const body = (await response.clone().json()) as unknown
    if (isErrorEnvelope(body)) {
      code = body.error.code ?? code
      message = body.error.message ?? message
      details = body.error.details ?? null
      requestId = body.error.requestId
    }
  } catch {
    // Non-JSON body (e.g. HTML error page from proxy). Fall through to
    // status-line message.
  }

  const cause = { status, requestPath, details, requestId }

  switch (status) {
    case 400: return new InvalidQueryError(message, cause)
    case 401: return new UnauthenticatedError(message, cause)
    case 403: return new OrgScopeViolationError(message, cause)
    case 404: return new NotFoundError(message, cause)
    default:  return new AdapterError(code, message, cause)
  }
}

/** Non-status error (network failure, aborted, etc.). */
export function wrapTransportError(e: unknown, requestPath: string): AdapterError {
  const msg = e instanceof Error ? e.message : String(e)
  return new AdapterError('TRANSPORT_ERROR', `${requestPath}: ${msg}`, e)
}
