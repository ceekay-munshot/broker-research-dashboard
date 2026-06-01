// A true-scale number line of broker price targets. Every covering broker
// gets a dot at its real linear position, so an outlier visibly stands
// apart from the consensus cluster and the reader can see exactly who sits
// where. Hovering a dot names the broker, its target, and how far that
// target is from consensus. When an endpoint is a flagged target outlier,
// the gap to consensus is decorated with an axis-break ("//") so the reader
// sees the jump rather than a misleadingly smooth bar.

import { useState } from 'react'
import type { TargetStats } from '../../engine/types'
import type { Rating } from '../../domain'
import type { OutlierVM, BrokerTargetVM } from '../../viewModels/divergence'
import { formatPrice, RATING_TEXT_COLOR } from '../../viewModels/shared'

interface Props {
  readonly stats: TargetStats
  readonly currency: string
  readonly outliers: readonly OutlierVM[]
  readonly brokerTargets?: readonly BrokerTargetVM[]
  /** How to colour the per-broker dots. 'position' (default) tints by where
   *  the target sits vs the median (low = red, high = green) — the original
   *  disagreements-tab behaviour. 'rating' tints by the broker's call so the
   *  line shows every broker AND its Buy / Hold / Sell at a glance. */
  readonly dotColorMode?: 'position' | 'rating'
}

type DotTone = 'outlier' | 'low' | 'high'
type CallBucket = 'buy' | 'hold' | 'sell'

// Call → dot fill / hover-ring, matching the emerald/slate/rose rating palette
// used by the rating-distribution bar so the colours read as one legend.
const CALL_DOT_FILL: Record<CallBucket, string> = {
  buy:  'bg-emerald-400',
  hold: 'bg-slate-300',
  sell: 'bg-rose-400',
}
const CALL_DOT_RING: Record<CallBucket, string> = {
  buy:  'ring-emerald-300/60',
  hold: 'ring-slate-300/60',
  sell: 'ring-rose-300/60',
}

