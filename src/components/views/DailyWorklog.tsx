import { useMemo, useState } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { WorklogItem, WorklogFiltersState } from '../../viewModels/worklog'
import { DEFAULT_WORKLOG_FILTERS } from '../../viewModels/worklog'
import { useDailyWorklogViewModel } from '../../hooks/useWorklogViewModel'
import WorklogHeader from '../worklog/WorklogHeader'
import WorklogFilters from '../worklog/WorklogFilters'
import WorklogCard from '../worklog/WorklogCard'
import WorklogDetail from '../worklog/WorklogDetail'

interface DailyWorklogProps {
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onOpenDivergence: () => void
}

export default function DailyWorklog({ onSelectReport, onSelectTicker, onOpenDivergence }: DailyWorklogProps) {
  const [filters, setFilters] = useState<WorklogFiltersState>(DEFAULT_WORKLOG_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, loading, error } = useDailyWorklogViewModel(filters)

  const selected = useMemo<WorklogItem | null>(() => {
    if (!data || !selectedId) return null
    return data.items.find((i) => i.id === selectedId) ?? null
  }, [data, selectedId])

  if (error) {
    return (
      <ViewMessage tone="error" text={`Error loading worklog: ${error.message}`}/>
    )
  }
  if (loading || !data) {
    return <ViewMessage tone="loading" text="Loading today's worklog…"/>
  }

  const hasItems = data.items.length > 0
  const hasAny = data.summary.totalItems > 0 || data.summary.totalItemsRaw > 0

  return (
    <div className="flex flex-col gap-4">
      <WorklogHeader summary={data.summary}/>

      <WorklogFilters
        filters={filters}
        setFilters={setFilters}
        brokerCount={0}
        tickerCount={0}
      />

      {data.degradations.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-amber-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Degraded</span>
          {data.degradations.join('  ·  ')}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4">
        {/* List */}
        <div className="panel p-3 flex flex-col gap-3 min-w-0">
          {!hasAny && (
            <EmptyState
              title="No research landed today"
              body="Nothing has arrived in today's window. Switch to 3d or 7d to see a longer horizon, or check ingestion status."
            />
          )}
          {hasAny && !hasItems && (
            <EmptyState
              title="No items match the active filters"
              body="Relax a filter chip above, or widen the date window."
            />
          )}
          {hasItems && data.groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] uppercase tracking-widest text-slate-500">{group.label}</h3>
                <span className="text-[11px] text-slate-600 num">{group.items.length}</span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <WorklogCard
                      item={item}
                      selected={selectedId === item.id}
                      onClick={() => setSelectedId(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Detail rail */}
        <div className="min-w-0">
          {selected ? (
            <WorklogDetail
              item={selected}
              onOpenReport={() => onSelectReport(selected.reportId)}
              onOpenStock={() => { if (selected.ticker) onSelectTicker(selected.ticker) }}
              onOpenDivergence={onOpenDivergence}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <aside className="panel p-5 text-slate-500 text-[12px] sticky top-4">
              <p className="mb-2">Select a worklog item to preview its summary, evidence, priority rationale, and lineage.</p>
              <p className="text-slate-600 text-[11px]">High-priority items are surfaced first.</p>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-10 px-6 text-center">
      <div className="text-slate-200 font-medium text-[13px]">{title}</div>
      <div className="text-slate-500 text-[12px] mt-1 max-w-md mx-auto">{body}</div>
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
