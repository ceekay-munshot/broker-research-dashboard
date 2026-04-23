import type { ReportId } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { SectorTileViewModel } from '../../viewModels/sectorFeed'
import { useSectorFeedViewModel } from '../../viewModels/sectorFeed'
import { STANCE_TEXT_COLOR, formatShortDate } from '../../viewModels/shared'

interface SectorFeedProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
}

export default function SectorFeed({ filters, onSelectReport }: SectorFeedProps) {
  const { data, loading, error } = useSectorFeedViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading sector feed…"/>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Sector Feed</h2>
        <p className="text-slate-400 text-[12px]">Rolling broker intelligence aggregated into sectors. Sentiment is a volume-weighted stance score across notes in the range.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {data.tiles.map((t) => (
          <SectorTile key={t.sectorId} tile={t} onSelectReport={onSelectReport}/>
        ))}
      </div>
    </div>
  )
}

function SectorTile({ tile, onSelectReport }: { tile: SectorTileViewModel; onSelectReport: (id: ReportId) => void }) {
  const positive = tile.sentimentScore >= 0
  const pct = Math.round((tile.sentimentScore + 1) * 50)
  return (
    <article className="panel p-4 flex flex-col gap-3">
      <header className="flex items-start justify-between">
        <div>
          <div className="section-title">Sector</div>
          <h3 className="text-slate-100 text-[14px] font-semibold">{tile.name}</h3>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10.5px] uppercase tracking-widest text-slate-500">Sentiment</span>
          <span className={`num text-[13px] font-semibold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {positive ? '+' : ''}{(tile.sentimentScore * 100).toFixed(0)}
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3 text-[11px]">
        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full ${positive ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`} style={{ width: `${pct}%` }}/>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Reports</span>
        <span className="num text-slate-200">{tile.reportCount.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Aggregate stance</span>
        <span className={`capitalize ${STANCE_TEXT_COLOR[tile.aggregateStance]}`}>{tile.aggregateStance}</span>
      </div>

      {tile.topThemes.length > 0 && (
        <div>
          <div className="section-title mb-1.5">Themes</div>
          <div className="flex flex-wrap gap-1.5">
            {tile.topThemes.slice(0, 4).map((t) => (
              <span key={t.theme} className={`chip bg-white/[0.04] border border-white/5 ${STANCE_TEXT_COLOR[t.stanceLean]}`}>
                {t.theme}<span className="text-slate-500 num ml-1">·{t.mentions}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="section-title mb-1.5">Broker intelligence flow</div>
        <ul className="flex flex-col gap-1.5">
          {tile.recentReports.length === 0 && <li className="text-[11.5px] text-slate-500">No recent notes.</li>}
          {tile.recentReports.map((r) => (
            <li key={r.reportId}>
              <button
                onClick={() => onSelectReport(r.reportId)}
                className="w-full text-left flex items-start gap-2 text-[11.5px] leading-tight hover:text-slate-100 transition-colors"
              >
                <span className="num text-[10px] text-slate-500 w-12 pt-0.5">{formatShortDate(r.publishedAt)}</span>
                {r.ticker && (
                  <span className="chip border border-white/10 text-slate-200 shrink-0">{r.ticker}</span>
                )}
                <span className="text-slate-400 shrink-0">{r.brokerShortName}</span>
                <span className={`flex-1 truncate ${STANCE_TEXT_COLOR[r.stance]}`} title={r.headline}>{r.headline}</span>
              </button>
            </li>
          ))}
        </ul>
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
