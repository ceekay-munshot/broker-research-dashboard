// ─────────────────────────────────────────────────────────────────────────
// Raw-upstream source client.
//
// The pipeline + sync runner only know about `RawUpstreamClient.fetchSince`.
// Two implementations ship:
//
//   MockRawUpstreamClient — fixture-driven for tests. Cursor-aware so
//                            replay/resume tests work end-to-end.
//   HttpRawUpstreamClient — production: HTTPS GET against the upstream's
//                            `/v1/raw/emails?since=…&cursor=…`. Read-only;
//                            isolates org scope explicitly via `X-Org-Id`.
//
// Both return `RawEmailArtifact` (shape used by the pipeline) plus the
// upstream's row id for traceability — the runner persists both.
// ─────────────────────────────────────────────────────────────────────────

import type { OrgId } from '../../../src/domain'
import type { RawEmailArtifact } from '../pipeline/models'

/** A page of raw artifacts plus the cursor to resume from on the next
 *  call. `nextCursor === null` ⇒ caller has reached the tail. */
export interface RawArtifactPage {
  readonly items: readonly RawArtifactRow[]
  readonly nextCursor: string | null
}

export interface RawArtifactRow {
  /** Upstream's stable row id (used as the primary dedupe key). */
  readonly upstreamId: string
  readonly orgId: OrgId
  readonly artifact: RawEmailArtifact
}

export interface FetchSinceParams {
  readonly orgId: OrgId
  readonly cursor: string | null
  readonly since: string | null
  readonly limit?: number
}

export interface RawUpstreamClient {
  readonly id: string
  fetchSince(params: FetchSinceParams): Promise<RawArtifactPage>
}

// ── Mock client (fixture-driven) ─────────────────────────────────────────

export interface MockRawUpstreamClientOptions {
  /** Pages, in the order they should be served. The mock advances
   *  through this list as the cursor advances. */
  readonly pages: readonly { readonly cursor: string | null; readonly items: readonly RawArtifactRow[] }[]
}

/** Fixture-driven client used by tests. Cursor `null` returns the
 *  first page; thereafter the caller passes back the page's
 *  `nextCursor` to advance. */
export class MockRawUpstreamClient implements RawUpstreamClient {
  readonly id = 'mock'
  private readonly pagesByCursor = new Map<string | null, { readonly items: readonly RawArtifactRow[]; readonly nextCursor: string | null }>()

  constructor(opts: MockRawUpstreamClientOptions) {
    for (let i = 0; i < opts.pages.length; i++) {
      const page = opts.pages[i]!
      const nextCursor = i + 1 < opts.pages.length ? opts.pages[i + 1]!.cursor : null
      this.pagesByCursor.set(page.cursor, { items: page.items, nextCursor })
    }
  }

  async fetchSince(params: FetchSinceParams): Promise<RawArtifactPage> {
    const page = this.pagesByCursor.get(params.cursor)
    if (!page) return { items: [], nextCursor: null }
    const items = page.items.filter((r) => r.orgId === params.orgId)
    return { items, nextCursor: page.nextCursor }
  }
}

// ── HTTP client (production) ─────────────────────────────────────────────

export interface HttpRawUpstreamClientOptions {
  readonly baseUrl: string
  readonly authToken: string | (() => Promise<string>) | (() => string)
  /** Pluggable fetch — defaults to global fetch. */
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

/**
 * Production client. Issues:
 *
 *   GET <baseUrl>/v1/raw/emails?cursor=<>&since=<>&limit=<>
 *
 * with `X-Org-Id`, `X-Acting-User-Id`, and `Authorization: Bearer <>`
 * headers. The dashboard remains read-only — this client never POSTs.
 */
export class HttpRawUpstreamClient implements RawUpstreamClient {
  readonly id = 'http'
  constructor(private readonly opts: HttpRawUpstreamClientOptions) {}

  async fetchSince(params: FetchSinceParams): Promise<RawArtifactPage> {
    const fetchImpl = this.opts.fetchImpl ?? fetch
    const url = new URL('/v1/raw/emails', this.opts.baseUrl.replace(/\/+$/, ''))
    if (params.cursor) url.searchParams.set('cursor', params.cursor)
    if (params.since)  url.searchParams.set('since', params.since)
    if (params.limit)  url.searchParams.set('limit', String(params.limit))

    const tok = typeof this.opts.authToken === 'function'
      ? await this.opts.authToken()
      : this.opts.authToken

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30000)
    try {
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        signal: ctrl.signal,
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${tok}`,
          'X-Org-Id': params.orgId as unknown as string,
          'X-Acting-User-Id': 'system',
        },
      })
      if (!res.ok) {
        throw new Error(`HttpRawUpstreamClient: ${res.status} ${res.statusText}`)
      }
      const body = await res.json() as {
        readonly items?: readonly RawArtifactRow[]
        readonly nextCursor?: string | null
      }
      return {
        items: body.items ?? [],
        nextCursor: body.nextCursor ?? null,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
