// The Hit Rate drill-down chart: a stock's price line with an analyst's past
// calls plotted on top. Pure SVG + Tailwind (the repo ships no chart library),
// matching the Sparkline / timeline aesthetic.
//
// Encoding — shape says what they called, colour says whether it worked:
//   ▲ bullish call   ▼ bearish call   • no-view (Hold)
//   green = played out   red = didn't   grey = too small / no bet   hollow = too recent
//
// Price history here is the built-in sample series (the live feed has none
// yet), so the chart is captioned accordingly; markers still come from real
// calls. When closes are empty it renders the "awaiting live price feed" state.

import type { DailyPricePoint } from '../../domain'
import type { CallMarker } from '../../viewModels/hitRate'
import { TONE_HEX } from '../../lib/semanticColor'
import { formatPrice, formatShortDate } from '../../viewModels/shared'

interface Props {
  readonly ticker: string
  readonly stockName: string | null
  readonly closes: readonly DailyPricePoint[]
  readonly markers: readonly CallMarker[]
  readonly loading: boolean
  readonly currency: string
  /** Price series is the built-in sample (not a live feed). Default true. */
  readonly isSample?: boolean
}

const W = 720
const H = 240
const PAD_L = 6
const PAD_R = 6
const PAD_T = 14
const PAD_B = 22

const OUTCOME_HEX: Record<CallMarker['outcome'], string> = {
  correct: TONE_HEX.positive,
  wrong:   TONE_HEX.negative,
  neutral: TONE_HEX.neutral,
  pending: TONE_HEX.neutral,
  no_price: TONE_HEX.neutral,
}

export default function PriceCallsChart({ ticker, closes, markers, loading, currency, isSample = true }: Props) {
  if (loading) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[12px] text-slate-500 animate-pulse">
        Loading price history…
      </div>
    )
  }

  if (closes.length === 0) {
    return (
      <div className="rounded border border-dashed border-line/10 bg-line/[0.01] px-4 py-8 text-center">
        <div className="text-slate-300 text-[13px] font-medium mb-1">Price chart available in demo mode</div>
        <p className="text-[11.5px] text-slate-500 max-w-md mx-auto">
          Historical prices aren't in the live feed yet — the accuracy figures above are live, and the
          price chart appears once a price-history source is connected.
        </p>
      </div>
    )
  }

  const n = closes.length
  const lo = Math.min(...closes.map((p) => p.close))
  const hi = Math.max(...closes.map((p) => p.close))
  const span = hi - lo || 1

  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R))
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B)

  // Largest close index on/before a date — anchors a marker to the price line.
  const idxForDate = (dateStr: string): number => {
    let idx = 0
    for (let i = 0; i < n; i++) {
      if (closes[i]!.date <= dateStr) idx = i
      else break
    }
    return idx
  }

  const linePts = closes.map((p, i) => `${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ')
  const areaPts = `${PAD_L},${(H - PAD_B).toFixed(1)} ${linePts} ${(W - PAD_R).toFixed(1)},${(H - PAD_B).toFixed(1)}`

  // Only plot calls that fall on the visible time axis. Calls outside the
  // price window (e.g. more recent than the sample series extends) would
  // otherwise clamp to an edge and read as if they happened there — they stay
  // in the calls list below instead.
  const firstDate = closes[0]!.date
  const lastDate = closes[n - 1]!.date
  const placed = markers
    .filter((m) => m.anchorClose !== null && m.date >= firstDate && m.date <= lastDate)
    .map((m) => ({ m, i: idxForDate(m.date) }))

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${ticker} price with broker calls marked`}>
        {/* min / max gridlines */}
        <line x1={PAD_L} y1={y(hi)} x2={W - PAD_R} y2={y(hi)} stroke="currentColor" className="text-line/10" strokeWidth="1"/>
        <line x1={PAD_L} y1={y(lo)} x2={W - PAD_R} y2={y(lo)} stroke="currentColor" className="text-line/10" strokeWidth="1"/>

        {/* price area + line */}
        <polygon points={areaPts} fill="currentColor" className="text-slate-500/10"/>
        <polyline points={linePts} fill="none" stroke="currentColor" className="text-slate-400"
          strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>

        {/* call markers */}
        {placed.map(({ m, i }) => (
          <Marker key={m.reportId} cx={x(i)} cy={y(m.anchorClose!)} marker={m} currency={currency}/>
        ))}

        {/* axis labels */}
        <text x={PAD_L} y={y(hi) - 4} className="fill-slate-500" fontSize="10">{formatPrice(hi, currency, 0)}</text>
        <text x={PAD_L} y={y(lo) - 4} className="fill-slate-500" fontSize="10">{formatPrice(lo, currency, 0)}</text>
        <text x={PAD_L} y={H - 6} className="fill-slate-600" fontSize="10">{formatShortDate(closes[0]!.date + 'T00:00:00Z')}</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="fill-slate-600" fontSize="10">
          {formatShortDate(closes[n - 1]!.date + 'T00:00:00Z')}
        </text>
      </svg>

      <div className="flex items-center justify-between flex-wrap gap-2 text-[10.5px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><Glyph dir="up" hex={TONE_HEX.positive}/> bullish call</span>
          <span className="inline-flex items-center gap-1"><Glyph dir="down" hex={TONE_HEX.negative}/> bearish call</span>
          <span><span style={{ color: TONE_HEX.positive }}>green</span> = played out · <span style={{ color: TONE_HEX.negative }}>red</span> = didn't</span>
        </div>
        {isSample && (
          <span className="italic text-slate-600">Sample price history — awaiting live price feed</span>
        )}
      </div>
    </div>
  )
}

