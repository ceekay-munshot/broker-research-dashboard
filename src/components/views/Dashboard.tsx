import type { ReportId } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useDashboardViewModel } from '../../viewModels/dashboard'
import KpiCards from '../KpiCards'
import { STANCE_TEXT_COLOR, RATING_TEXT_COLOR, formatShortDate } from '../../viewModels/shared'

interface DashboardProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
}

export default function Dashboard({ filters, onSelectReport }: DashboardProps) {
  const { data, loading, error } = useDashboardViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error loading dashboard: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading dashboard…"/>

  return (
    <div className="flex flex-col gap-5">
      <KpiCards kpis={data.kpis}/>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 panel p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Rolling research feed</h2>
              <p className="text-slate-400 text-[12px]">Most recent normalized reports across all tracked brokers.</p>
            </div>
            <span className="text-[11px] text-slate-500 num">{data.rollingFeed.length} items</span>
          </div>
          <ul className="flex flex-col divide-y divide-white/5">
            {data.rollingFeed.map((item) => (
              <li key={item.reportId}>
                <button
                  onClick={() => onSelectReport(item.reportId)}
                  className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-white/[0.02] transition-colors rounded px-2 -mx-2"
                >
                  <span className="num text-[10.5px] text-slate-500 w-12 pt-1">{formatShortDate(item.publishedAt)}</span>
                  <span
                    className="w-5 h-5 rounded-sm flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-ink-950 mt-0.5"
                    style={{ background: item.brokerColor ?? '#94a3b8' }}
                  >{item.brokerShortName.slice(0, 3).toUpperCase()}</span>
                  {item.ticker && (
                    <span className="chip border border-white/10 text-slate-200 shrink-0 mt-0.5">{item.ticker}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12.5px] font-medium truncate ${STANCE_TEXT_COLOR[item.stance]}`}>
                      {item.headline}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{item.thesisOneLiner}</div>
                  </div>
                  {item.rating && (
                    <span className={`text-[10.5px] shrink-0 ${RATING_TEXT_COLOR[item.rating]}`}>{item.rating}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5 flex flex-col gap-3">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Ingestion</h2>
            <p className="text-slate-400 text-[12px]">Inbound pipeline status.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <IngestionStat label="Queued" value={data.ingestion.queued}/>
            <IngestionStat label="Processing" value={data.ingestion.processing}/>
            <IngestionStat label="Ready · 24h" value={data.ingestion.readyLast24h}/>
            <IngestionStat label="Failed · 24h" value={data.ingestion.failedLast24h}
              valueClass={data.ingestion.failedLast24h > 0 ? 'text-rose-400' : ''}/>
          </dl>
          <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Throughput</span>
            <span className="num text-slate-200">{data.ingestion.throughputPerHour} / hour</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function IngestionStat({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="section-title">{label}</dt>
      <dd className={`num text-[22px] font-semibold leading-none mt-1 ${valueClass ?? 'text-slate-100'}`}>
        {value.toLocaleString()}
      </dd>
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
