import type { ReportId, BrokerId, StockTicker } from '../../domain'
import type { ResultantState, StrengthBand } from '../../engine/types'
import type { FiltersState } from '../../app/filters'
import type { OpinionCell, ByStockRowViewModel } from '../../viewModels/byStock'
import { useByStockViewModel } from '../../viewModels/byStock'
import { RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'

interface ByStockProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function ByStock({ filters, onSelectReport, onSelectTicker }: ByStockProps) {
  const { data, loading, error } = useByStockViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-stock view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Stock</h2>
          <p className="text-slate-400 text-[12px]">
            Opinions matrix with per-ticker resultant state and outlier detection (&gt;1.25σ).
            Click a ticker for the full conflict closure, or a target cell to open the source report.
          </p>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1060px] text-[12px]">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 bg-ink-900/70 z-10">Ticker</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium">Street state</th>
              <th className="px-3 py-2 font-medium text-right">Spot</th>
              <th className="px-3 py-2 font-medium text-right">Avg target</th>
              <th className="px-3 py-2 font-medium text-right">Spread</th>
              {data.brokers.map((b) => (
                <th key={b.id} className="px-2 py-2 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.brandColor ?? '#94a3b8' }}/>
                    <span className="uppercase tracking-wider text-[10.5px]">{b.shortName}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <StockRow
                key={row.ticker}
                row={row}
                zebra={idx % 2 === 1}
                brokerColumnIds={data.brokers.map((b) => b.id)}
                onSelectReport={onSelectReport}
                onSelectTicker={onSelectTicker}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5"><StateBadge state="consensus_bullish" strength="strong" compact/> consensus bullish</div>
        <div className="flex items-center gap-1.5"><StateBadge state="consensus_bearish" strength="strong" compact/> consensus bearish</div>
        <div className="flex items-center gap-1.5"><StateBadge state="mixed_constructive" strength="moderate" compact/> mixed · constructive tilt</div>
        <div className="flex items-center gap-1.5"><StateBadge state="outlier_driven" strength="moderate" compact/> outlier-driven</div>
        <div className="flex items-center gap-1.5"><StateBadge state="unresolved" strength="weak" compact/> unresolved</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/40"/> outlier target (&gt;1.25σ)</div>
      </div>
    </div>
  )
}

function StockRow({ row, zebra, brokerColumnIds, onSelectReport, onSelectTicker }: {
  row: ByStockRowViewModel;
  zebra: boolean;
  brokerColumnIds: readonly BrokerId[];
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
}) {
  return (
    <tr className={`border-b border-white/5 ${zebra ? 'bg-white/[0.01]' : ''}`}>
      <td className="px-3 py-2 sticky left-0 bg-ink-900/70 z-10">
        <button
          onClick={() => onSelectTicker(row.ticker)}
          className="flex flex-col text-left hover:text-accent transition-colors"
        >
          <span className="text-slate-100 font-semibold hover:text-accent">{row.ticker}</span>
          <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{row.stockName}</span>
        </button>
      </td>
      <td className="px-3 py-2 text-slate-300 text-[11.5px]">{row.sectorName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <StateBadge state={row.resultantState} strength={row.resultantStrength}/>
          <span className="text-[10px] text-slate-500 num">
            {row.brokerCount} broker{row.brokerCount === 1 ? '' : 's'}
            {row.outlierBrokerIds.length > 0 && (
              <span className="text-amber-400"> · {row.outlierBrokerIds.length} outlier{row.outlierBrokerIds.length === 1 ? '' : 's'}</span>
            )}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 num text-right text-slate-200">
        {formatPrice(row.spotPrice, row.currency, 2)}
      </td>
      <td className="px-3 py-2 num text-right">
        <div className="flex flex-col items-end">
          <span className="text-slate-100">
            {formatPrice(row.avgTarget, row.currency, 0)}
          </span>
          {row.consensusUpsidePct !== null && (
            <span className={`text-[10px] ${row.consensusUpsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.consensusUpsidePct >= 0 ? '+' : ''}{row.consensusUpsidePct.toFixed(1)}%
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 num text-right text-slate-300">
        {row.spreadPct !== null ? `${row.spreadPct.toFixed(0)}%` : '—'}
      </td>
      {brokerColumnIds.map((bid) => (
        <TargetCell
          key={bid}
          cell={row.opinionsByBroker[bid]}
          onSelectReport={onSelectReport}
        />
      ))}
    </tr>
  )
}

function TargetCell({ cell, onSelectReport }: { cell: OpinionCell | undefined; onSelectReport: (id: ReportId) => void }) {
  if (!cell) return <td className="px-2 py-2 text-[11.5px] text-slate-600">—</td>
  return (
    <td className={`px-2 py-2 align-top ${cell.outlier ? 'bg-amber-500/[0.06]' : ''}`}>
      <button
        onClick={() => onSelectReport(cell.lastReportId)}
        className="text-left w-full hover:bg-white/[0.02] rounded transition-colors px-1 -mx-1 py-0.5"
      >
        <div className="flex items-center gap-1.5">
          <span className={`num text-[12.5px] font-semibold ${cell.outlier ? 'text-amber-300' : 'text-slate-100'}`}>
            {formatPrice(cell.targetPrice, cell.targetCurrency, 0)}
          </span>
          {cell.targetDelta !== null && cell.targetDelta !== 0 && (
            <span className={`num text-[10px] ${cell.targetDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {cell.targetDelta > 0 ? '+' : ''}{cell.targetDelta}
            </span>
          )}
          {cell.outlier && <span className="chip text-[9px] border border-amber-500/40 text-amber-300">OUT</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {cell.rating && (
            <span className={`text-[10.5px] ${RATING_TEXT_COLOR[cell.rating]}`}>{cell.rating}</span>
          )}
          {cell.impliedUpsidePct !== null && (
            <span className={`num text-[10px] ${cell.impliedUpsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {cell.impliedUpsidePct >= 0 ? '+' : ''}{cell.impliedUpsidePct.toFixed(1)}%
            </span>
          )}
        </div>
        <span className="num text-[9.5px] text-slate-500">{cell.lastUpdatedAt.slice(5, 10)}</span>
      </button>
    </td>
  )
}

// ─── Shared state badge ───────────────────────────────────────────────

const STATE_LABEL: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'Consensus · Bull',
  consensus_bearish:   'Consensus · Bear',
  mixed_constructive:  'Mixed · Bull tilt',
  mixed_cautious:      'Mixed · Bear tilt',
  unresolved:          'Unresolved',
  outlier_driven:      'Outlier-driven',
}

const STATE_COLOR: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'border-emerald-500/50 text-emerald-300 bg-emerald-500/[0.06]',
  consensus_bearish:   'border-rose-500/50 text-rose-300 bg-rose-500/[0.06]',
  mixed_constructive:  'border-emerald-400/30 text-emerald-300 bg-emerald-500/[0.03]',
  mixed_cautious:      'border-rose-400/30 text-rose-300 bg-rose-500/[0.03]',
  unresolved:          'border-slate-400/30 text-slate-300 bg-white/[0.02]',
  outlier_driven:      'border-amber-500/40 text-amber-300 bg-amber-500/[0.04]',
}

function StateBadge({ state, strength, compact }: { state: ResultantState; strength: StrengthBand; compact?: boolean }) {
  return (
    <span
      className={`chip border ${STATE_COLOR[state]} inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'}`}
      title={`${STATE_LABEL[state]} · ${strength} strength`}
    >
      <span>{STATE_LABEL[state]}</span>
      {!compact && <span className="text-slate-500">·</span>}
      {!compact && <span className="uppercase tracking-widest text-[9px] text-slate-500">{strength}</span>}
    </span>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
