import type { FiltersState } from '../../app/filters'
import type { DivergenceCardViewModel } from '../../viewModels/divergence'
import { useDivergenceViewModel } from '../../viewModels/divergence'

interface DivergenceProps {
  readonly filters: FiltersState
}

export default function Divergence({ filters }: DivergenceProps) {
  const { data, loading, error } = useDivergenceViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading divergence view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Divergence / ARB Closure</h2>
        <p className="text-slate-400 text-[12px]">Names where the Street materially disagrees. Each case surfaces the conflicting assumptions driving the spread — Phase 2 will populate the AI conclusion slot.</p>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
        {data.cases.length === 0 && (
          <div className="panel p-8 text-center text-slate-500 text-[13px]">
            No active divergence cases for the current scope.
          </div>
        )}
        {data.cases.map((d) => <DivergenceCard key={d.id} d={d}/>)}
      </div>
    </div>
  )
}

function SpreadBar({ low, high }: { low: number; high: number }) {
  const pct = (((high - low) / low) * 100).toFixed(0)
  return (
    <div className="flex flex-col gap-1 min-w-[220px]">
      <div className="flex items-center justify-between text-[10.5px] text-slate-500 uppercase tracking-widest">
        <span>Low</span>
        <span className="text-amber-400">Spread {pct}%</span>
        <span>High</span>
      </div>
      <div className="h-1.5 rounded-full bg-gradient-to-r from-rose-500/60 via-slate-500/30 to-emerald-500/60"/>
      <div className="flex items-center justify-between text-[11.5px] num">
        <span className="text-rose-400">${low.toLocaleString()}</span>
        <span className="text-emerald-400">${high.toLocaleString()}</span>
      </div>
    </div>
  )
}

function DivergenceCard({ d }: { d: DivergenceCardViewModel }) {
  return (
    <article className="panel p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="section-title">Divergence · {d.ticker}</div>
          <h3 className="text-slate-100 text-[15px] font-semibold mt-1">
            {d.ticker} · spread {d.spreadPct.toFixed(0)}%
          </h3>
          <div className="text-[11.5px] text-slate-400 mt-1">
            Low: <span className="text-rose-400">{d.lowBrokerName}</span>
            <span className="mx-1 text-slate-600">·</span>
            High: <span className="text-emerald-400">{d.highBrokerName}</span>
          </div>
        </div>
        <SpreadBar low={d.lowTargetPrice} high={d.highTargetPrice}/>
      </header>

      <div>
        <div className="section-title mb-2">Conflicting assumptions</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {d.conflicts.map((c, idx) => (
            <div key={idx} className="rounded border border-white/5 bg-white/[0.02] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-slate-400">{c.topic}</div>
                {c.citationCount > 0 && (
                  <span className="num text-[10px] text-slate-500">{c.citationCount} citations</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex gap-2 text-[12px]">
                  <span className="chip border border-emerald-500/30 text-emerald-400 shrink-0">Bull</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-200 leading-snug">{c.bullThesis}</span>
                    {c.bullBrokerNames.length > 0 && (
                      <span className="text-[10.5px] text-slate-500">{c.bullBrokerNames.join(' · ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 text-[12px]">
                  <span className="chip border border-rose-500/30 text-rose-400 shrink-0">Bear</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-200 leading-snug">{c.bearThesis}</span>
                    {c.bearBrokerNames.length > 0 && (
                      <span className="text-[10.5px] text-slate-500">{c.bearBrokerNames.join(' · ')}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-dashed border-accent/30 bg-accent/[0.04] p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="chip border border-accent/40 text-accent">AI · Conclusion</span>
          <span className="text-[10.5px] text-slate-500 uppercase tracking-widest">Phase 2 · pending</span>
        </div>
        <p className="text-[12.5px] text-slate-300 leading-relaxed">
          {d.aiConclusion ?? 'The synthesis model has not yet generated a conclusion for this case. Phase 2 will rank the most resolvable disagreement and suggest the next data release that would close the spread.'}
        </p>
      </div>
    </article>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
