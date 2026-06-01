// Live daily-close history for a ticker, from the /api/stock-history Pages
// Function (Yahoo Finance behind an edge cache). Returns [] when no ticker is
// selected, in dev (the function isn't served by Vite), or on any error — the
// caller falls back to the adapter's mock closes or simply draws no price line.

import { useEffect, useState } from 'react'
import type { StockTicker } from '../domain'

export interface HistoryPoint {
  readonly date: string   // YYYY-MM-DD
  readonly close: number
}

const HISTORY_URL =
  (import.meta.env.VITE_STOCK_HISTORY_URL as string | undefined)?.trim() || '/api/stock-history'

// Session-lived cache so re-opening the same stock is instant and we don't
// re-hit the edge for every mount.
const memCache = new Map<string, readonly HistoryPoint[]>()

export function useStockHistory(ticker: StockTicker | null): readonly HistoryPoint[] {
  const key = ticker ? (ticker as unknown as string) : ''
  const [points, setPoints] = useState<readonly HistoryPoint[]>(() => memCache.get(key) ?? [])

  useEffect(() => {
    if (!key) { setPoints([]); return }
    const cached = memCache.get(key)
    if (cached) { setPoints(cached); return }

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${HISTORY_URL}?ticker=${encodeURIComponent(key)}`)
        if (!res.ok) return
        const body = (await res.json()) as { ok?: boolean; points?: readonly HistoryPoint[] }
        if (cancelled) return
        const pts = body.ok && Array.isArray(body.points) ? body.points : []
        memCache.set(key, pts)
        setPoints(pts)
      } catch {
        /* leave empty — caller falls back to mock closes / no line */
      }
    })()
    return () => { cancelled = true }
  }, [key])

  return points
}
