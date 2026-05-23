// Live CMP (current market price) fetch hook for the By Stock table.
//
// Two-tier cache:
//   - module-scoped in-memory Map (survives remounts within the tab)
//   - sessionStorage mirror keyed `cmp:v1:<ticker>` (warms on next mount)
//
// The actual cross-visitor cache is handled at the edge by the Pages
// Function in `functions/api/stock-price.ts`; this hook just keeps the
// browser from re-fetching identical work inside one session.
//
// Sustainability guarantees:
//   - Per-ticker in-flight dedupe (no duplicate concurrent fetches).
//   - Concurrency cap of 5 (a customer with 80 tickers does not cold-hit
//     the edge/upstream all at once).
//   - 3-minute client TTL (slightly tighter than the 5-min edge TTL so a
//     refresh that misses the client cache usually still hits a warm edge).
//   - `refetch()` clears both client tiers and forwards `?fresh=1` to skip
//     the edge cache READ too — but the edge still WRITES under the
//     canonical key, so subsequent non-fresh callers benefit.
//
// `upstream_error` outcomes are deliberately NOT mirrored to
// sessionStorage; they're transient and should get a clean retry on the
// next page load. `success` / `not_found` / `ambiguous_ticker` are
// terminal and worth persisting for the session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type PriceCell =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly price: number; readonly fetchedAt: number }
  | {
      readonly status: 'unavailable'
      readonly reason: 'not_found' | 'ambiguous_ticker' | 'upstream_error'
    }

export interface UseStockPricesResult {
  readonly prices: ReadonlyMap<string, PriceCell>
  readonly refetch: () => void
  readonly lastFetchedAt: Date | null
}

const CLIENT_TTL_MS = 3 * 60 * 1000
const CONCURRENCY = 5
const SESSION_KEY_PREFIX = 'cmp:v1:'

const STOCK_URL: string = (() => {
  const override = (import.meta.env.VITE_STOCK_PRICE_URL as string | undefined)?.trim()
  return override !== undefined && override !== '' ? override : '/api/stock-price'
})()

interface CacheEntry {
  readonly cell: PriceCell
  readonly expiresAt: number
}

// Module-scoped — shared across every hook instance and mount in the tab.
const memCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<PriceCell>>()

