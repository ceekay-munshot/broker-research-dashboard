import { useState } from 'react'
import type { ReportId, BrokerId, StockTicker } from '../../domain'
import type { ResultantState, StrengthBand } from '../../engine/types'
import type { FiltersState } from '../../app/filters'
import type { OpinionCell, ByStockRowViewModel, StockView } from '../../viewModels/byStock'
import { useByStockViewModel } from '../../viewModels/byStock'
import { RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import { useStockPrices, type PriceCell } from '../../hooks/useStockPrices'
import CmpCell from '../cells/CmpCell'
import { ARB_LABEL, ARB_COLOR, ARB_TOOLTIP, type ArbVerdict, type ConsensusRating } from '../../viewModels/arb'
import { RESULTANT_STATE_LABEL, formatConsensusRating } from '../../lib/signalVocab'
import {
  RESULTANT_STATE_CHIP_CLASS as STATE_COLOR, BROKER_DOT_CLASS,
  TONE_TEXT_CLASS, getChangeTone,
} from '../../lib/semanticColor'

interface ByStockProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function ByStock({ filters, onSelectReport, onSelectTicker }: ByStockProps) {
  const [view, setView] = useState<StockView>('contested')
  const { data, loading, error } = useByStockViewModel(filters, view)

  // Live CMP fetch — called unconditionally (hooks rule) with a null-safe
  // ticker list. Empty list = no-op inside the hook.
  const cmpTickers = data?.rows.map((r) => r.ticker as string) ?? []
  const { prices, refetch: refetchCmp, lastFetchedAt } = useStockPrices(cmpTickers)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-stock view…"/>

  // Rating filter — display-only. We apply it at the per-cell render gate
  // and the row-visibility gate, never at the closure-computation level.
  // Street View (state badge, ARB, ConsensusRating, Avg target) is always
  // full-Street: those derivations reflect every broker covering the
  // stock, not just the selected ratings. A tooltip on the state badge
  // makes the distinction explicit while a filter is active.
  const ratingFilter = new Set<string>(filters.ratings as readonly string[])
  const ratingFilterActive = ratingFilter.size > 0

  const visibleRows = ratingFilterActive
    ? data.rows.filter((row) =>
        data.brokers.some((b) => {
          const cell = row.opinionsByBroker[b.id]
          return cell && cell.rating !== null && ratingFilter.has(cell.rating)
        }))
    : data.rows

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Stock</h2>
          <p className="text-slate-400 text-[12px]">
            What every broker says on each stock — rating, price target, and how much the Street
            disagrees. Click a stock for the full breakdown.
          </p>
        </div>
        <ViewSelector view={view} setView={setView} showPortfolio={data.hasPortfolio}/>
      </div>

      <div className="panel overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full min-w-[1260px] text-[12px]">
          <thead className="border-b border-line/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 top-0 z-30 bg-ink-800 border-r border-line/10">Ticker</th>
              <th className="px-3 py-2 font-medium sticky top-0 z-20 bg-ink-800">Street state</th>
              <th className="px-3 py-2 font-medium text-right sticky top-0 z-20 bg-ink-800">
                <div className="flex items-center justify-end gap-1.5">
                  <span>CMP</span>
                  <RefreshCmpButton onClick={refetchCmp} fetchedAt={lastFetchedAt}/>
                </div>
              </th>
              <th className="px-3 py-2 font-medium text-right sticky top-0 z-20 bg-ink-800">Avg target</th>
              <th className="px-3 py-2 font-medium sticky top-0 z-20 bg-ink-800">Disagreement</th>
              {data.brokers.map((b) => (
                <th key={b.id} className="px-2 py-2 font-medium sticky top-0 z-20 bg-ink-800">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${BROKER_DOT_CLASS}`}/>
                    <span className="uppercase tracking-wider text-[10.5px]">{b.shortName}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => (
              <StockRow
                key={row.ticker}
                row={row}
                zebra={idx % 2 === 1}
                brokerColumnIds={data.brokers.map((b) => b.id)}
                cmp={prices.get(row.ticker)}
                ratingFilter={ratingFilterActive ? ratingFilter : null}
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
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/40"/> outlier target</div>
        <span className="text-slate-700">·</span>
        {(['high', 'moderate', 'low'] as const).map((b) => (
          <span key={b} className={`chip border ${ARB_COLOR[b]} text-[9px]`}>{ARB_LABEL[b]}</span>
        ))}
      </div>

    </div>
  )
}

// ─── View selector ────────────────────────────────────────────────────
// Re-sorts the matrix only — no row is ever hidden. "My portfolio" appears
// solely when a portfolio is loaded.

const STOCK_VIEWS: readonly {
  readonly id: StockView
  readonly label: string
  readonly tooltip: string
  readonly portfolioOnly?: boolean
}[] = [
  {
    id: 'most-covered',
    label: 'Most covered',
    tooltip: 'Stocks with the most broker coverage at the top — see what the Street is paying the most attention to.',
  },
  {
    id: 'consensus',
    label: 'Consensus',
    tooltip: 'Stocks where brokers most agree at the top — clearest collective view, whether bullish or bearish.',
  },
  {
    id: 'contested',
    label: 'Most disagreement',
    tooltip: 'Stocks where brokers most disagree at the top — where the Street is split on rating or price target.',
  },
  {
    id: 'portfolio',
    label: 'My portfolio',
    tooltip: 'Only the stocks you hold — your positions first, ordered by position size.',
    portfolioOnly: true,
  },
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
          title={v.tooltip}
          aria-label={v.tooltip}
          className={`px-2.5 py-1 text-[11px] rounded border transition-colors
            ${view === v.id
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'bg-line/[0.02] border-line/5 text-slate-300 hover:bg-line/[0.05] hover:border-line/10'}`}
        >{v.label}</button>
      ))}
    </div>
  )
}

function StockRow({ row, zebra, brokerColumnIds, cmp, ratingFilter, onSelectReport, onSelectTicker }: {
  row: ByStockRowViewModel;
  zebra: boolean;
  brokerColumnIds: readonly BrokerId[];
  cmp: PriceCell | undefined;
  ratingFilter: ReadonlySet<string> | null;
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
}) {
  const filterTooltip = ratingFilter
    ? 'Street state reflects all brokers covering this stock, not the active rating filter.'
    : undefined
  return (
    <tr className={`border-b border-line/5 ${zebra ? 'bg-line/[0.01]' : ''}`}>
      <td
        role="button"
        tabIndex={0}
        onClick={() => onSelectTicker(row.ticker)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTicker(row.ticker) } }}
        className="px-3 py-2 sticky left-0 z-10 bg-ink-800 border-r border-line/10 cursor-pointer hover:bg-line/[0.04] group transition-colors"
      >
        <div className="flex flex-col">
          <span className="text-slate-100 font-semibold group-hover:text-accent transition-colors">{row.ticker}</span>
          <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{row.stockName}</span>
        </div>
      </td>
      <td className="px-3 py-2" title={filterTooltip}>
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
      <td className="px-3 py-2 num text-right">
        <CmpCell cell={cmp} avgTarget={row.avgTarget}/>
      </td>
      <td className="px-3 py-2 num text-right text-slate-100" title={filterTooltip}>
        {formatPrice(row.avgTarget, row.currency, 0)}
      </td>
      <td className="px-3 py-2" title={filterTooltip}>
        <ArbVerdictCell verdict={row.arbVerdict} consensusRating={row.consensusRating}/>
      </td>
      {brokerColumnIds.map((bid) => {
        // Per-cell rating filter — hide cells whose rating isn't selected.
        // The row stays visible as long as at least one cell matches
        // (enforced in the parent's `visibleRows` filter).
        const cell = row.opinionsByBroker[bid]
        const hidden = ratingFilter !== null
          && (cell?.rating === null || cell?.rating === undefined || !ratingFilter.has(cell.rating))
        return (
          <TargetCell
            key={bid}
            cell={hidden ? undefined : cell}
            onSelectReport={onSelectReport}
          />
        )
      })}
    </tr>
  )
}

function RefreshCmpButton({ onClick, fetchedAt }: { onClick: () => void; fetchedAt: Date | null }) {
  const title = fetchedAt
    ? `Refresh live prices · last updated ${fetchedAt.toLocaleTimeString()}`
    : 'Refresh live prices'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="text-slate-500 hover:text-accent transition-colors leading-none"
    >
      {/* Inline SVG keeps the bundle dep-free. */}
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.88l1.6-1.6V6.5h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function TargetCell({ cell, onSelectReport }: { cell: OpinionCell | undefined; onSelectReport: (id: ReportId) => void }) {
  if (!cell) return <td className="px-2 py-2 text-[11.5px] text-slate-600">—</td>
  // Every cell carries a directional tint so the column scans as a wash of
  // colour at a glance. Outlier cells use a louder shade of the same colour
  // plus the OUT pill, so the call still stands out without breaking the
  // colour language.
  const stanceBg = cell.outlier
    ? (cell.stance === 'bullish' ? 'bg-emerald-500/[0.12]'
       : cell.stance === 'bearish' ? 'bg-amber-500/[0.12]'
       : 'bg-line/[0.06]')
    : (cell.stance === 'bullish' ? 'bg-emerald-500/[0.05]'
       : cell.stance === 'bearish' ? 'bg-rose-500/[0.05]'
       : '')
  const outChipCls = cell.stance === 'bullish'
    ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
    : cell.stance === 'bearish'
    ? 'border-amber-600/60 text-amber-700 dark:text-amber-300 bg-amber-500/10'
    : 'border-line/20 text-slate-700 dark:text-slate-400 bg-line/5'
  return (
    <td
      role="button"
      tabIndex={0}
      onClick={() => onSelectReport(cell.lastReportId)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(cell.lastReportId) } }}
      className={`px-2 py-2 align-top cursor-pointer transition-colors hover:bg-line/[0.04] ${stanceBg}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="num text-[12.5px] font-semibold text-slate-100">
          {formatPrice(cell.targetPrice, cell.targetCurrency, 0)}
        </span>
        {cell.targetDelta !== null && cell.targetDelta !== 0 && (
          <span className={`num text-[10px] ${TONE_TEXT_CLASS[getChangeTone(cell.targetDelta)]}`}>
            {cell.targetDelta > 0 ? '+' : ''}{cell.targetDelta}
          </span>
        )}
        {cell.outlier && <span className={`chip text-[9px] border ${outChipCls}`}>OUT</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {cell.rating && (
          <span className={`text-[10.5px] ${RATING_TEXT_COLOR[cell.rating]}`}>{cell.rating}</span>
        )}
      </div>
      <span className="num text-[9.5px] text-slate-500">{cell.lastUpdatedAt.slice(5, 10)}</span>
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
  // Text comes from the shared formatConsensusRating so every surface
  // (Overview, By Stock, Stock Drawer, Report Drawer) reads the same:
  //   "2 of 2 brokers rated Buy" / "Mixed ratings" / "No rating issued".
  // Renderer only owns the tone wrapper.
  const tone = cr.kind === 'tie' ? 'text-amber-300'
    : cr.kind === 'none' ? 'text-slate-500'
    : 'text-slate-300'
  return <span className={`text-[10.5px] ${tone}`}>{formatConsensusRating(cr)}</span>
}

// ─── Shared state badge ───────────────────────────────────────────────
// Labels live in src/lib/signalVocab.ts so every surface — By Stock, Stock
// Drawer, Disagreements, Report Drawer — reads the same wording.

function StateBadge({ state, strength, compact }: { state: ResultantState; strength: StrengthBand; compact?: boolean }) {
  return (
    <span
      className={`chip border ${STATE_COLOR[state]} inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'}`}
      title={`${RESULTANT_STATE_LABEL[state]} · ${strength} strength`}
    >
      <span>{RESULTANT_STATE_LABEL[state]}</span>
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
