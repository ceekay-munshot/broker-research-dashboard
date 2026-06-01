// Calls-over-time chart for the stock drawer, built on lightweight-charts.
//
// lightweight-charts draws the price line, the time/price axes and the hover
// crosshair (so moving the mouse reads the price off the line natively). On
// top of it we sync an SVG overlay of the broker calls: a dot at (date a call
// was made, its target price), coloured by the call — Buy/Hold/Sell. The gap
// between a dot and the price line is the upside that broker saw.
//
// A broker selector below filters the dots; with brokers picked, each one's
// calls are joined by a line in its brand colour so the target trajectory (the
// raises and cuts) reads straight off the chart.
//
// Price history comes from /api/stock-history (live) or the adapter's mock
// closes (dev). Dots always render; the price line appears once there's data.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart, LineSeries, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type IPriceLine, type Time,
} from 'lightweight-charts'
import type { ReportId, StockTicker } from '../domain'
import type { StockCall } from '../viewModels/stockStreetView'
import { useDailyCloses } from '../hooks/useDailyCloses'
import { useStockHistory } from '../hooks/useStockHistory'
import { formatPrice } from '../viewModels/shared'

type CallTone = 'buy' | 'hold' | 'sell' | 'none'
function callTone(rating: string | null): CallTone {
  if (rating === 'Buy' || rating === 'Overweight') return 'buy'
  if (rating === 'Hold') return 'hold'
  if (rating === 'Sell' || rating === 'Underweight') return 'sell'
  return 'none'
}
const TONE_HEX: Record<CallTone, string> = { buy: '#34d399', hold: '#cbd5e1', sell: '#fb7185', none: '#64748b' }
const TONE_DOT: Record<CallTone, string> = { buy: 'bg-emerald-400', hold: 'bg-slate-300', sell: 'bg-rose-400', none: 'bg-slate-500' }

const HEIGHT = 248

interface DotCoord { readonly id: string; readonly call: StockCall; readonly x: number; readonly y: number; readonly color: string }
interface Trail { readonly id: string; readonly d: string; readonly color: string }

