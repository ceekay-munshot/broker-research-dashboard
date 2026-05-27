// ─────────────────────────────────────────────────────────────────────────
// emailApiClient — paginated reader for GET /email/forwarded.
//
// The dashboard consumes the forwarded-email feed read-only. This client
// loads the full dataset the way the API doc prescribes:
//   1. GET /email/forwarded?page=1&limit=100
//   2. read data.totalPages (or pagination.totalPages)
//   3. fetch pages 2…min(totalPages, 25) in parallel  (safety cap: 25)
//   4. return the raw page responses — parsing, merge and dedupe are the
//      transform's job (see emailApiPagesToServerOutput).
//
// No persistence and no token minting: the bearer token is supplied by the
// caller. Signed URLs inside the payload are never logged.
// ─────────────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 100
const MAX_PAGES = 25            // documented safety cap
const REQUEST_TIMEOUT_MS = 30_000

export interface FetchForwardedEmailsOptions {
  /** Base URL of the forwarded-email backend (VITE_BACKEND_API_URL). */
  readonly baseUrl: string
  /** Bearer token for the Authorization header. */
  readonly token?: string | null
  /**
   * Target user index — REQUIRED when the bearer is a service token
   * (`isServiceToken=true`), otherwise the backend returns 400 "user could
   * not be resolved" (API doc §2.3, §3.1). Optional with a user JWT.
   * Sent as the `user_index` query param on every page request.
   */
  readonly userIndex?: number | string | null
  /** Injectable fetch — defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch
  /** Override the page cap (clamped to the 25-page safety cap). */
  readonly maxPages?: number
}

/** Read `totalPages` from either `data` or root-level `pagination`,
 *  accepting the snake_case `total_pages` alias. Defaults to 1. */
function readTotalPages(body: unknown): number {
  if (!body || typeof body !== 'object') return 1
  const obj = body as Record<string, unknown>
  const fromContainer = (c: unknown): number | null => {
    if (!c || typeof c !== 'object') return null
    const o = c as Record<string, unknown>
    const v = o.totalPages ?? o.total_pages
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  }
  return fromContainer(obj.data) ?? fromContainer(obj.pagination) ?? 1
}

async function getPage(page: number, opts: FetchForwardedEmailsOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch
  const base = opts.baseUrl.replace(/\/+$/, '')
  // `user_index` is appended only when the caller supplied one — empty / null
  // omits the param entirely so a user-JWT request stays clean.
  const userIndexParam =
    opts.userIndex === undefined || opts.userIndex === null || opts.userIndex === ''
      ? ''
      : `&user_index=${encodeURIComponent(String(opts.userIndex))}`
  const url = `${base}/email/forwarded?page=${page}&limit=${PAGE_LIMIT}${userIndexParam}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`GET /email/forwarded page ${page} failed: HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Load the full forwarded-email dataset and return the raw page responses.
 * Hand the result to `emailApiPagesToServerOutput()`, which parses every
 * documented shape, merges, dedupes by id, and sorts newest-first.
 */
export async function fetchForwardedEmailsDataset(
  opts: FetchForwardedEmailsOptions,
): Promise<unknown[]> {
  const cap = Math.max(1, Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES))
  const first = await getPage(1, opts)
  const totalPages = Math.min(readTotalPages(first), cap)
  if (totalPages <= 1) return [first]

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => getPage(i + 2, opts)),
  )
  return [first, ...rest]
}
