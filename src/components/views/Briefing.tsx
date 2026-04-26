import { useState } from 'react'
import type { ReportId, StockTicker, DigestKind, AlertSeverity } from '../../domain'
import { useBriefingViewModel } from '../../hooks/useBriefingViewModel'
import { useAlertFeed } from '../../hooks/useAlertFeed'
import type { AlertsFeedViewModel } from '../../viewModels/alerts'
import AlertCard from '../alerts/AlertCard'
import SeverityBadge from '../alerts/SeverityBadge'

interface BriefingProps {
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

const TABS: readonly { id: DigestKind; label: string }[] = [
  { id: 'morning_brief',     label: 'Morning Brief' },
  { id: 'intraday_critical', label: 'Intraday Critical' },
  { id: 'coverage_hygiene',  label: 'Coverage Hygiene' },
]

export default function Briefing({ onSelectReport, onSelectTicker }: BriefingProps) {
  const [kind, setKind] = useState<DigestKind>('morning_brief')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | null>(null)
  const [groupBy, setGroupBy] = useState<AlertsFeedViewModel['groupBy']>('severity')

  const briefing = useBriefingViewModel(kind)
  const feed = useAlertFeed({ groupBy, limit: 200 })

  if (briefing.loading || !briefing.data) return <ViewMessage tone="loading" text="Loading briefing…"/>
  if (briefing.error) return <ViewMessage tone="error" text={`Error: ${briefing.error.message}`}/>

  const vm = briefing.data
  const counts = vm.counts

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Alerts &amp; Briefing</h2>
            <p className="text-slate-400 text-[12px]">
              Deterministic portfolio-aware alert feed and digests. Triggered server-side; LLM prose is optional.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <Stat label="Critical"    value={counts.critical} tone="rose"/>
            <Stat label="High"        value={counts.high}     tone="amber"/>
            <Stat label="Medium"      value={counts.medium}/>
            <Stat label="Total"       value={counts.total}/>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setKind(t.id)}
              className={`chip text-[11px] border ${
                kind === t.id
                  ? 'border-accent/40 text-accent bg-accent/10'
                  : 'border-line/10 text-slate-400 hover:text-slate-200 hover:border-line/20'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </header>

      {vm.degradations.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-amber-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Degraded</span>
          {vm.degradations.join('  ·  ')}
        </div>
      )}

      {/* Latest digest */}
      {vm.hasDigest && vm.digest && (
        <section className="panel p-4 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-slate-100 text-[14px] font-semibold">{vm.digest.title}</h3>
              <p className="text-slate-500 text-[11.5px]">{vm.digest.subtitle}</p>
              <p className="text-slate-600 text-[10.5px] mt-1">
                Generated {vm.digest.generatedAt.slice(0, 16).replace('T', ' ')} UTC ·
                window {vm.digest.windowStart.slice(5, 16).replace('T', ' ')} → {vm.digest.windowEnd.slice(5, 16).replace('T', ' ')}
              </p>
            </div>
            {vm.digest.topSeverity && (
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-slate-500 uppercase tracking-wider">Top severity</span>
                <SeverityBadge severity={vm.digest.topSeverity}/>
              </div>
            )}
          </div>
          {vm.executiveSummary && (
            <div className="text-[12px] text-slate-200 leading-relaxed border-l-2 border-accent/30 pl-3">
              {vm.executiveSummary}
              {vm.executiveSummaryFromLlm && (
                <span className="ml-1.5 text-[9.5px] text-slate-500 uppercase tracking-wider">[LLM]</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {vm.sections.map((sec) => (
              <div key={sec.key} className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-slate-100 text-[12.5px] font-semibold">{sec.title}</h4>
                    <p className="text-slate-500 text-[11px]">{sec.subtitle}</p>
                  </div>
                  <span className="text-slate-500 text-[10.5px] num">{sec.items.length}</span>
                </div>
                {sec.prose && (
                  <p className="text-slate-300 text-[11.5px]">
                    {sec.prose}
                    {sec.proseFromLlm && (
                      <span className="ml-1.5 text-[9.5px] text-slate-500 uppercase tracking-wider">[LLM]</span>
                    )}
                  </p>
                )}
                {sec.items.length === 0 ? (
                  <div className="text-[11.5px] text-slate-600 italic px-1">{sec.emptyText}</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {sec.items.slice(0, 8).map((c) => (
                      <AlertCard key={c.id as unknown as string} card={c}
                        onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      <section className="panel p-4 flex flex-col gap-3">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-slate-100 text-[14px] font-semibold">Alert feed</h3>
            <p className="text-slate-500 text-[11.5px]">All alerts ranked + grouped. Filter by severity or pivot the grouping.</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="section-title">Group</span>
            {(['severity', 'membership', 'kind', 'broker'] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`chip text-[11px] border ${groupBy === g ? 'border-accent/40 text-accent bg-accent/10' : 'border-line/10 text-slate-400 hover:text-slate-200'}`}>
                {g}
              </button>
            ))}
            <span className="w-px h-4 bg-line/10 mx-1"/>
            <span className="section-title">Severity</span>
            {(['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => (
              <button key={s} onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
                className={`chip text-[10.5px] border uppercase tracking-wider ${severityFilter === s ? 'border-accent/40 text-accent bg-accent/10' : 'border-line/10 text-slate-400 hover:text-slate-200'}`}>
                {s}
              </button>
            ))}
            {severityFilter && (
              <button onClick={() => setSeverityFilter(null)} className="text-slate-500 hover:text-slate-200 text-[11px]">clear</button>
            )}
          </div>
        </div>

        {feed.loading || !feed.data ? (
          <div className="text-[11.5px] text-slate-500 italic">Loading feed…</div>
        ) : feed.data.groups.length === 0 ? (
          <div className="text-[11.5px] text-slate-500 italic">No alerts in the feed.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {feed.data.groups.map((g) => {
              const items = severityFilter
                ? g.items.filter((c) => c.severity === severityFilter)
                : g.items
              if (items.length === 0) return null
              return (
                <div key={g.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="section-title">{g.label}</span>
                    <span className="text-[10.5px] text-slate-500 num">{items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                    {items.slice(0, 12).map((c) => (
                      <AlertCard key={c.id as unknown as string} card={c}
                        onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'rose' | 'amber' }) {
  const valueClass =
    tone === 'rose'  ? 'text-rose-300'
    : tone === 'amber' ? 'text-amber-300'
    :                    'text-slate-100'
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
