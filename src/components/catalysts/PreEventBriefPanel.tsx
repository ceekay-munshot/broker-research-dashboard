import type { ReportId, StockTicker, CatalystId } from '../../domain'
import { usePreEventBriefViewModel } from '../../hooks/usePreEventBriefViewModel'
import CatalystTypeBadge from './CatalystTypeBadge'
import BookBadge from '../portfolio/BookBadge'

interface PreEventBriefPanelProps {
  readonly catalystId: CatalystId | null
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onOpenBriefing: () => void
}

export default function PreEventBriefPanel({
  catalystId, onSelectReport, onSelectTicker, onOpenBriefing,
}: PreEventBriefPanelProps) {
  const { data, loading, error } = usePreEventBriefViewModel(catalystId)
  if (!catalystId) {
    return (
      <aside className="panel p-5 text-slate-500 text-[12px] sticky top-4">
        <p className="mb-2">Select a catalyst to preview its pre-event brief.</p>
        <p className="text-slate-600 text-[11px]">Held / watchlist names within 30 days have a generated brief; others show their event details.</p>
      </aside>
    )
  }
  if (loading || !data) return <aside className="panel p-5 text-slate-500 text-[12px] animate-pulse">Loading brief…</aside>
  if (error) return <aside className="panel p-5 text-rose-400 text-[12px]">Error: {error.message}</aside>

  if (!data.hasBrief) {
    return (
      <aside className="panel p-5 text-slate-500 text-[12px]">
        <p className="mb-2 text-slate-300">No pre-event brief available.</p>
        <p>{data.degradations[0] ?? '—'}</p>
      </aside>
    )
  }

  const b = data.brief!
  const cat = b.snapshot

  return (
    <aside className="panel p-4 flex flex-col gap-3 sticky top-4 max-h-[80vh] overflow-y-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onSelectTicker(cat.ticker)}
              className="chip border border-line/10 text-slate-200 hover:text-accent text-[10.5px]"
            >{cat.ticker as unknown as string}</button>
            <CatalystTypeBadge type={'earnings'} compact/>
            {/* daysUntil context */}
            <span className="text-[10.5px] text-slate-500 num">
              {b.daysUntilEvent < 0 ? `${Math.abs(b.daysUntilEvent)}d overdue`
                : b.daysUntilEvent === 0 ? 'today'
                : b.daysUntilEvent === 1 ? 'tomorrow'
                : `in ${b.daysUntilEvent}d`}
            </span>
          </div>
          <h3 className="text-slate-100 font-semibold text-[13px]">Pre-event brief</h3>
        </div>
        {b.riskFlags.length > 0 && (
          <span className="chip border border-amber-500/40 text-amber-300 bg-amber-500/10 text-[10px] uppercase tracking-wider font-semibold">
            {b.riskFlags.length} risk flag{b.riskFlags.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {b.executiveSummary && (
        <div className="text-[12px] text-slate-200 leading-relaxed border-l-2 border-accent/30 pl-3">
          {b.executiveSummary}
          {b.executiveSummaryFromLlm && (
            <span className="ml-1.5 text-[9.5px] text-slate-500 uppercase tracking-wider">[LLM]</span>
          )}
        </div>
      )}

      {/* Snapshot header chips */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="chip border border-line/10 text-slate-300">{cat.tiltSummary}</span>
        <span className="chip border border-line/10 text-slate-300 num">{cat.distinctBrokers} brokers</span>
        {cat.avgTargetPrice !== null && (
          <span className="chip border border-line/10 text-slate-300 num">avg target {cat.avgTargetPrice.toLocaleString('en-IN')}</span>
        )}
        {cat.avgImpliedUpsidePct !== null && (
          <span className={`chip border ${cat.avgImpliedUpsidePct >= 0 ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'} num`}>
            implied {cat.avgImpliedUpsidePct >= 0 ? '+' : ''}{cat.avgImpliedUpsidePct.toFixed(1)}%
          </span>
        )}
        {cat.hasDivergence && (
          <span className="chip border border-amber-500/30 text-amber-300 text-[10px] uppercase tracking-wider">divergent</span>
        )}
        <BookBadge
          membership={(b.snapshot.opinions.length > 0 ? 'held' : 'none') as 'held' | 'watchlist' | 'adjacent' | 'none'}
          direction={null}
          weightPct={null}
          conviction={null}
          compact
        />
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-3">
        {b.sections.map((sec) => (
          <section key={sec.key} className="flex flex-col gap-1.5">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h4 className="text-slate-100 text-[12px] font-semibold">{sec.title}</h4>
                <p className="text-slate-500 text-[10.5px]">{sec.subtitle}</p>
              </div>
            </div>
            {sec.prose && (
              <p className="text-slate-300 text-[11.5px]">
                {sec.prose}
                {sec.proseFromLlm && (
                  <span className="ml-1.5 text-[9.5px] text-slate-500 uppercase tracking-wider">[LLM]</span>
                )}
              </p>
            )}
            {sec.bullets.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-[11.5px] text-slate-300 list-disc list-outside ml-4">
                {sec.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            {sec.reportIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sec.reportIds.slice(0, 5).map((rid) => (
                  <button
                    key={rid as unknown as string}
                    onClick={() => onSelectReport(rid)}
                    className="chip border border-line/10 text-slate-300 hover:text-accent text-[10px]"
                  >open report</button>
                ))}
              </div>
            )}
            {sec.alertIds.length > 0 && (
              <button onClick={onOpenBriefing} className="text-accent text-[10.5px] hover:text-accent/80">
                Open in Briefing →
              </button>
            )}
          </section>
        ))}
      </div>
    </aside>
  )
}