export function useStockPrices(rawTickers: readonly string[]): UseStockPricesResult {
  // Deduplicate + sort once so the fingerprint is stable across renders
  // where the upstream array identity churns but the contents are the
  // same. The fingerprint — not the array — gates the effect.
  const tickers = useMemo(
    () => [...new Set(rawTickers.filter((t) => t !== ''))].sort(),
    [rawTickers],
  )
  const fingerprint = tickers.join('|')

  const [prices, setPrices] = useState<ReadonlyMap<string, PriceCell>>(() => readSessionWarmup(tickers))
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  // Bump to force a refetch cycle (refetch() doesn't change `fingerprint`).
  const [refreshNonce, setRefreshNonce] = useState(0)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (tickers.length === 0) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const now = Date.now()
    const fresh = refreshNonce > 0

    // Seed display state from in-memory cache; mark unknowns as loading.
    setPrices((prev) => {
      const next = new Map(prev)
      for (const t of tickers) {
        const hit = !fresh ? memCache.get(t) : undefined
        if (hit && hit.expiresAt > now) {
          next.set(t, hit.cell)
        } else if (next.get(t)?.status !== 'success') {
          // Keep the prior success visible during refetch to avoid flashing
          // skeletons; only fall back to loading when we have nothing.
          if (!next.has(t)) next.set(t, { status: 'loading' })
        }
      }
      return next
    })

    const tickersToFetch = tickers.filter((t) => {
      if (fresh) return true
      const hit = memCache.get(t)
      return !hit || hit.expiresAt <= now
    })

    if (tickersToFetch.length === 0) {
      setLastFetchedAt(new Date())
      return
    }

    const apply = (ticker: string, cell: PriceCell): void => {
      if (ac.signal.aborted) return
      setPrices((prev) => new Map(prev).set(ticker, cell))
    }

    void runPool(tickersToFetch, CONCURRENCY, async (ticker) => {
      try {
        const cell = await fetchOne(ticker, { fresh, signal: ac.signal })
        memCache.set(ticker, { cell, expiresAt: Date.now() + CLIENT_TTL_MS })
        writeSession(ticker, cell)
        apply(ticker, cell)
      } catch (err) {
        if (ac.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error(`[useStockPrices] unexpected error for ${ticker}`, err)
        const cell: PriceCell = { status: 'unavailable', reason: 'upstream_error' }
        memCache.set(ticker, { cell, expiresAt: Date.now() + CLIENT_TTL_MS })
        apply(ticker, cell)
      }
    }).then(() => {
      if (!ac.signal.aborted) setLastFetchedAt(new Date())
    })

    return () => { ac.abort() }
    // `tickers` is derived from `fingerprint`; depending on the string keeps
    // the effect stable across array-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, refreshNonce])

  const refetch = useCallback(() => {
    // Clear both client tiers for the currently displayed tickers (not all
    // keys — we don't want to nuke unrelated tabs' work).
    for (const t of tickers) {
      memCache.delete(t)
      clearSession(t)
    }
    setRefreshNonce((n) => n + 1)
  }, [tickers])

  return { prices, refetch, lastFetchedAt }
}

async function fetchOne(
  ticker: string,
  opts: { fresh: boolean; signal: AbortSignal },
): Promise<PriceCell> {
  // Per-ticker in-flight dedupe. Two concurrent callers asking for the same
  // symbol share the same network round-trip. We don't share across fresh /
  // non-fresh because their cache semantics differ.
  const flightKey = opts.fresh ? `fresh:${ticker}` : ticker
  const existing = inFlight.get(flightKey)
  if (existing) return existing

  const promise = (async (): Promise<PriceCell> => {
    const url = new URL(STOCK_URL, window.location.origin)
    url.searchParams.set('ticker', ticker)
    if (opts.fresh) url.searchParams.set('fresh', '1')

    const res = await fetch(url.toString(), { signal: opts.signal })
    if (!res.ok) {
      // The Pages Function returns 200 for not_found/ambiguous; anything
      // non-OK here is a transport-level issue.
      return { status: 'unavailable', reason: 'upstream_error' }
    }

    const body = (await res.json()) as ApiResponse
    if (body.ok) {
      return { status: 'success', price: body.currentPrice, fetchedAt: Date.now() }
    }
    return { status: 'unavailable', reason: body.reason }
  })().finally(() => {
    inFlight.delete(flightKey)
  })

  inFlight.set(flightKey, promise)
  return promise
}

type ApiResponse =
  | {
      readonly ok: true
      readonly ticker: string
      readonly currentPrice: number
      readonly previousClose: number | null
      readonly currency: 'INR'
      readonly fetchedAt: string
    }
  | {
      readonly ok: false
      readonly ticker: string
      readonly reason: 'not_found' | 'ambiguous_ticker' | 'upstream_error'
    }

// ── sessionStorage mirror ──────────────────────────────────────────────────

interface SessionEntry {
  readonly cell: PriceCell
  readonly expiresAt: number
}

function readSessionWarmup(tickers: readonly string[]): Map<string, PriceCell> {
  const out = new Map<string, PriceCell>()
  if (typeof sessionStorage === 'undefined') return out
  const now = Date.now()
  for (const t of tickers) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + t)
      if (raw === null) continue
      const parsed = JSON.parse(raw) as SessionEntry
      if (typeof parsed?.expiresAt !== 'number' || parsed.expiresAt <= now) continue
      out.set(t, parsed.cell)
      // Also seed the in-memory cache so the effect doesn't queue a fetch.
      memCache.set(t, { cell: parsed.cell, expiresAt: parsed.expiresAt })
    } catch {
      /* ignore */
    }
  }
  return out
}

function writeSession(ticker: string, cell: PriceCell): void {
  if (typeof sessionStorage === 'undefined') return
  // Skip upstream_error — it's transient and should get a fresh chance on
  // the next page load.
  if (cell.status === 'unavailable' && cell.reason === 'upstream_error') return
  try {
    const entry: SessionEntry = { cell, expiresAt: Date.now() + CLIENT_TTL_MS }
    sessionStorage.setItem(SESSION_KEY_PREFIX + ticker, JSON.stringify(entry))
  } catch {
    /* quota / private mode — ignore */
  }
}

function clearSession(ticker: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(SESSION_KEY_PREFIX + ticker)
  } catch {
    /* ignore */
  }
}

// ── Concurrency pool ───────────────────────────────────────────────────────

async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      await worker(item)
    }
  })
  await Promise.all(workers)
}
