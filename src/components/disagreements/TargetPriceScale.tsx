// A true-scale number line of broker price targets. Dots sit at their
// real linear positions, so an outlier broker visibly stands apart from
// the consensus cluster. When an endpoint is a flagged target outlier,
// the gap to consensus is decorated with an axis-break ("//") so the
// reader sees the jump rather than a misleadingly smooth bar.

import type { TargetStats } from '../../engine/types'
import type { OutlierVM } from '../../viewModels/divergence'
import { formatPrice } from '../../viewModels/shared'

interface Props {
  readonly stats: TargetStats
  readonly currency: string
  readonly outliers: readonly OutlierVM[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function TargetPriceScale({ stats, currency, outliers }: Props) {
  const { low, high, median, count, spreadPct } = stats
  const price = (n: number | null) => formatPrice(n, currency, 0)

  // Not enough targets — or every broker on the same number — to draw a
  // spread. Show an honest fallback line instead of a fake bar.
  if (count < 2 || low === null || high === null || median === null || high <= low) {
    return (
      <Frame count={count} spreadPct={spreadPct}>
        <div className="text-[12px] text-slate-500">
          {count === 0
            ? 'No published price targets on this name.'
            : count === 1
              ? `Single broker target of ${price(low ?? median)} — nothing to compare it against.`
              : `All ${count} brokers target ${price(low)} — no valuation gap.`}
        </div>
      </Frame>
    )
  }

  const span = high - low
  const posOf = (v: number) => ((v - low) / span) * 100
  const medianPos = posOf(median)

  // Which endpoint, if any, is an outlier broker's target. A negative
  // target z-score means a broker sits far below the mean (so `low` is
  // that broker); a positive one means `high` is.
  const zOutliers = outliers.filter((o) => o.targetZScore !== null)
  const lowOutlier = zOutliers.find((o) => (o.targetZScore as number) < 0) ?? null
  const highOutlier = zOutliers.find((o) => (o.targetZScore as number) > 0) ?? null

  return (
    <Frame count={count} spreadPct={spreadPct}>
      <div className="flex flex-col">
        {/* consensus caret — arrow at the true position, label clamped in view */}
        <div className="relative h-7">
          <span
            className="absolute bottom-2.5 num text-[11px] text-slate-100 font-semibold whitespace-nowrap -translate-x-1/2"
            style={{ left: `${clamp(medianPos, 14, 86)}%` }}
          >
            Consensus {price(median)}
          </span>
          <span
            className="absolute bottom-0 text-slate-400 text-[8px] leading-none -translate-x-1/2"
            style={{ left: `${medianPos}%` }}
          >▼</span>
        </div>

        {/* the rail */}
        <div className="relative h-2 rounded-full bg-gradient-to-r from-rose-500/25 via-slate-500/15 to-emerald-500/25">
          {lowOutlier && <AxisBreak from={0} to={medianPos}/>}
          {highOutlier && <AxisBreak from={medianPos} to={100}/>}
          <Dot pos={0} tone={lowOutlier ? 'outlier' : 'low'}/>
          <Dot pos={medianPos} tone="median"/>
          <Dot pos={100} tone={highOutlier ? 'outlier' : 'high'}/>
        </div>

        {/* endpoints */}
        <div className="relative h-10 mt-1">
          <Endpoint align="left"  label="Lowest"  value={price(low)}  outlier={lowOutlier}/>
          <Endpoint align="right" label="Highest" value={price(high)} outlier={highOutlier}/>
        </div>
      </div>
    </Frame>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function Frame({ count, spreadPct, children }: {
  count: number
  spreadPct: number | null
  children: React.ReactNode
}) {
  const spreadTone =
    spreadPct === null  ? 'text-slate-400'
    : spreadPct >= 60   ? 'text-rose-400'
    : spreadPct >= 25   ? 'text-amber-400'
    :                     'text-slate-400'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="section-title">Target price</span>
        <span className="text-[10.5px] text-slate-500 num">
          {count} broker{count === 1 ? '' : 's'}
          {spreadPct !== null && (
            <> · <span className={spreadTone}>{Math.round(spreadPct)}% spread</span></>
          )}
        </span>
      </div>
      {children}
    </div>
  )
}

function AxisBreak({ from, to }: { from: number; to: number }) {
  return (
    <>
      <div
        className="absolute top-1/2 -translate-y-1/2 border-t border-dashed border-amber-500/50"
        style={{ left: `${from}%`, width: `${to - from}%` }}
      />
      <span
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-amber-400 text-[11px] font-bold leading-none"
        style={{ left: `${(from + to) / 2}%` }}
      >//</span>
    </>
  )
}

function Dot({ pos, tone }: { pos: number; tone: 'low' | 'high' | 'median' | 'outlier' }) {
  const cls =
    tone === 'outlier' ? 'bg-amber-400 ring-2 ring-amber-400/30'
    : tone === 'low'   ? 'bg-rose-400'
    : tone === 'high'  ? 'bg-emerald-400'
    :                    'bg-slate-100 ring-2 ring-slate-100/25'
  return (
    <span
      className={`absolute top-1/2 w-2.5 h-2.5 rounded-full -translate-y-1/2 -translate-x-1/2 ${cls}`}
      style={{ left: `${pos}%` }}
    />
  )
}

function Endpoint({ align, label, value, outlier }: {
  align: 'left' | 'right'
  label: string
  value: string
  outlier: OutlierVM | null
}) {
  return (
    <div
      className={`absolute top-0 flex flex-col gap-0.5 max-w-[48%] ${
        align === 'left' ? 'left-0 items-start text-left' : 'right-0 items-end text-right'
      }`}
    >
      <span className="text-[9.5px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className={`num text-[13px] font-semibold ${outlier ? 'text-amber-300' : 'text-slate-100'}`}>
        {value}
      </span>
      {outlier && (
        <span className="text-[10px] text-amber-400/90 truncate max-w-full">
          {outlier.brokerName} · outlier
        </span>
      )}
    </div>
  )
}
