// Adapter-layer error hierarchy. The UI never needs to distinguish transport
// errors (fetch failures, timeouts) from domain errors; those are captured in
// the adapter's Promise rejection. These classes exist for callers that *do*
// need the distinction (e.g. the error boundary or a retry middleware).

export class AdapterError extends Error {
  public readonly code: string
  public override readonly cause: unknown

  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
    this.cause = cause
  }
}

// The caller requested an aggregate that is not visible in its org. The real
// adapter translates an HTTP 403 into this class.
export class OrgScopeViolationError extends AdapterError {
  constructor(message: string, cause?: unknown) {
    super('ORG_SCOPE_VIOLATION', message, cause)
    this.name = 'OrgScopeViolationError'
  }
}

export class NotFoundError extends AdapterError {
  constructor(message: string, cause?: unknown) {
    super('NOT_FOUND', message, cause)
    this.name = 'NotFoundError'
  }
}

export class InvalidQueryError extends AdapterError {
  constructor(message: string, cause?: unknown) {
    super('INVALID_QUERY', message, cause)
    this.name = 'InvalidQueryError'
  }
}

// The caller's bearer token is missing, expired, or invalid. The real adapter
// translates HTTP 401 into this. An error boundary can catch this class
// specifically and trigger a re-login flow.
export class UnauthenticatedError extends AdapterError {
  constructor(message: string, cause?: unknown) {
    super('UNAUTHENTICATED', message, cause)
    this.name = 'UnauthenticatedError'
  }
}

// The backend returned a JSON body whose shape doesn't match what the typed
// parser expected. This is how the frontend catches contract drift early;
// see docs/api-contract.md for the exact shape of every response.
export class ContractViolationError extends AdapterError {
  constructor(path: string, detail: string, cause?: unknown) {
    super('CONTRACT_VIOLATION', `${path}: ${detail}`, cause)
    this.name = 'ContractViolationError'
  }
}
