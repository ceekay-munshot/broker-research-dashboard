import { useMemo, useState } from 'react'
import type { CatalystId, ReportId, StockTicker } from '../../domain'
import { useCatalystsViewModel } from '../../hooks/useCatalystsViewModel'
import CatalystCard from '../catalysts/CatalystCard'
import PreEventBriefPanel from '../catalysts/PreEventBriefPanel'
import type { CatalystCardViewModel, CatalystGroupKey } from '../../viewModels/catalysts'

interface SectionGroup {
  readonly key: CatalystGroupKey
  readonly label: string
  readonly subtitle: string
  readonly items: readonly CatalystCardViewModel[]
}

interface CatalystsProps {
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onOpenBriefing: () => void
}

const FILTER_OPTIONS = [
  { id: 'all',       label: 'All' },
  { id: 'book',      label: 'Held + watchlist' },
  { id: 'held',      label: 'Held only' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'risk',      label: 'Has risk flag' },
] as const
type FilterId = typeof FILTER_OPTIONS[number]['id']

export default function Catalysts({ onSelectReport, onSelectTicker, onOpenBriefing }: CatalystsProps) {
  const [filter, setFilter] = useState<FilterId>('book')
  const [selectedId, setSelectedId] = useState<CatalystId | null>(null)
  const { data, loading, error } = useCatalystsViewModel()

  // Compute the filtered + grouped sections unconditionally so the hook
  // ordering stays stable across renders. Defaults are safe when data
  // is not yet loaded.
  const filtered = useMemo<readonly SectionGroup[]>(() => {
    if (!data || !data.hasData) return []
    const sections: readonly SectionGroup[] = [
      { key: 'overdue',     label: 'Overdue / date uncertain', subtitle: 'Past expected date but not yet completed.', items: data.overdue },
      { key: 'upcoming7d',  label: 'Next 7 days',              subtitle: 'Imminent catalysts, ranked by priority.',     items: data.upcoming7d },
      { key: 'upcoming30d', label: 'Next 30 days',             subtitle: 'Plan-ahead catalysts.',                       items: data.upcoming30d },
      { key: 'later',       label: 'Beyond 30 days',           subtitle: 'On the horizon.',                             items: data.later },
    ]
    return sections.map((s) => ({
      ...s,
      items: s.items.filter((c: CatalystCardViewModel) => {
        if (filter === 'all') return true
        if (filter === 'book') return c.membership === 'held' || c.membership === 'watchlist'
        if (filter === 'held') return c.membership === 'held'
        if (filter === 'watchlist') return c.membership === 'watchlist'
        if (filter === 'risk') return c.riskFlags.length > 0
        return true
      }),
    })).filter((s) => s.items.length > 0)
  }, [data, filter])

  if (loading || !data) return <ViewMessage tone="loading" text="Loading catalysts…"/>
  if (error)            return <ViewMessage tone="error" text={`Error: ${error.message}`}/>

  if (!data.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-slate-100 font-semibold text-base">Catalysts</h2>
          <p className="text-slate-400 text-[12px]">
            Forward-looking calendar of upcoming catalysts (earnings, guidance, AGM, investor day, etc.).
          </p>
        </header>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No catalysts ingested yet</div>
          <p className="max-w-md mx-auto">
            Connect a catalyst source or seed fixtures, then run <code className="kbd">npm run ops -- catalysts:replay</code>.
          </p>
          <p className="text-slate-500 text-[11px] mt-3">See <code className="kbd">docs/catalysts.md</code> for the input seam.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">Catalysts</h2>
          <p className="text-slate-400 text-[12px]">Portfolio-aware calendar + pre-event briefs (next 30d, held / watchlist).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <Stat label="Total"        value={data.counts.total}/>
          <Stat label="Held"         value={data.counts.held}      tone="emerald"/>
          <Stat label="Watchlist"    value={data.counts.watchlist}/>
          <Stat label="Weak coverage" value={data.counts.weakCoverage} tone="amber"/>
          <Stat label="Divergent"    value={data.counts.divergent} tone="amber"/>
        </div>
      </header>

      {data.degradations.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-amber-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Degraded</span>
          {data.degradations.join('  ·  ')}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="section-title">Filter</span>
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`chip text-[11px] border ${
              filter === f.id
                ? 'border-accent/40 text-accent bg-accent/10'
                : 'border-line/10 text-slate-400 hover:text-slate-200 hover:border-line/20'
            }`}
          >{f.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {filtered.map((s) => (
            <section key={s.key} className="panel p-3 flex flex-col gap-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h3 className="text-slate-100 text-[13px] font-semibold">{s.label}</h3>
                  <p className="text-slate-500 text-[11px]">{s.subtitle}</p>
                </div>
                <span className="text-slate-500 text-[10.5px] num">{s.items.length}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {s.items.map((c) => (
                  <CatalystCard
                    key={c.catalystId as unknown as string}
                    card={c}
                    selected={selectedId === c.catalystId}
                    onSelect={() => setSelectedId(c.catalystId)}
                    onSelectTicker={onSelectTicker}
                  />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <div className="panel p-6 text-center text-[12px] text-slate-500">No catalysts match the current filter.</div>
          )}
        </div>

        <div className="min-w-0">
          <PreEventBriefPanel
            catalystId={selectedId}
            onSelectReport={onSelectReport}
            onSelectTicker={onSelectTicker}
            onOpenBriefing={onOpenBriefing}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' }) {
  const valueClass = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-100'
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`num text-[12px] font-semibold ${valueClass}`}>{value.toLocaleString()}</span>
    </div>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
