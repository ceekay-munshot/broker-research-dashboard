// Calls-over-time chart for the stock drawer. X = date, Y = price. Each broker
// call is a dot at (date it was made, its target price), coloured by the call
// (Buy/Hold/Sell). The stock's actual price is drawn as a line so you can see,
// at a glance, what each broker called and where the stock actually went — the
// vertical gap between a dot and the line is the upside that broker saw.
//
// A broker selector below the chart filters the dots to specific houses; with a
// broker picked, its calls are joined by a line so you can read its target
// trajectory (the raises and cuts) straight off the chart.
//
// Price line comes from daily closes (seeded in mock; populates in live once
// the server exposes price history). When there's no history we fall back to a
// single current-price (CMP) reference line. Calls always render.

import { useState } from 'react'
import type { ReportId, StockTicker } from '../domain'
import type { StockCall } from '../viewModels/stockStreetView'
import { useDailyCloses } from '../hooks/useDailyCloses'
import { useStockPrices } from '../hooks/useStockPrices'
import { formatPrice } from '../viewModels/shared'

type CallTone = 'buy' | 'hold' | 'sell' | 'none'
function callTone(rating: string | null): CallTone {
  if (rating === 'Buy' || rating === 'Overweight') return 'buy'
  if (rating === 'Hold') return 'hold'
  if (rating === 'Sell' || rating === 'Underweight') return 'sell'
  return 'none'
}
const TONE_FILL: Record<CallTone, string> = {
  buy: 'fill-emerald-400', hold: 'fill-slate-300', sell: 'fill-rose-400', none: 'fill-slate-500',
}
const TONE_DOT: Record<CallTone, string> = {
  buy: 'bg-emerald-400', hold: 'bg-slate-300', sell: 'bg-rose-400', none: 'bg-slate-500',
}

