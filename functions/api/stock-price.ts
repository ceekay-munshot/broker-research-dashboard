// Cloudflare Pages Function: GET /api/stock-price?ticker=XXX[&fresh=1]
//
// Wraps the Munshot live-quote endpoint with an edge cache so the dashboard
// can render a CMP column without hitting upstream rate limits. The frontend
// always calls this route — never the upstream directly.
//
// Cache-Control matrix:
//   success           public, s-maxage=300, stale-while-revalidate=600
//   not_found         public, s-maxage=3600  (negative cache)
//   ambiguous_ticker  public, s-maxage=3600  (blocklist hit, upstream skipped)
//   upstream_error    no-store               (never poison the cache)
//
// `?fresh=1` skips the cache READ but still writes the result under the
// canonical key (the URL without `fresh`) so subsequent non-fresh callers
// benefit from the refresh.

import { parseStockQuote } from '../../src/lib/stockPriceParser'

const UPSTREAM_URL = 'https://fastapi.muns.io/stock-data'
const TICKER_RE = /^[A-Z0-9&-]{1,20}$/

// Tickers where the upstream returns a *different* listed company than
// broker notes typically mean by the symbol. Showing wrong CMP is worse
// than showing none, so we block before calling upstream. Expand as we
// find more (see plan: full aliasing lives in the resolver layer, not here).
const AMBIGUOUS_TICKERS = new Set<string>(['PNC'])

const SUCCESS_CACHE = 'public, s-maxage=300, stale-while-revalidate=600'
const NEGATIVE_CACHE = 'public, s-maxage=3600'
const NO_CACHE = 'no-store'

// `caches.default` is the Workers Cache API; standard lib types don't know
// about it, so cast once at the module boundary. (We deliberately don't pull
// in @cloudflare/workers-types — see functions/tsconfig.json.)
const edgeCache = (caches as unknown as { default: Cache }).default

type SuccessPayload = {
  readonly ok: true
  readonly ticker: string
  readonly currentPrice: number
  readonly previousClose: number | null
  readonly currency: 'INR'
  readonly fetchedAt: string
}

type FailurePayload = {
  readonly ok: false
  readonly ticker: string
  readonly reason: 'not_found' | 'ambiguous_ticker' | 'upstream_error'
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const { request } = context
  const url = new URL(request.url)
  const rawTicker = url.searchParams.get('ticker') ?? ''
  const ticker = rawTicker.toUpperCase()
  const fresh = url.searchParams.get('fresh') === '1'

  if (!TICKER_RE.test(ticker)) {
    return jsonResponse(
      { ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload,
      { status: 400, cacheControl: NO_CACHE },
    )
  }

  // Canonical cache key: same URL, minus any `fresh` flag so a refreshed
  // fetch warms the entry future non-fresh callers will read.
  const canonical = new URL(request.url)
  canonical.searchParams.delete('fresh')
  // Drop any other non-canonical query params we might add later.
  const cacheKey = new Request(canonical.toString(), { method: 'GET' })

  // Ambiguous-ticker guard — never call upstream for these.
  if (AMBIGUOUS_TICKERS.has(ticker)) {
    const payload: FailurePayload = { ok: false, ticker, reason: 'ambiguous_ticker' }
    const response = jsonResponse(payload, { status: 200, cacheControl: NEGATIVE_CACHE })
    await safeCachePut(cacheKey, response)
    return response
  }

  if (!fresh) {
    const cached = await safeCacheMatch(cacheKey)
    if (cached) return cached
  }

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ticker_symbol: ticker,
        type: 'stockquote',
        country: 'india',
      }),
    })
  } catch {
    return jsonResponse(
      { ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload,
      { status: 502, cacheControl: NO_CACHE },
    )
  }

  if (upstream.status === 404) {
    const payload: FailurePayload = { ok: false, ticker, reason: 'not_found' }
    const response = jsonResponse(payload, { status: 200, cacheControl: NEGATIVE_CACHE })
    await safeCachePut(cacheKey, response)
    return response
  }

  if (!upstream.ok) {
    return jsonResponse(
      { ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload,
      { status: 502, cacheControl: NO_CACHE },
    )
  }

  // Upstream body is a JSON string (a single quoted comma-separated list).
  let bodyText: string
  try {
    bodyText = await upstream.text()
  } catch {
    return jsonResponse(
      { ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload,
      { status: 502, cacheControl: NO_CACHE },
    )
  }

  // The body may be either a raw quoted string or JSON-encoded — try to
  // unwrap JSON first, then fall through to the parser, which handles
  // wrapping quotes too.
  let unwrapped: unknown = bodyText
  try {
    unwrapped = JSON.parse(bodyText)
  } catch {
    /* leave as-is */
  }

  const quote = parseStockQuote(unwrapped)
  if (quote === null) {
    return jsonResponse(
      { ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload,
      { status: 502, cacheControl: NO_CACHE },
    )
  }

  const payload: SuccessPayload = {
    ok: true,
    ticker,
    currentPrice: quote.currentPrice,
    previousClose: quote.previousClose,
    currency: 'INR',
    fetchedAt: new Date().toISOString(),
  }
  const response = jsonResponse(payload, { status: 200, cacheControl: SUCCESS_CACHE })
  await safeCachePut(cacheKey, response)
  return response
}

function jsonResponse(
  payload: SuccessPayload | FailurePayload,
  init: { status: number; cacheControl: string },
): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl,
    },
  })
}

async function safeCacheMatch(key: Request): Promise<Response | undefined> {
  try {
    return await edgeCache.match(key)
  } catch {
    return undefined
  }
}

async function safeCachePut(key: Request, response: Response): Promise<void> {
  try {
    // Body is a one-shot stream; clone before handing to the cache so the
    // outgoing response still has its body intact.
    await edgeCache.put(key, response.clone())
  } catch {
    /* edge cache write failures are non-fatal */
  }
}
