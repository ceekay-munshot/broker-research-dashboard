// Read-only Sources / Ops tab.
//
// Lists every registered source for the current org and shows:
//   - provider mode (real / fixture / mock / disabled)
//   - status (healthy / stale / failing / degraded / unknown)
//   - last successful sync + age + staleness threshold
//   - last error (if any) with category + retry schedule
//   - which UI modules degrade because of this source
//   - recent runs + backfills
//
// Operator actions (sync / backfill / retry) are CLI-driven; this tab
// is the visibility surface — running commands here would compromise
// the dashboard's read-only contract.

import { useSourcesHealth } from '../../hooks/useSourcesHealth'
import {
  buildSourcesTabViewModel, SOURCE_STATUS_CLASS, SOURCE_STATUS_DOT,
  type SourcesTabRowViewModel,
} from '../../viewModels/sources'

export default function SourceHealth() {
  const { data, loading, error } = useSourcesHealth()
  if (error)             return <ViewMessage tone="error"   text={`Error: ${error.message}`}/>
  if (loading)           return <ViewMessage tone="loading" text="Loading sources health…"/>
  const vm = buildSourcesTabViewModel(data ?? null)

  if (!vm.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <Header overall="unknown" counts={vm.counts} generatedAt={null}/>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No source-health snapshot</div>
          <p className="max-w-md mx-auto">
            The active adapter doesn't expose the Module-24 source-integration layer.
            Run <code className="kbd">npm run server:dev</code> + <code className="kbd">VITE_RESEARCH_ADAPTER=http</code> to see live source health.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Header overall={vm.overall} counts={vm.counts} generatedAt={vm.generatedAt}/>

      {vm.backfillsInFlight.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-slate-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Backfills in flight</span>
          {vm.backfillsInFlight.map((j) => (
            <span key={j.id as unknown as string} className="mr-3">
              {j.sourceKind} · {j.fromIso.slice(0, 10)} → {j.toIso.slice(0, 10)} ({j.state})
            </span>
          ))}
        </div>
      )}

      <section className="panel p-3 flex flex-col gap-2">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-slate-100 text-[13px] font-semibold">Sources ({vm.rows.length})</h3>
            <p className="text-slate-500 text-[11px]">Real-time provider health, freshness, and degraded modes.</p>
          </div>
          <span className="text-[10.5px] text-slate-500">CLI: <code className="kbd">npm run ops -- sources:sync-all</code></span>
        </div>
        <ul className="flex flex-col gap-2">
          {vm.rows.map((r) => (
            <li key={r.source.id as unknown as string}>
              <SourceRow row={r}/>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Header({
  overall, counts, generatedAt,
}: {
  overall: import('../../domain').SourceHealthStatus
  counts: import('../../domain').SourcesHealthSnapshot['counts']
  generatedAt: string | null
}) {
  return (
    <header className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Sources health</h2>
        <p className="text-slate-400 text-[12px]">
          Module 24 — production source integrations. Snapshot {generatedAt ? `as of ${generatedAt.slice(0, 16).replace('T', ' ')} UTC` : 'unavailable'}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <Pill label="Overall" value={overall} tone={overall}/>
        <Stat label="Healthy"   value={counts.healthy}  tone="emerald"/>
        <Stat label="Stale"     value={counts.stale}    tone="amber"/>
        <Stat label="Failing"   value={counts.failing}  tone="rose"/>
        <Stat label="Degraded"  value={counts.degraded} tone="slate"/>
        <Stat label="Unknown"   value={counts.unknown}  tone="slate"/>
      </div>
    </header>
  )
}

function SourceRow({ row }: { row: SourcesTabRowViewModel }) {
  const s = row.source
  return (
    <div className="px-3 py-2 rounded border border-line/10 bg-line/[0.02] flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_STATUS_DOT[s.status]}`}/>
        <span className="text-slate-100 text-[12.5px] font-medium">{s.displayName}</span>
        <span className="chip border border-line/10 text-slate-300 text-[10px]">{s.kind}</span>
        <span className={`chip border text-[10px] uppercase tracking-wider ${SOURCE_STATUS_CLASS[s.status]}`}>{s.status}</span>
        <span className="chip border border-line/10 text-slate-300 text-[10px]">{row.providerLabel}</span>
        <span className="ml-auto text-[10.5px] text-slate-500 num">{row.freshnessLabel} · {row.stalenessLabel}</span>
      </div>

      {s.degraded.reasons.length > 0 && (
        <div className="text-[11px] text-slate-400">
          {s.degraded.reasons.map((r, i) => <div key={i}>· {r}</div>)}
          {s.degraded.affectedModules.length > 0 && (
            <div className="text-[10.5px] text-slate-500 mt-0.5">
              affects: {s.degraded.affectedModules.join(', ')}
            </div>
          )}
        </div>
      )}

      {s.lastError && (
        <div className="text-[11px] text-rose-300">
          last error · [{s.lastError.category}] {s.lastError.message}
          {s.lastError.consecutiveFailures > 1 && (
            <span className="ml-1 text-slate-500">(consecutive failures: {s.lastError.consecutiveFailures})</span>
          )}
        </div>
      )}

      {s.config.baseUrl && (
        <div className="text-[10.5px] text-slate-500 truncate">
          baseUrl: <code className="text-slate-400">{s.config.baseUrl}</code>
          {s.config.tokenEnvName && <span className="ml-2">token env: <code className="text-slate-400">{s.config.tokenEnvName}</code></span>}
        </div>
      )}

      {s.recentRuns.length > 0 && (
        <details className="text-[10.5px] text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">Recent runs ({s.recentRuns.length})</summary>
          <ul className="mt-1 ml-3 flex flex-col gap-0.5">
            {s.recentRuns.slice(0, 5).map((r) => (
              <li key={r.id as unknown as string}>
                <span className="num">{r.startedAt.slice(11, 19)}</span>{' '}
                <span className={r.outcome === 'success' ? 'text-emerald-300' : r.outcome === 'failed' ? 'text-rose-300' : 'text-slate-300'}>
                  {r.outcome}
                </span>{' '}
                fetched={r.fetchedCount} new={r.newCount} ({r.durationMs}ms, {r.trigger})
                {r.error && <span className="text-rose-400 ml-1">· {r.error.category}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {s.recentBackfills.length > 0 && (
        <details className="text-[10.5px] text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">Recent backfills ({s.recentBackfills.length})</summary>
          <ul className="mt-1 ml-3 flex flex-col gap-0.5">
            {s.recentBackfills.slice(0, 5).map((b) => (
              <li key={b.id as unknown as string}>
                {b.fromIso.slice(0, 10)} → {b.toIso.slice(0, 10)} · {b.state} · fetched={b.fetchedCount}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Pill({ label, value, tone }: {
  label: string; value: string; tone: import('../../domain').SourceHealthStatus
}) {
  return (
    <div className={`flex items-baseline gap-1.5 px-2 py-1 rounded border ${SOURCE_STATUS_CLASS[tone]}`}>
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-[12px] font-semibold uppercase tracking-wider">{value}</span>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-300'
    : tone === 'amber'   ? 'text-amber-300'
    : tone === 'rose'    ? 'text-rose-300'
    :                       'text-slate-200'
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`num text-[12px] font-semibold ${toneClass}`}>{value}</span>
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
