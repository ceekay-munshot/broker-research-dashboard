import type { ReportId, BrokerId } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { OpinionCell, ByStockRowViewModel } from '../../viewModels/byStock'
import { useByStockViewModel } from '../../viewModels/byStock'
import { RATING_TEXT_COLOR } from '../../viewModels/shared'

interface ByStockProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
}

export default function ByStock({ filters, onSelectReport }: ByStockProps) {
  const { data, loading, error } = useByStockViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-stock view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Stock</h2>
          <p className="text-slate-400 text-[12px]">Opinions matrix — target prices, ratings and implied upside across the Street. Outliers {`>1.25σ`} highlighted.</p>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 bg-ink-900/70 z-10">Ticker</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium text-right">Spot</th>
              <th className="px-3 py-2 font-medium text-right">Avg target</th>
              <th className="px-3 py-2 font-medium text-right">Spread σ</th>
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
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/40"/> Outlier target (&gt;1.25σ from Street average)</div>
        <div className="flex items-center gap-1.5"><span className="text-emerald-400">+Δ</span> target upgrade vs prior</div>
        <div className="flex items-center gap-1.5"><span className="text-rose-400">-Δ</span> target downgrade</div>
      </div>
    </div>
  )
}

function StockRow({ row, zebra, brokerColumnIds, onSelectReport }: {
  row: ByStockRowViewModel;
  zebra: boolean;
  brokerColumnIds: readonly BrokerId[];
  onSelectReport: (id: ReportId) => void;
}) {
  return (
    <tr className={`border-b border-white/5 ${zebra ? 'bg-white/[0.01]' : ''}`}>
      <td className="px-3 py-2 sticky left-0 bg-ink-900/70 z-10">
        <div className="flex flex-col">
          <span className="text-slate-100 font-semibold">{row.ticker}</span>
          <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{row.stockName}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-slate-300 text-[11.5px]">{row.sectorName}</td>
      <td className="px-3 py-2 num text-right text-slate-200">
        {row.spotPrice !== null ? `$${row.spotPrice.toFixed(2)}` : '—'}
      </td>
      <td className="px-3 py-2 num text-right">
        <div className="flex flex-col items-end">
          <span className="text-slate-100">
            {row.avgTarget !== null ? `$${row.avgTarget.toFixed(0)}` : '—'}
          </span>
          {row.consensusUpsidePct !== null && (
            <span className={`text-[10px] ${row.consensusUpsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.consensusUpsidePct >= 0 ? '+' : ''}{row.consensusUpsidePct.toFixed(1)}%
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 num text-right text-slate-300">
        {row.spreadSigma !== null ? `±${row.spreadSigma.toFixed(0)}` : '—'}
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
            {cell.targetPrice !== null ? `$${cell.targetPrice.toLocaleString()}` : '—'}
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

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
