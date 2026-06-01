// Cloudflare Pages Function: GET /api/stock-history?ticker=XXX[&fresh=1]
//
// Daily closes for a ticker, for the stock drawer's calls-over-time chart.
// Wraps the free Yahoo Finance chart API behind an edge cache so the browser
// never hits the upstream directly and we stay well under any rate limit.
//
// Interim source: this is an unofficial public API. The upstream call is the
// only thing to change if/when the backend (fastapi.muns.io) exposes a
// first-party history endpoint — swap `fetchYahoo` for that and keep the rest.
//
// Cache-Control:
//   success         public, s-maxage=1800, stale-while-revalidate=86400
//   not_found       public, s-maxage=3600  (negative cache)
//   upstream_error  no-store               (never poison the cache)

const TICKER_RE = /^[A-Z0-9&-]{1,20}$/
const SUCCESS_CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400'
const NEGATIVE_CACHE = 'public, s-maxage=3600'
const NO_CACHE = 'no-store'

const edgeCache = (caches as unknown as { default: Cache }).default

interface HistoryPoint { readonly date: string; readonly close: number }
type SuccessPayload = {
  readonly ok: true
  readonly ticker: string
  readonly currency: string
  readonly points: readonly HistoryPoint[]
}
type FailurePayload = {
  readonly ok: false
  readonly ticker: string
  readonly reason: 'not_found' | 'upstream_error'
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const { request } = context
  const url = new URL(request.url)
  const ticker = (url.searchParams.get('ticker') ?? '').toUpperCase()
  const fresh = url.searchParams.get('fresh') === '1'

  if (!TICKER_RE.test(ticker)) {
    return json({ ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload, 400, NO_CACHE)
  }

  const canonical = new URL(request.url)
  canonical.searchParams.delete('fresh')
  const cacheKey = new Request(canonical.toString(), { method: 'GET' })

  if (!fresh) {
    const hit = await safeMatch(cacheKey)
    if (hit) return hit
  }

  // NSE first, then BSE — broker notes use NSE symbols, but a few names only
  // list (or quote more reliably) on BSE.
  let result = await fetchYahoo(`${ticker}.NS`)
  if (result === null || result.points.length === 0) {
    const bo = await fetchYahoo(`${ticker}.BO`)
    if (bo !== null && bo.points.length > 0) result = bo
  }

  if (result === null) {
    return json({ ok: false, ticker, reason: 'upstream_error' } satisfies FailurePayload, 502, NO_CACHE)
  }
  if (result.points.length === 0) {
    const payload: FailurePayload = { ok: false, ticker, reason: 'not_found' }
    const resp = json(payload, 200, NEGATIVE_CACHE)
    await safePut(cacheKey, resp)
    return resp
  }

  const payload: SuccessPayload = { ok: true, ticker, currency: result.currency, points: result.points }
  const resp = json(payload, 200, SUCCESS_CACHE)
  await safePut(cacheKey, resp)
  return resp
}

/** Fetch + parse Yahoo's chart API. Returns null on any network/parse error,
 *  or `{ currency, points }` (points may be empty for an unknown symbol). */
async function fetchYahoo(symbol: string): Promise<{ currency: string; points: HistoryPoint[] } | null> {
  let res: Response
  try {
    res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
      { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } },
    )
  } catch {
    return null
  }
  if (res.status === 404) return { currency: 'INR', points: [] }
  if (!res.ok) return null

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return null
  }

  const result = (body as { chart?: { result?: unknown[] } } | null)?.chart?.result?.[0] as
    | {
        meta?: { currency?: string }
        timestamp?: number[]
        indicators?: { quote?: { close?: (number | null)[] }[] }
      }
    | undefined
  if (!result) return null

  const ts = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points: HistoryPoint[] = []
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i]
    if (typeof c !== 'number' || !Number.isFinite(c)) continue
    points.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), close: Math.round(c * 100) / 100 })
  }
  return { currency: result.meta?.currency ?? 'INR', points }
}

function json(payload: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl },
  })
}

async function safeMatch(key: Request): Promise<Response | null> {
  try { return (await edgeCache.match(key)) ?? null } catch { return null }
}
async function safePut(key: Request, resp: Response): Promise<void> {
  try { await edgeCache.put(key, resp.clone()) } catch { /* cache write best-effort */ }
}
