import { useEffect, useRef, useState } from 'react'
import type { ReportId, BrokerId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { OpinionCell, ByStockRowViewModel } from '../../viewModels/byStock'
import { useByStockViewModel } from '../../viewModels/byStock'
import { RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import { type PriceCell } from '../../hooks/useStockPrices'
import { useCmpPrices } from '../../hooks/useCmpPrices'
import CmpCell from '../cells/CmpCell'
import {
  BROKER_DOT_CLASS, TONE_TEXT_CLASS, TONE_CHIP_CLASS, getChangeTone,
} from '../../lib/semanticColor'

interface ByStockProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function ByStock({ filters, onSelectReport, onSelectTicker }: ByStockProps) {
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // One default ordering: most-covered first (what the Street is watching).
  const { data, loading, error } = useByStockViewModel(filters, 'most-covered')

  // Live CMP fetch — called unconditionally (hooks rule) with a null-safe
  // ticker list. Empty list = no-op inside the hook.
  const cmpTickers = data?.rows.map((r) => r.ticker as string) ?? []
  const { prices, refetch: refetchCmp, lastFetchedAt } = useCmpPrices(cmpTickers)

  // Pull the matrix back to the top whenever the search query changes, so a
  // stock surfaced to the top by the search is actually in view.
  const query = search.trim().toLowerCase()
  useEffect(() => {
    if (query !== '') scrollRef.current?.scrollTo({ top: 0 })
  }, [query])

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-stock view…"/>

  // Rating filter — display-only. We apply it at the per-cell render gate
  // and the row-visibility gate, never at the closure-computation level.
  // Street View (state badge, Avg target) is always
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

  // Stock search surfaces matches to the top without hiding the rest of the
  // matrix — matches keep the active view's relative order, non-matches follow.
  const isSearchMatch = (row: ByStockRowViewModel) =>
    query !== '' &&
    ((row.ticker as string).toLowerCase().includes(query) ||
      row.stockName.toLowerCase().includes(query))
  const displayRows = query === ''
    ? visibleRows
    : [...visibleRows.filter(isSearchMatch), ...visibleRows.filter((r) => !isSearchMatch(r))]

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
        <StockSearch value={search} onChange={setSearch}/>
      </div>

      <div ref={scrollRef} className="panel overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full min-w-[1080px] text-[12px]">
          <thead className="border-b border-line/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 top-0 z-30 bg-ink-800 border-r border-line/10 w-[180px]">Ticker</th>
              <th className="px-3 py-2 font-medium sticky top-0 z-20 bg-ink-800 w-[184px]">Call</th>
              <th className="px-3 py-2 font-medium text-right sticky top-0 z-20 bg-ink-800 w-[96px]">
                <div className="flex items-center justify-end gap-1.5">
                  <span>CMP</span>
                  <RefreshCmpButton onClick={refetchCmp} fetchedAt={lastFetchedAt}/>
                </div>
              </th>
              <th className="px-3 py-2 font-medium text-right sticky top-0 z-20 bg-ink-800 w-[88px]">Avg target</th>
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
            {displayRows.map((row, idx) => (
              <StockRow
                key={row.ticker}
                row={row}
                zebra={idx % 2 === 1}
                highlight={isSearchMatch(row)}
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

    </div>
  )
}

// ─── Stock search ─────────────────────────────────────────────────────
// Surfaces a stock to the top of the matrix by ticker or name. Display-only:
// it re-orders and highlights, never filters rows out (see displayRows).

function StockSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg
        width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
      >
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search ticker or name…"
        aria-label="Search stocks by ticker or name"
        className="w-60 bg-line/[0.03] border border-line/10 rounded pl-7 pr-7 py-1 text-[12px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent/40 focus:bg-line/[0.05] transition-colors"
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 leading-none text-slate-500 hover:text-slate-200 text-[14px]"
        >×</button>
      )}
    </div>
  )
}

function StockRow({ row, zebra, highlight, brokerColumnIds, cmp, ratingFilter, onSelectReport, onSelectTicker }: {
  row: ByStockRowViewModel;
  zebra: boolean;
  highlight: boolean;
  brokerColumnIds: readonly BrokerId[];
  cmp: PriceCell | undefined;
  ratingFilter: ReadonlySet<string> | null;
  onSelectReport: (id: ReportId) => void;
  onSelectTicker: (t: StockTicker) => void;
}) {
  const filterTooltip = ratingFilter
    ? 'The call reflects all brokers covering this stock, not the active rating filter.'
    : undefined
  return (
    <tr className={`border-b border-line/5 ${highlight ? 'bg-accent/[0.07]' : zebra ? 'bg-line/[0.01]' : ''}`}>
      <td
        role="button"
        tabIndex={0}
        onClick={() => onSelectTicker(row.ticker)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTicker(row.ticker) } }}
        className={`px-3 py-2 sticky left-0 z-10 bg-ink-800 border-r border-line/10 border-l-2 cursor-pointer hover:bg-line/[0.04] group transition-colors ${highlight ? 'border-l-accent' : 'border-l-transparent'}`}
      >
        <div className="flex flex-col">
          <span className={`font-semibold group-hover:text-accent transition-colors ${highlight ? 'text-accent' : 'text-slate-100'}`}>{row.ticker}</span>
          <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{row.stockName}</span>
        </div>
      </td>
      <td className="px-3 py-2" title={filterTooltip}>
        <CallCell row={row}/>
      </td>
      <td className="px-3 py-2 num text-right">
        <CmpCell cell={cmp} avgTarget={row.avgTarget}/>
      </td>
      <td className="px-3 py-2 num text-right text-slate-100" title={filterTooltip}>
        {formatPrice(row.avgTarget, row.currency, 0)}
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

// ─── Call cell ────────────────────────────────────────────────────────
// How the Street's calls split on a stock, at a glance: a stacked Buy / Hold /
// Sell bar over the covering brokers, with the counts beside it (e.g.
// "3 Buy · 5 Hold · 1 Sell"). One look tells you where the Street stands.

function CallCell({ row }: { row: ByStockRowViewModel }) {
  const { buy, hold, sell } = row.ratingCounts
  const total = buy + hold + sell

  if (total === 0) {
    return <span className="text-[12px] font-medium text-slate-400 whitespace-nowrap">No rating yet</span>
  }

  const pct = (n: number) => (100 * n) / total
  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]" title={`${buy} Buy · ${hold} Hold · ${sell} Sell — ${total} broker${total === 1 ? '' : 's'} covering`}>
      <div className="flex h-2 rounded-full overflow-hidden bg-line/10">
        {buy > 0 && <div className="bg-emerald-500/80" style={{ width: `${pct(buy)}%` }}/>}
        {hold > 0 && <div className="bg-slate-500/60" style={{ width: `${pct(hold)}%` }}/>}
        {sell > 0 && <div className="bg-rose-500/80" style={{ width: `${pct(sell)}%` }}/>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {buy > 0 && <span className={`chip text-[9.5px] border ${TONE_CHIP_CLASS.positive}`}>{buy} Buy</span>}
        {hold > 0 && <span className={`chip text-[9.5px] border ${TONE_CHIP_CLASS.neutral}`}>{hold} Hold</span>}
        {sell > 0 && <span className={`chip text-[9.5px] border ${TONE_CHIP_CLASS.negative}`}>{sell} Sell</span>}
      </div>
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
