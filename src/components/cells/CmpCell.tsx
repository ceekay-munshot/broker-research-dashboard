// Right-aligned price cell for the By Stock table's CMP column.
// States:
//   loading        skeleton bar
//   success        formatted price + optional target-vs-CMP delta chip
//   unavailable    em-dash with a reason-specific tooltip

import type { PriceCell } from '../../hooks/useStockPrices'
import { formatPrice } from '../../viewModels/shared'
import { TONE_TEXT_CLASS } from '../../lib/semanticColor'

interface CmpCellProps {
  readonly cell: PriceCell | undefined
  readonly avgTarget: number | null
}

export default function CmpCell({ cell, avgTarget }: CmpCellProps) {
  if (!cell || cell.status === 'loading') {
    return (
      <span
        className="inline-block h-3 w-12 bg-line/10 rounded animate-pulse align-middle"
        aria-label="Loading current market price"
      />
    )
  }

  if (cell.status === 'unavailable') {
    return (
      <span className="text-slate-600" title={UNAVAILABLE_TOOLTIP[cell.reason]}>—</span>
    )
  }

  const delta = computeDelta(avgTarget, cell.price)

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="num text-slate-100">{formatPrice(cell.price, 'INR', 0)}</span>
      {delta && (
        <span
          className={`num text-[10px] ${TONE_TEXT_CLASS[delta.tone]}`}
          title={delta.tooltip}
        >
          {delta.label}
        </span>
      )}
    </span>
  )
}

const UNAVAILABLE_TOOLTIP: Readonly<Record<'not_found' | 'ambiguous_ticker' | 'upstream_error', string>> = {
  not_found: 'No live quote available for this ticker',
  ambiguous_ticker:
    'Ticker symbol is ambiguous — the live-quote service may return a different company than the broker note meant. CMP hidden to avoid showing wrong data.',
  upstream_error: 'Live price service is temporarily unreachable',
}

function computeDelta(avgTarget: number | null, currentPrice: number): {
  readonly label: string
  readonly tone: 'positive' | 'negative' | 'neutral'
  readonly tooltip: string
} | null {
  if (avgTarget === null || currentPrice <= 0) return null
  const pct = (avgTarget / currentPrice - 1) * 100
  if (!Number.isFinite(pct)) return null
  const rounded = Math.round(pct)
  if (rounded === 0) {
    return {
      label: '0%',
      tone: 'neutral',
      tooltip: "Brokers' avg target matches the current price",
    }
  }
  const sign = rounded > 0 ? '+' : ''
  const direction = rounded > 0 ? 'above' : 'below'
  const magnitude = Math.abs(rounded)
  return {
    label: `${sign}${rounded}%`,
    tone: rounded > 0 ? 'positive' : 'negative',
    tooltip: `Brokers' avg target is ${magnitude}% ${direction} the current price`,
  }
}
