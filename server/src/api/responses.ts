import type { ServerResponse } from 'node:http'

// JSON response helpers. Mirror the envelope that docs/api-contract.md
// specifies: success payloads are bare (array or object); errors are wrapped
// in `{ error: { code, message, ... } }`.

const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Org-Id, X-Acting-User-Id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS_HEADERS,
  })
  res.end(payload)
}

export function writeError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  writeJson(res, status, { error: { code, message, details } })
}

export function writeNoContent(res: ServerResponse, status = 204): void {
  res.writeHead(status, CORS_HEADERS)
  res.end()
}

export function writeOptionsResponse(res: ServerResponse): void {
  // Preflight: 204 with CORS headers. The browser never inspects the body.
  writeNoContent(res, 204)
}

// Convenience wrappers for the most-used error shapes.
export const reply = {
  ok:               (res: ServerResponse, body: unknown) => writeJson(res, 200, body),
  notFound:         (res: ServerResponse, msg: string) => writeError(res, 404, 'NOT_FOUND', msg),
  badRequest:       (res: ServerResponse, msg: string) => writeError(res, 400, 'INVALID_QUERY', msg),
  forbidden:        (res: ServerResponse, msg: string) => writeError(res, 403, 'ORG_SCOPE_VIOLATION', msg),
  unauthenticated:  (res: ServerResponse, msg: string) => writeError(res, 401, 'UNAUTHENTICATED', msg),
  internal:         (res: ServerResponse, msg: string) => writeError(res, 500, 'INTERNAL', msg),
}