const W = 580, H = 250
const PAD = { top: 14, right: 52, bottom: 26, left: 52 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`
}

export default function StreetCallsChart({ calls, ticker, currency, onSelectReport }: {
  calls: readonly StockCall[]
  ticker: StockTicker
  currency: string | null
  onSelectReport: (id: ReportId) => void
}) {
  const { data: closesData } = useDailyCloses(ticker)
  const { prices } = useStockPrices([ticker as unknown as string])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const points = calls.filter((c) => c.targetPrice !== null)
  const closes = closesData ?? []
  const cell = prices.get(ticker as unknown as string)
  const liveCmp = cell && cell.status === 'success' ? cell.price : null
  const cmp = closes.length > 0 ? closes[closes.length - 1]!.close : liveCmp

  if (points.length === 0) {
    return <div className="text-[12px] text-slate-500 px-1 py-6 text-center">No price targets to chart on this name yet.</div>
  }

  // Brokers covering the stock (for the selector), de-duped and name-sorted.
  const brokerMap = new Map<string, { id: string; name: string; color: string | null }>()
  for (const c of points) {
    const id = c.brokerId as unknown as string
    if (!brokerMap.has(id)) brokerMap.set(id, { id, name: c.brokerShortName, color: c.brokerColor })
  }
  const brokers = [...brokerMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  const filtering = selected.size > 0
  const shown = filtering ? points.filter((c) => selected.has(c.brokerId as unknown as string)) : points
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Scales (always from the full set, so filtering never rescales) ───────
  const times = [...points.map((c) => Date.parse(c.publishedAt)), ...closes.map((p) => Date.parse(p.date))]
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const tSpan = Math.max(1, tMax - tMin)
  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * PLOT_W

  const allPrices = [
    ...points.map((c) => c.targetPrice as number),
    ...closes.map((p) => p.close),
    ...(cmp != null ? [cmp] : []),
  ]
  let pMin = Math.min(...allPrices)
  let pMax = Math.max(...allPrices)
  const padP = (pMax - pMin) * 0.1 || pMax * 0.05 || 1
  pMin -= padP; pMax += padP
  const pSpan = Math.max(1, pMax - pMin)
  const y = (p: number) => PAD.top + (1 - (p - pMin) / pSpan) * PLOT_H

  const yTicks = Array.from({ length: 4 }, (_, i) => pMin + (pSpan * (i + 0.5)) / 4)
  const xTicks = Array.from({ length: 4 }, (_, i) => tMin + (tSpan * i) / 3)
  const pricePath = closes.length >= 2
    ? closes.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(Date.parse(p.date)).toFixed(1)} ${y(p.close).toFixed(1)}`).join(' ')
    : null

  // One target-trajectory line per selected broker (their raises/cuts over time).
  const trails = filtering
    ? [...selected].map((id) => {
        const pts = points
          .filter((c) => (c.brokerId as unknown as string) === id)
          .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
        if (pts.length < 2) return null
        const d = pts.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(Date.parse(c.publishedAt)).toFixed(1)} ${y(c.targetPrice as number).toFixed(1)}`).join(' ')
        return { id, d, color: brokerMap.get(id)?.color ?? '#94a3b8' }
      }).filter((t): t is { id: string; d: string; color: string } => t !== null)
    : []

  const hovered = hoveredId ? shown.find((c) => (c.reportId as unknown as string) === hoveredId) ?? null : null

  return (
    <div className="flex flex-col gap-2.5">
      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-slate-400">
        <LegendDot cls={TONE_DOT.buy} label="Buy / Overweight"/>
        <LegendDot cls={TONE_DOT.hold} label="Hold"/>
        <LegendDot cls={TONE_DOT.sell} label="Sell / Underweight"/>
        {pricePath && (
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-slate-400 rounded"/>Price</span>
        )}
        {cmp != null && (
          <span className="inline-flex items-center gap-1.5 text-amber-300"><span className="inline-block w-4 border-t border-dashed border-amber-400"/>CMP {formatPrice(cmp, currency, 0)}</span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Broker calls over time vs the stock price">
        {yTicks.map((p, i) => (
          <g key={`y${i}`}>
            <line x1={PAD.left} y1={y(p)} x2={W - PAD.right} y2={y(p)} className="stroke-line/10" strokeWidth={1}/>
            <text x={PAD.left - 6} y={y(p) + 3} textAnchor="end" className="fill-slate-500" fontSize={9}>{formatPrice(p, currency, 0)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={`x${i}`} x={x(t)} y={H - PAD.bottom + 15} textAnchor="middle" className="fill-slate-500" fontSize={9}>{fmtDate(t)}</text>
        ))}

        {pricePath && <path d={pricePath} fill="none" className="stroke-slate-400/70" strokeWidth={1.5} strokeLinejoin="round"/>}

        {cmp != null && (
          <line x1={PAD.left} y1={y(cmp)} x2={W - PAD.right} y2={y(cmp)} className="stroke-amber-400/70" strokeWidth={1} strokeDasharray="3 3"/>
        )}

        {/* selected brokers' target trajectories */}
        {trails.map((t) => (
          <path key={t.id} d={t.d} fill="none" stroke={t.color} strokeWidth={1.5} strokeOpacity={0.5} strokeLinejoin="round"/>
        ))}

        {/* one dot per shown call */}
        {shown.map((c) => {
          const cx = x(Date.parse(c.publishedAt))
          const cy = y(c.targetPrice as number)
          const id = c.reportId as unknown as string
          const active = hoveredId === id
          return (
            <circle
              key={id}
              cx={cx} cy={cy} r={active ? 6 : 4.5}
              className={`${TONE_FILL[callTone(c.rating)]} stroke-ink-900 cursor-pointer`}
              strokeWidth={1.5}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId((h) => (h === id ? null : h))}
              onClick={() => onSelectReport(c.reportId)}
            />
          )
        })}

        {/* hover tooltip (in-SVG so it scales with the chart) */}
        {hovered && (() => {
          const cx = x(Date.parse(hovered.publishedAt))
          const cy = y(hovered.targetPrice as number)
          const tw = 138, th = 46
          const tx = clamp(cx - tw / 2, 2, W - tw - 2)
          const ty = cy - th - 9 < 0 ? cy + 10 : cy - th - 9
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={th} rx={4} className="fill-slate-900 stroke-line/20" strokeWidth={1}/>
              <text x={tx + 9} y={ty + 16} className="fill-slate-100" fontSize={10.5} fontWeight={600}>{hovered.brokerShortName}</text>
              <text x={tx + 9} y={ty + 29} fontSize={10}>
                <tspan className={TONE_FILL[callTone(hovered.rating)]} fontWeight={600}>{hovered.rating ?? '—'}</tspan>
                <tspan className="fill-slate-300"> · target {formatPrice(hovered.targetPrice, hovered.targetCurrency ?? currency, 0)}</tspan>
              </text>
              <text x={tx + 9} y={ty + 41} className="fill-slate-500" fontSize={9}>{fmtDate(Date.parse(hovered.publishedAt))}</text>
            </g>
          )
        })()}
      </svg>

      {/* broker selector — filter the dots to specific houses */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9.5px] text-slate-500 uppercase tracking-widest mr-0.5">Broker</span>
        {brokers.map((b) => {
          const on = selected.has(b.id)
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`chip border text-[10.5px] transition-colors ${
                on
                  ? 'border-accent/50 text-accent bg-accent/10'
                  : filtering
                    ? 'border-line/10 text-slate-500 hover:text-slate-300'
                    : 'border-line/10 text-slate-300 hover:border-line/25'
              }`}
            >
              {b.name}
            </button>
          )
        })}
        {filtering && (
          <button onClick={() => setSelected(new Set())} className="text-[10.5px] text-slate-500 hover:text-slate-300 ml-0.5">
            Show all
          </button>
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
