import type { ReportId, StockTicker } from '../../domain'
import type { ResultantState, StrengthBand, SectorSignalClassification } from '../../engine/types'
import type { FiltersState } from '../../app/filters'
import type {
  SectorTileViewModel, SectorSignalVM, SectorResultantEntryVM,
} from '../../viewModels/sectorFeed'
import { useSectorFeedViewModel } from '../../viewModels/sectorFeed'
import { STANCE_TEXT_COLOR, formatShortDate } from '../../viewModels/shared'

interface SectorFeedProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function SectorFeed({ filters, onSelectReport, onSelectTicker }: SectorFeedProps) {
  const { data, loading, error } = useSectorFeedViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading sector feed…"/>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Sector Feed</h2>
        <p className="text-slate-400 text-[12px]">
          Accumulated broker intelligence per sector. Signals are classified as repeated-sector
          (multiple names · multiple brokers), single-name, broker-specific, or unresolved debate.
          The stock-state chips show each ticker's current resultant state.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {data.tiles.map((t) => (
          <SectorTile
            key={t.sectorId}
            tile={t}
            onSelectReport={onSelectReport}
            onSelectTicker={onSelectTicker}
          />
        ))}
      </div>
    </div>
  )
}

function SectorTile({ tile, onSelectReport, onSelectTicker }: {
  tile: SectorTileViewModel;
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
}) {
  const positive = tile.sentimentScore >= 0
  const pct = Math.round((tile.sentimentScore + 1) * 50)
  return (
    <article className="panel p-4 flex flex-col gap-3">
      <header className="flex items-start justify-between">
        <div>
          <div className="section-title">Sector</div>
          <h3 className="text-slate-100 text-[14px] font-semibold">{tile.name}</h3>
          <div className="text-[10px] text-slate-500 num mt-0.5">
            {tile.reportCount} report{tile.reportCount === 1 ? '' : 's'}
            {' · '}{tile.tickerCount} ticker{tile.tickerCount === 1 ? '' : 's'}
            {' · '}{tile.brokerCount} broker{tile.brokerCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10.5px] uppercase tracking-widest text-slate-500">Sentiment</span>
          <span className={`num text-[13px] font-semibold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {positive ? '+' : ''}{(tile.sentimentScore * 100).toFixed(0)}
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3 text-[11px]">
        <div className="flex-1 h-1 rounded-full bg-line/5 overflow-hidden">
          <div className={`h-full ${positive ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`} style={{ width: `${pct}%` }}/>
        </div>
      </div>

      {tile.resultantStates.length > 0 && (
        <div>
          <div className="section-title mb-1.5">Stock states</div>
          <div className="flex flex-wrap gap-1">
            {tile.resultantStates.map((r) => (
              <StockStateChip
                key={r.ticker}
                entry={r}
                onClick={() => onSelectTicker(r.ticker)}
              />
            ))}
          </div>
        </div>
      )}

      {tile.signals.length > 0 && (
        <div>
          <div className="section-title mb-1.5">Signals</div>
          <ul className="flex flex-col gap-1.5">
            {tile.signals.map((s, idx) => <SignalRow key={idx} signal={s}/>)}
          </ul>
        </div>
      )}

      {tile.recentReports.length > 0 && (
        <div>
          <div className="section-title mb-1.5">Recent intelligence</div>
          <ul className="flex flex-col gap-1.5">
            {tile.recentReports.map((r) => (
              <li key={r.reportId}>
                <button
                  onClick={() => onSelectReport(r.reportId)}
                  className="w-full text-left flex items-start gap-2 text-[11.5px] leading-tight hover:text-slate-100 transition-colors"
                >
                  <span className="num text-[10px] text-slate-500 w-12 pt-0.5">{formatShortDate(r.publishedAt)}</span>
                  {r.ticker && (
                    <span className="chip border border-line/10 text-slate-200 shrink-0">{r.ticker}</span>
                  )}
                  <span className="text-slate-400 shrink-0">{r.brokerShortName}</span>
                  <span className={`flex-1 truncate ${STANCE_TEXT_COLOR[r.stance]}`} title={r.headline}>{r.headline}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

const CLASS_COLOR: Readonly<Record<SectorSignalClassification, string>> = {
  repeated_sector:   'border-emerald-500/40 text-emerald-300',
  unresolved_debate: 'border-amber-500/50 text-amber-300',
  broker_specific:   'border-slate-500/40 text-slate-300',
  single_name:       'border-slate-500/30 text-slate-400',
}

function SignalRow({ signal }: { signal: SectorSignalVM }) {
  const stanceColor = signal.stanceLean === 'bullish' ? 'text-emerald-400'
    : signal.stanceLean === 'bearish' ? 'text-rose-400' : 'text-slate-300'
  return (
    <li className="flex flex-col gap-1 rounded border border-line/5 bg-line/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`chip border ${CLASS_COLOR[signal.classification]} text-[9px]`}>
            {signal.classificationLabel}
          </span>
          <span className={`text-[12.5px] font-medium truncate ${stanceColor}`} title={signal.theme}>
            {signal.theme}
          </span>
        </div>
        <span className="num text-[10px] text-slate-500 shrink-0">
          {signal.mentionCount}× · last {formatShortDate(signal.lastSeen)}
        </span>
      </div>
      <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-400">{signal.tickers.slice(0, 4).join(' · ')}</span>
        {signal.tickers.length > 4 && <span>+{signal.tickers.length - 4}</span>}
        <span className="text-slate-700">·</span>
        <span>{signal.brokerNames.join(', ')}</span>
        {signal.citationCount > 0 && (
          <>
            <span className="text-slate-700">·</span>
            <span className="num">{signal.citationCount} citations</span>
          </>
        )}
      </div>
    </li>
  )
}

const STATE_COLOR: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'border-emerald-500/50 text-emerald-300 bg-emerald-500/[0.06]',
  consensus_bearish:   'border-rose-500/50 text-rose-300 bg-rose-500/[0.06]',
  mixed_constructive:  'border-emerald-400/30 text-emerald-300 bg-emerald-500/[0.03]',
  mixed_cautious:      'border-rose-400/30 text-rose-300 bg-rose-500/[0.03]',
  unresolved:          'border-slate-400/30 text-slate-300 bg-line/[0.02]',
  outlier_driven:      'border-amber-500/40 text-amber-300 bg-amber-500/[0.04]',
}

const STATE_SHORT_LABEL: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'Bull',
  consensus_bearish:   'Bear',
  mixed_constructive:  'Mixed+',
  mixed_cautious:      'Mixed−',
  unresolved:          'Unrsvd',
  outlier_driven:      'OL',
}

function StockStateChip({ entry, onClick }: { entry: SectorResultantEntryVM; onClick: () => void }) {
  const strengthTone: Readonly<Record<StrengthBand, string>> = {
    strong:   'opacity-100',
    moderate: 'opacity-80',
    weak:     'opacity-60',
  }
  return (
    <button
      onClick={onClick}
      title={`${entry.ticker} · ${entry.state} · ${entry.strength}`}
      className={`chip border ${STATE_COLOR[entry.state]} ${strengthTone[entry.strength]} text-[10px] hover:brightness-125`}
    >
      <span className="font-semibold">{entry.ticker}</span>
      <span className="text-slate-500 mx-1">·</span>
      <span className="text-[9px] tracking-widest uppercase">{STATE_SHORT_LABEL[entry.state]}</span>
    </button>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
