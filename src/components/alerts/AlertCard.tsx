import type { AlertCardViewModel } from '../../viewModels/alerts'
import type { ReportId, StockTicker } from '../../domain'
import SeverityBadge from './SeverityBadge'
import BookBadge from '../portfolio/BookBadge'
import RankCompareChip from '../adaptiveRanking/RankCompareChip'
import { adaptiveRankingFlags } from '../../engine'
import { emitUsage } from '../../usage/UsageClient'

interface AlertCardProps {
  readonly card: AlertCardViewModel
  readonly onSelectReport?: (id: ReportId) => void
  readonly onSelectTicker?: (t: StockTicker) => void
}

export default function AlertCard({ card, onSelectReport, onSelectTicker }: AlertCardProps) {
  const tone =
    card.severity === 'critical' ? 'border-rose-500/40 bg-rose-500/5'
    : card.severity === 'high'    ? 'border-amber-500/30 bg-amber-500/[0.04]'
    : card.severity === 'medium'  ? 'border-line/10 bg-line/[0.02]'
    :                                'border-line/5 bg-transparent'

  const onPrimary = () => {
    // Emit open_alert with the alert's id so we can compute alert engagement.
    emitUsage({
      eventType: 'open_alert',
      surface: 'briefing',
      contentKind: 'alert',
      entityId: card.id as unknown as string,
      fromSurface: 'briefing',
      meta: { severity: card.severity, kind: card.kind },
    })
    if (card.reportId && onSelectReport) onSelectReport(card.reportId)
    else if (card.ticker && onSelectTicker) onSelectTicker(card.ticker)
  }

  const isClickable = !!(card.reportId && onSelectReport) || !!(card.ticker && onSelectTicker)

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onPrimary : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPrimary() } } : undefined}
      className={`px-3 py-2 rounded border ${tone} ${isClickable ? 'hover:bg-line/[0.04] cursor-pointer' : ''} transition-colors flex flex-col gap-1`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <SeverityBadge severity={card.severity} compact/>
        {card.ticker && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (card.ticker && onSelectTicker) onSelectTicker(card.ticker) }}
            className="chip border border-line/10 text-slate-200 hover:text-accent text-[10.5px]"
          >{card.ticker as unknown as string}</button>
        )}
        {card.bookMembership && (
          <BookBadge
            membership={card.bookMembership}
            direction={card.bookDirection}
            weightPct={card.bookWeightPct}
            conviction={card.bookConviction}
            compact
          />
        )}
        {adaptiveRankingFlags().showCompare && card.adaptive && card.adaptive.adjustment.applied && (
          <RankCompareChip annotation={card.adaptive} compact/>
        )}
        <span className="ml-auto text-[10.5px] text-slate-500 num">{formatTime(card.generatedAt)}</span>
      </div>
      <div className="text-slate-100 text-[12.5px] font-medium truncate" title={card.headline}>
        {card.headline}
      </div>
      {card.body && (
        <div className="text-[11px] text-slate-400 truncate" title={card.body}>
          {card.body}
        </div>
      )}
      {card.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {card.reasons.slice(0, 4).map((r) => (
            <span key={r.code} className="chip text-[10px] border border-line/10 text-slate-300">
              {r.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}