export default function StreetCallsChart({ calls, ticker, currency, onSelectReport }: {
  calls: readonly StockCall[]
  ticker: StockTicker
  currency: string | null
  onSelectReport: (id: ReportId) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const cmpLineRef = useRef<IPriceLine | null>(null)
  const recomputeRef = useRef<() => void>(() => {})

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [coords, setCoords] = useState<readonly DotCoord[]>([])
  const [trails, setTrails] = useState<readonly Trail[]>([])
  const [size, setSize] = useState({ w: 0, h: HEIGHT })

  const mockCloses = useDailyCloses(ticker).data ?? []
  const apiHistory = useStockHistory(ticker)
  // Prefer live history; fall back to mock seeded closes (dev). De-dupe + sort.
  const closes = useMemo(() => {
    const src = apiHistory.length > 0 ? apiHistory : mockCloses.map((c) => ({ date: c.date, close: c.close }))
    const m = new Map<string, number>()
    for (const c of src) m.set(c.date, c.close)
    return [...m.entries()].map(([date, close]) => ({ date, close })).sort((a, b) => a.date.localeCompare(b.date))
  }, [apiHistory, mockCloses])
  const closesKey = `${closes.length}:${closes[0]?.date ?? ''}:${closes[closes.length - 1]?.date ?? ''}`
  const cmp = closes.length ? closes[closes.length - 1]!.close : null

  const points = useMemo(() => calls.filter((c) => c.targetPrice !== null), [calls])
  const brokers = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>()
    for (const c of points) {
      const id = c.brokerId as unknown as string
      if (!m.has(id)) m.set(id, { id, name: c.brokerShortName, color: c.brokerColor })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [points])

  const filtering = selected.size > 0
  const shown = filtering ? points.filter((c) => selected.has(c.brokerId as unknown as string)) : points
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Snap a call's date to the nearest trading day in `closes`, so its
  // x-coordinate always lands on a real point on the time scale.
  const snap = useMemo(() => {
    const times = closes.map((c) => Date.parse(c.date))
    return (iso: string): string | null => {
      if (closes.length === 0) return null
      const t = Date.parse(iso)
      let best = 0, bd = Infinity
      for (let i = 0; i < times.length; i++) { const d = Math.abs(times[i]! - t); if (d < bd) { bd = d; best = i } }
      return closes[best]!.date
    }
  }, [closesKey])

  // Latest recompute closure (chart events call this through the ref).
  recomputeRef.current = () => {
    const chart = chartRef.current, series = seriesRef.current
    if (!chart || !series || closes.length === 0) { setCoords([]); setTrails([]); return }
    const ts = chart.timeScale()
    const at = (iso: string, price: number): { x: number; y: number } | null => {
      const sd = snap(iso); if (sd === null) return null
      const x = ts.timeToCoordinate(sd as Time)
      const y = series.priceToCoordinate(price)
      return x != null && y != null ? { x, y } : null
    }
    const next: DotCoord[] = []
    for (const c of shown) {
      const xy = at(c.publishedAt, c.targetPrice as number)
      if (xy) next.push({ id: c.reportId as unknown as string, call: c, x: xy.x, y: xy.y, color: TONE_HEX[callTone(c.rating)] })
    }
    setCoords(next)
    if (filtering) {
      const tr: Trail[] = []
      for (const id of selected) {
        const xs = points
          .filter((c) => (c.brokerId as unknown as string) === id)
          .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
          .map((c) => at(c.publishedAt, c.targetPrice as number))
          .filter((q): q is { x: number; y: number } => q !== null)
        if (xs.length < 2) continue
        const broker = brokers.find((b) => b.id === id)
        tr.push({ id, d: xs.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' '), color: broker?.color ?? '#94a3b8' })
      }
      setTrails(tr)
    } else setTrails([])
  }

  // Create the chart once.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const chart = createChart(el, {
      width: el.clientWidth,
      height: HEIGHT,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,184,0.08)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: 'rgba(148,163,184,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(148,163,184,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1e293b' },
      },
    })
    const series = chart.addSeries(LineSeries, {
      color: '#cbd5e1', lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      chart.applyOptions({ width: w })
      setSize({ w, h: HEIGHT })
      recomputeRef.current()
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: HEIGHT })
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => recomputeRef.current())

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [])

  // Feed price data + CMP reference line when the closes change.
  useEffect(() => {
    const series = seriesRef.current, chart = chartRef.current
    if (!series || !chart) return
    series.setData(closes.map((c) => ({ time: c.date as Time, value: c.close })))
    if (cmpLineRef.current) { series.removePriceLine(cmpLineRef.current); cmpLineRef.current = null }
    if (cmp != null) {
      cmpLineRef.current = series.createPriceLine({
        price: cmp, color: '#fbbf24', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'CMP',
      })
    }
    chart.timeScale().fitContent()
    recomputeRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closesKey])

  // Recompute the overlay when the filter or call set changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recomputeRef.current() }, [selected, points, closesKey, size.w])

  const hovered = hoveredId ? coords.find((c) => c.id === hoveredId) ?? null : null

  return (
    <div className="flex flex-col gap-2.5">
      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-slate-400">
        <LegendDot cls={TONE_DOT.buy} label="Buy / Overweight"/>
        <LegendDot cls={TONE_DOT.hold} label="Hold"/>
        <LegendDot cls={TONE_DOT.sell} label="Sell / Underweight"/>
        {closes.length > 1 && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-slate-300 rounded"/>Price</span>}
        {cmp != null && <span className="inline-flex items-center gap-1.5 text-amber-300"><span className="inline-block w-4 border-t border-dashed border-amber-400"/>CMP {formatPrice(cmp, currency, 0)}</span>}
        {closes.length === 0 && <span className="text-slate-500">· price history loads in live</span>}
      </div>

      {/* chart + call overlay */}
      <div ref={boxRef} className="relative w-full" style={{ height: HEIGHT }}>
        <svg className="absolute inset-0 pointer-events-none" width={size.w || undefined} height={size.h}>
          {trails.map((t) => (
            <path key={t.id} d={t.d} fill="none" stroke={t.color} strokeWidth={1.5} strokeOpacity={0.5} strokeLinejoin="round"/>
          ))}
          {coords.map((c) => (
            <circle
              key={c.id}
              cx={c.x} cy={c.y} r={hoveredId === c.id ? 6 : 4.5}
              fill={c.color} stroke="#0b0f16" strokeWidth={1.5}
              className="cursor-pointer"
              style={{ pointerEvents: 'auto' }}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
              onClick={() => onSelectReport(c.call.reportId)}
            />
          ))}
          {hovered && (() => {
            const tw = 138, th = 46
            const tx = Math.max(2, Math.min((size.w || tw) - tw - 2, hovered.x - tw / 2))
            const ty = hovered.y - th - 9 < 0 ? hovered.y + 10 : hovered.y - th - 9
            const c = hovered.call
            return (
              <g pointerEvents="none">
                <rect x={tx} y={ty} width={tw} height={th} rx={4} fill="#0f172a" stroke="rgba(148,163,184,0.25)" strokeWidth={1}/>
                <text x={tx + 9} y={ty + 16} fill="#f1f5f9" fontSize={10.5} fontWeight={600}>{c.brokerShortName}</text>
                <text x={tx + 9} y={ty + 29} fontSize={10}>
                  <tspan fill={hovered.color} fontWeight={600}>{c.rating ?? '—'}</tspan>
                  <tspan fill="#cbd5e1"> · target {formatPrice(c.targetPrice, c.targetCurrency ?? currency, 0)}</tspan>
                </text>
                <text x={tx + 9} y={ty + 41} fill="#64748b" fontSize={9}>{c.publishedAt.slice(0, 10)}</text>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* broker selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9.5px] text-slate-500 uppercase tracking-widest mr-0.5">Broker</span>
        {brokers.map((b) => {
          const on = selected.has(b.id)
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`chip border text-[10.5px] transition-colors ${
                on ? 'border-accent/50 text-accent bg-accent/10'
                : filtering ? 'border-line/10 text-slate-500 hover:text-slate-300'
                : 'border-line/10 text-slate-300 hover:border-line/25'
              }`}
            >
              {b.name}
            </button>
          )
        })}
        {filtering && (
          <button onClick={() => setSelected(new Set())} className="text-[10.5px] text-slate-500 hover:text-slate-300 ml-0.5">Show all</button>
        )}
      </div>
    </div>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${cls}`}/>
      {label}
    </span>
  )
}
