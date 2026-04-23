import type { OrgScope } from '../../domain'
import { mapHttpError, wrapTransportError } from './errors'
import { NotFoundError } from '../errors'

export type FetchImpl = typeof fetch

export interface HttpClientOptions {
  /** Absolute URL prefix (no trailing slash) joined with endpoint paths. */
  readonly baseUrl: string
  /** Bearer token or a (sync or async) getter. Omit to send no Authorization. */
  readonly authToken?: string | (() => string | null | undefined | Promise<string | null | undefined>)
  /** Custom fetch — used by stub mode and tests. Defaults to global fetch. */
  readonly fetchImpl?: FetchImpl
  /** Extra headers merged into every request. */
  readonly defaultHeaders?: Readonly<Record<string, string>>
}

export interface HttpRequestConfig {
  readonly method?: 'GET'
  readonly query?: QueryInput
}

export type QueryInput = Readonly<Record<
  string,
  string | number | boolean | readonly string[] | readonly number[] | null | undefined
>>

/**
 * Thin fetch wrapper used by HttpResearchAdapter. Keeps three concerns in one
 * place: URL + query construction, scoped-request headers, and non-2xx → typed
 * AdapterError mapping. Does not parse response bodies (returns raw unknown);
 * parsing is the caller's job so parsers.ts can catch contract drift.
 */
export class HttpClient {
  private readonly baseUrl: string
  private readonly tokenGetter: () => Promise<string | null | undefined>
  private readonly fetchImpl: FetchImpl
  private readonly defaultHeaders: Readonly<Record<string, string>>

  constructor(opts: HttpClientOptions) {
    if (!opts.baseUrl) throw new Error('HttpClient: baseUrl is required')
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')

    if (typeof opts.authToken === 'function') {
      const fn = opts.authToken
      this.tokenGetter = async () => await fn()
    } else {
      const token = opts.authToken ?? null
      this.tokenGetter = async () => token
    }

    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a))
    this.defaultHeaders = opts.defaultHeaders ?? {}
  }

  /**
   * Issue a GET request scoped to an org. Throws the appropriate
   * AdapterError subclass on non-2xx. Returns the raw JSON body — callers
   * must parse it through src/adapters/http/parsers.ts.
   */
  async request(path: string, scope: OrgScope, config: HttpRequestConfig = {}): Promise<unknown> {
    const url = this.composeUrl(path, config.query)
    const headers = await this.composeHeaders(scope)

    let response: Response
    try {
      response = await this.fetchImpl(url, { method: config.method ?? 'GET', headers })
    } catch (e) {
      throw wrapTransportError(e, path)
    }

    if (!response.ok) throw await mapHttpError(response, path)

    // 204 No Content → null. Otherwise expect JSON.
    if (response.status === 204) return null
    try {
      return await response.json()
    } catch (e) {
      throw wrapTransportError(e, path)
    }
  }

  /**
   * Variant for `get*` methods on the ResearchAdapter interface that allow
   * `null` as a legitimate "not found" result. Catches NotFoundError →
   * null; every other AdapterError still propagates.
   */
  async requestOrNull(path: string, scope: OrgScope, config: HttpRequestConfig = {}): Promise<unknown | null> {
    try {
      return await this.request(path, scope, config)
    } catch (e) {
      if (e instanceof NotFoundError) return null
      throw e
    }
  }

  // ── URL + headers ───────────────────────────────────────────────────

  private composeUrl(path: string, query: QueryInput | undefined): string {
    const base = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`
    const qs = encodeQuery(query)
    return qs ? `${base}?${qs}` : base
  }

  private async composeHeaders(scope: OrgScope): Promise<Headers> {
    const headers = new Headers({
      Accept: 'application/json',
      'X-Org-Id': scope.orgId as unknown as string,
      'X-Acting-User-Id': scope.actingUserId as unknown as string,
      ...this.defaultHeaders,
    })
    const token = await this.tokenGetter()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  }
}

// ── Query-string encoding ────────────────────────────────────────────
// Arrays serialize as comma-separated values, matching the contract
// documented in docs/api-contract.md. `null` and `undefined` values are
// omitted; empty arrays are omitted.

export function encodeQuery(query: QueryInput | undefined): string {
  if (!query) return ''
  const parts: string[] = []
  for (const key of Object.keys(query)) {
    const value = query[key]
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      parts.push(`${encodeURIComponent(key)}=${value.map((v) => encodeURIComponent(String(v))).join(',')}`)
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.join('&')
}