// A single call marker: triangle (direction) filled by outcome colour; a Hold
// note is a small dot; a too-recent call is a hollow ring.
function Marker({ cx, cy, marker, currency }: { cx: number; cy: number; marker: CallMarker; currency: string }) {
  const hex = OUTCOME_HEX[marker.outcome]
  const tip = `${formatShortDate(marker.date + 'T00:00:00Z')} · ${describe(marker)}`
    + (marker.targetPrice !== null ? ` · target ${formatPrice(marker.targetPrice, currency, 0)}` : '')
  const r = 4.5

  let shape
  if (marker.direction === 'flat') {
    shape = <circle cx={cx} cy={cy} r={3} fill={hex}/>
  } else if (marker.outcome === 'pending') {
    shape = <circle cx={cx} cy={cy} r={3.5} fill="none" stroke={hex} strokeWidth="1.3"/>
  } else {
    const tri = marker.direction === 'up'
      ? `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`
      : `${cx},${cy + r} ${cx - r},${cy - r} ${cx + r},${cy - r}`
    shape = <polygon points={tri} fill={hex}/>
  }

  return (
    <g>
      <title>{tip}</title>
      {/* faint stem to the price line so the marker reads as "at this point" */}
      <circle cx={cx} cy={cy} r={1.4} fill="currentColor" className="text-ink-950"/>
      {shape}
    </g>
  )
}

function Glyph({ dir, hex }: { dir: 'up' | 'down'; hex: string }) {
  return (
    <svg width="9" height="9" viewBox="-5 -5 10 10" aria-hidden>
      {dir === 'up'
        ? <polygon points="0,-4 -4,4 4,4" fill={hex}/>
        : <polygon points="0,4 -4,-4 4,-4" fill={hex}/>}
    </svg>
  )
}

function describe(m: CallMarker): string {
  const dir = m.direction === 'up' ? 'Bullish' : m.direction === 'down' ? 'Bearish' : 'No view'
  if (m.outcome === 'pending') return `${dir} call · too recent to grade`
  if (m.outcome === 'neutral') return m.direction === 'flat' ? 'No directional view' : `${dir} call · flat`
  const verb = m.outcome === 'correct' ? 'played out' : "didn't play out"
  const ret = m.returnPct !== null ? ` (${m.returnPct >= 0 ? '+' : ''}${m.returnPct.toFixed(1)}%)` : ''
  return `${dir} call · ${verb}${ret}`
}
