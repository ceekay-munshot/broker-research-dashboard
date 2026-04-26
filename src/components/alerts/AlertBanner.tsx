import type { AlertCardViewModel } from '../../viewModels/alerts'
import SeverityBadge from './SeverityBadge'

/** Slim "you have N critical/high alerts" ribbon for embedding inside
 *  My Book. Click navigates to the Briefing tab. */
export default function AlertBanner({
  cards, onOpenBriefing,
}: {
  cards: readonly AlertCardViewModel[]
  onOpenBriefing: () => void
}) {
  const critical = cards.filter((c) => c.severity === 'critical')
  const high     = cards.filter((c) => c.severity === 'high')
  const total = cards.length
  if (total === 0) return null
  return (
    <button
      onClick={onOpenBriefing}
      className="panel p-3 flex items-center justify-between gap-3 w-full text-left hover:bg-line/[0.03] transition-colors"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="section-title">Briefing</span>
        {critical.length > 0 && (
          <span className="flex items-center gap-1.5">
            <SeverityBadge severity="critical" compact/>
            <span className="text-rose-300 text-[12px]">{critical.length} critical</span>
          </span>
        )}
        {high.length > 0 && (
          <span className="flex items-center gap-1.5">
            <SeverityBadge severity="high" compact/>
            <span className="text-amber-300 text-[12px]">{high.length} high</span>
          </span>
        )}
        <span className="text-slate-500 text-[11px] num">{total} total</span>
        {critical[0] && (
          <span className="text-slate-300 text-[11.5px] truncate max-w-[420px]" title={critical[0].headline}>
            · {critical[0].headline}
          </span>
        )}
      </div>
      <span className="text-accent text-[11px]">Open briefing →</span>
    </button>
  )
}