function callBucket(rating: Rating | null): CallBucket | null {
  if (rating === 'Buy' || rating === 'Overweight') return 'buy'
  if (rating === 'Hold') return 'hold'
  if (rating === 'Sell' || rating === 'Underweight') return 'sell'
  return null
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function TargetPriceScale({ stats, currency, outliers, brokerTargets = [], dotColorMode = 'position' }: Props) {
  const { low, high, median, count, spreadPct } = stats
  const price = (n: number | null) => formatPrice(n, currency, 0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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

  // Target outliers get the amber dot — the same signal the endpoints use.
  // (Rating/stance outliers aren't *price* outliers, so they're excluded.)
  const targetOutlierIds = new Set(zOutliers.map((o) => o.brokerId))

  // One interactive dot per broker, at its true position. Sorted by price so
  // hover hit-testing and any visual overlap read left-to-right. Positions
  // are clamped to the rail in case a published target sits just outside the
  // closure's low/high (the two can come from slightly different snapshots).
  const dots = [...brokerTargets]
    .sort((a, b) => a.targetPrice - b.targetPrice)
    .map((b) => {
      const outlier = targetOutlierIds.has(b.brokerId)
      const tone: DotTone = outlier ? 'outlier' : b.targetPrice < median ? 'low' : 'high'
      const bucket = callBucket(b.rating)
      // Outliers keep the amber fill (same signal the endpoints use). Otherwise
      // 'rating' mode tints by the broker's call; 'position' mode (or an
      // un-rated broker) falls back to the low/high tint.
      const fill =
        outlier                                ? 'bg-amber-400'
        : dotColorMode === 'rating' && bucket  ? CALL_DOT_FILL[bucket]
        : tone === 'low'                       ? 'bg-rose-400'
        :                                        'bg-emerald-400'
      const ring =
        outlier                                ? 'ring-amber-300/60'
        : dotColorMode === 'rating' && bucket  ? CALL_DOT_RING[bucket]
        : tone === 'low'                       ? 'ring-rose-300/60'
        :                                        'ring-emerald-300/60'
      return {
        brokerId: b.brokerId,
        name: b.brokerName,
        price: b.targetPrice,
        rating: b.rating,
        pos: clamp(posOf(b.targetPrice), 0, 100),
        outlier,
        fill,
        ring,
      }
    })
  const hasDots = dots.length >= 2
  const active = hoveredId === null ? null : dots.find((d) => d.brokerId === hoveredId) ?? null

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

          {hasDots ? (
            dots.map((d) => (
              <BrokerDot
                key={d.brokerId}
                pos={d.pos}
                fill={d.fill}
                ring={d.ring}
                active={hoveredId === d.brokerId}
                onEnter={() => setHoveredId(d.brokerId)}
                onLeave={() => setHoveredId((cur) => (cur === d.brokerId ? null : cur))}
                title={`${d.name} · ${price(d.price)}`}
              />
            ))
          ) : (
            <>
              <Dot pos={0} tone={lowOutlier ? 'outlier' : 'low'}/>
              <Dot pos={100} tone={highOutlier ? 'outlier' : 'high'}/>
            </>
          )}

          {/* consensus anchor — the derived median, kept above the broker
              dots so it stays visible even if a broker sits right on it */}
          <span className="absolute inset-0 z-20 pointer-events-none">
            <Dot pos={medianPos} tone="median"/>
          </span>

          {active && (
            <BrokerTip
              pos={active.pos}
              name={active.name}
              rating={active.rating}
              price={price(active.price)}
              delta={consensusDelta(active.price, median)}
              outlier={active.outlier}
            />
          )}
        </div>

        {/* endpoints */}
        <div className="relative h-10 mt-1">
          <Endpoint align="left"  label="Lowest"  value={price(low)}  outlier={lowOutlier}/>
          <Endpoint align="right" label="Highest" value={price(high)} outlier={highOutlier}/>
        </div>

        {hasDots && (
          <p className="text-[10px] text-slate-500 mt-1.5">
            {dotColorMode === 'rating'
              ? 'Each dot is one broker — colour is their call, position is their target. Hover to see who.'
              : 'Each dot is one broker — hover to see who and their target.'}
          </p>
        )}
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

// One broker's dot. A generous transparent hit-area wraps the small visible
// dot so it's easy to hover; hovering grows the dot and rings it in its hue.
// Fill + ring classes are resolved by the caller (by call in 'rating' mode,
// by position otherwise) so this stays a dumb renderer.
function BrokerDot({ pos, fill, ring, active, onEnter, onLeave, title }: {
  pos: number
  fill: string
  ring: string
  active: boolean
  onEnter: () => void
  onLeave: () => void
  title: string
}) {
  return (
    <span
      className="absolute top-1/2 z-10 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-default"
      style={{ left: `${pos}%`, width: 18, height: 18 }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={title}
    >
      <span
        className={`rounded-full transition-all duration-100 ${fill} ${
          active ? `w-3.5 h-3.5 ring-2 ${ring}` : 'w-2.5 h-2.5 ring-1 ring-slate-950/50'
        }`}
      />
    </span>
  )
}

// Floating label for the hovered broker. Clamped horizontally so it never
// runs off the rail; a small caret ties it back to the dot.
function BrokerTip({ pos, name, rating, price, delta, outlier }: {
  pos: number
  name: string
  rating: Rating | null
  price: string
  delta: string
  outlier: boolean
}) {
  const showRating = rating !== null && rating !== 'Not Rated'
  return (
    <div
      className="absolute bottom-full mb-2 z-30 -translate-x-1/2 pointer-events-none"
      style={{ left: `${clamp(pos, 12, 88)}%` }}
    >
      <div className="relative rounded-md border border-line/15 bg-slate-900 shadow-xl px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap">
        <span className="text-[11px] font-semibold text-slate-100">
          {name}
          {outlier && <span className="text-amber-400"> · outlier</span>}
        </span>
        {showRating && (
          <span className={`text-[10.5px] font-semibold ${RATING_TEXT_COLOR[rating]}`}>{rating}</span>
        )}
        <span className="num text-[12px] text-slate-100">{price}</span>
        {delta && <span className="text-[10px] text-slate-400">{delta}</span>}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 bg-slate-900 border-r border-b border-line/15"/>
      </div>
    </div>
  )
}

// Plain-language distance from consensus for the hover label.
function consensusDelta(price: number, median: number): string {
  if (median <= 0) return ''
  const pct = Math.round(((price - median) / median) * 100)
  if (pct === 0) return 'at consensus'
  return `${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} consensus`
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
