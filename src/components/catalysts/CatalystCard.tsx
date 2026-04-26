import type { StockTicker } from '../../domain'
import { asTicker } from '../../lib/ids'
import type { CatalystCardViewModel } from '../../viewModels/catalysts'
import BookBadge from '../portfolio/BookBadge'
import CatalystTypeBadge from './CatalystTypeBadge'

interface CatalystCardProps {
  readonly card: CatalystCardViewModel
  readonly selected: boolean
  readonly onSelect: () => void
  readonly onSelectTicker?: (t: StockTicker) => void
}

export default function CatalystCard({ card, selected, onSelect, onSelectTicker }: CatalystCardProps) {
  const tone =
    card.importance === 'critical' ? 'border-rose-500/30 bg-rose-500/5'
    : card.importance === 'high'    ? 'border-amber-500/30 bg-amber-500/[0.04]'
    : card.importance === 'medium'  ? 'border-line/10'
    :                                 'border-line/5'
  const ringTone = selected ? 'ring-1 ring-accent/40' : ''
  const dateLabel = card.daysUntil < 0
    ? `${Math.abs(card.daysUntil)}d overdue`
    : card.daysUntil === 0 ? 'today'
    : card.daysUntil === 1 ? 'tomorrow'
    : `in ${card.daysUntil}d`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`px-3 py-2 rounded border ${tone} ${ringTone} hover:bg-line/[0.04] cursor-pointer transition-colors flex flex-col gap-1`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(asTicker(card.ticker)) }}
          className="chip border border-line/10 text-slate-200 hover:text-accent text-[10.5px] flex-shrink-0"
          title="Open stock detail"
        >{card.ticker}</button>
        <CatalystTypeBadge type={card.type} importance={card.importance} compact/>
        <BookBadge
          membership={card.membership}
          direction={card.direction}
          weightPct={card.weightPct}
          conviction={card.conviction}
          compact
        />
        <span className="ml-auto text-[10.5px] text-slate-500 num">{dateLabel}</span>
      </div>
      <div className="text-slate-100 text-[12.5px] font-medium truncate" title={card.headline}>
        {card.headline}
      </div>
      <div className="text-slate-500 text-[10.5px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num">{card.expectedDate}{card.hasIntradayTime ? ` · ${card.expectedAt.slice(11, 16)}Z` : ''}</span>
        <span>·</span>
        <span>{card.status}</span>
        {card.reasonChips.map((r) => (
          <span key={r.code} className="chip border border-line/10 text-slate-400 text-[10px]">{r.text}</span>
        ))}
      </div>
    </div>
  )
}
