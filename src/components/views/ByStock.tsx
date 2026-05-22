import { useState } from 'react'
import type { ReportId, BrokerId, StockTicker } from '../../domain'
import type { ResultantState, StrengthBand } from '../../engine/types'
import type { FiltersState } from '../../app/filters'
import type { OpinionCell, ByStockRowViewModel, StockView } from '../../viewModels/byStock'
import { useByStockViewModel } from '../../viewModels/byStock'
import { RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import { useAdapterQuery } from '../../hooks/useAdapterQuery'
import StockBrokerChanges from '../stock/StockBrokerChanges'
import { ARB_LABEL, ARB_COLOR, ARB_TOOLTIP, type ArbVerdict, type ConsensusRating } from '../../viewModels/arb'

interface ByStockProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function ByStock({ filters, onSelectReport, onSelectTicker }: ByStockProps) {
  const [view, setView] = useState<StockView>('contested')
  const { data, loading, error } = useByStockViewModel(filters, view)
  const [focusTicker, setFocusTicker] = useState<StockTicker | null>(null)

  // Shared catalogs for the change-rail builder.
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const stocks  = useAdapterQuery((a, s) => a.listStocks(s), [])

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-stock view…"/>

  // Default the change rail to the first row so the analyst always sees
  // something without extra clicks.
  const activeTicker = focusTicker ?? data.rows[0]?.ticker ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Stock</h2>
          <p className="text-slate-400 text-[12px]">
            What every broker says on each stock — rating, price target, and an ARB verdict
            for how much the Street disagrees. Click a stock for the full breakdown.
          </p>
        </div>
        <ViewSelector view={view} setView={setView} showPortfolio={data.hasPortfolio}/>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1180px] text-[12px]">
          <thead className="bg-line/[0.02] border-b border-line/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 z-10 bg-ink-900 border-r border-line/10">Ticker</th>
              <th className="px-3 py-2 font-medium">Street state</th>
              <th className="px-3 py-2 font-medium text-right">Avg target</th>
              <th className="px-3 py-2 font-medium">ARB verdict</th>
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
                onSelectTicker={(t) => { setFocusTicker(t); onSelectTicker(t) }}
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
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/40"/> outlier target</div>
        <span className="text-slate-700">·</span>
        {(['high', 'moderate', 'low'] as const).map((b) => (
          <span key={b} className={`chip border ${ARB_COLOR[b]} text-[9px]`}>{ARB_LABEL[b]}</span>
        ))}
      </div>

      {activeTicker && brokers.data && stocks.data && (
        <>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 -mb-2">
            <span className="section-title">Focus ticker</span>
            <div className="flex gap-1">
              {data.rows.slice(0, 8).map((row) => (
                <button
                  key={row.ticker}
                  onClick={() => setFocusTicker(row.ticker)}
                  className={`chip border text-[10.5px] ${activeTicker === row.ticker ? 'border-accent/40 text-accent bg-accent/10' : 'border-line/10 text-slate-400 hover:text-slate-200'}`}
                >{row.ticker}</button>
              ))}
            </div>
          </div>
          <StockBrokerChanges
            ticker={activeTicker}
            brokers={brokers.data}
            stocks={stocks.data}
            onSelectReport={onSelectReport}
          />
        </>
      )}
    </div>
  )
}

// ─── View selector ────────────────────────────────────────────────────
// Re-sorts the matrix only — no row is ever hidden. "My portfolio" appears
// solely when a portfolio is loaded.

const STOCK_VIEWS: readonly { readonly id: StockView; readonly label: string; readonly portfolioOnly?: boolean }[] = [
  { id: 'most-covered', label: 'Most covered' },
  { id: 'consensus',    label: 'Consensus' },
  { id: 'contested',    label: 'ARB severity' },
  { id: 'portfolio',    label: 'My portfolio', portfolioOnly: true },
]

function ViewSelector({ view, setView, showPortfolio }: {
  view: StockView;
  setView: (v: StockView) => void;
  showPortfolio: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="section-title mr-0.5">View</span>
      {STOCK_VIEWS.filter((v) => showPortfolio || !v.portfolioOnly).map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`px-2.5 py-1 text-[11px] rounded border transition-colors
            ${view === v.id
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'bg-line/[0.02] border-line/5 text-slate-300 hover:bg-line/[0.05] hover:border-line/10'}`}
        >{v.label}</button>
      ))}
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
    <tr className={`border-b border-line/5 ${zebra ? 'bg-line/[0.01]' : ''}`}>
      <td className="px-3 py-2 sticky left-0 z-10 bg-ink-900 border-r border-line/10">
        <button
          onClick={() => onSelectTicker(row.ticker)}
          className="flex flex-col text-left hover:text-accent transition-colors"
        >
          <span className="text-slate-100 font-semibold hover:text-accent">{row.ticker}</span>
          <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{row.stockName}</span>
        </button>
      </td>
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
      <td className="px-3 py-2 num text-right text-slate-100">
        {formatPrice(row.avgTarget, row.currency, 0)}
      </td>
      <td className="px-3 py-2">
        <ArbVerdictCell verdict={row.arbVerdict} consensusRating={row.consensusRating}/>
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
        className="text-left w-full hover:bg-line/[0.02] rounded transition-colors px-1 -mx-1 py-0.5"
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
        </div>
        <span className="num text-[9.5px] text-slate-500">{cell.lastUpdatedAt.slice(5, 10)}</span>
      </button>
    </td>
  )
}

// ─── ARB verdict cell ─────────────────────────────────────────────────

function ArbVerdictCell({ verdict, consensusRating }: {
  verdict: ArbVerdict;
  consensusRating: ConsensusRating;
}) {
  const isNone = verdict.band === 'none'
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`chip border ${ARB_COLOR[verdict.band]} text-[10px] w-fit ${isNone ? '' : 'cursor-help'}`}
        title={isNone ? undefined : ARB_TOOLTIP}
      >{ARB_LABEL[verdict.band]}</span>
      <ConsensusRatingLine cr={consensusRating}/>
      <span className="text-[10px] text-slate-500 num">{verdict.subtext}</span>
    </div>
  )
}

function ConsensusRatingLine({ cr }: { cr: ConsensusRating }) {
  if (cr.kind === 'none') {
    return <span className="text-[10.5px] text-slate-500">No rating issued</span>
  }
  if (cr.kind === 'tie') {
    return <span className="text-[10.5px] text-amber-300">Mixed ratings</span>
  }
  const unanimous = cr.agree === cr.total && cr.total > 1
  return (
    <span className="text-[10.5px] text-slate-300">
      {unanimous ? 'Unanimous ' : 'Consensus '}
      <span className={RATING_TEXT_COLOR[cr.rating]}>{cr.rating}</span>
      <span className="text-slate-500 num"> · {cr.agree}/{cr.total}</span>
    </span>
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
  unresolved:          'border-slate-400/30 text-slate-300 bg-line/[0.02]',
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
