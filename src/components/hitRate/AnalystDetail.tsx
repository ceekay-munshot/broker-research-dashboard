// Right-hand drill-down for a selected analyst: a plain-language accuracy
// summary, a stock selector, and a simple table of that analyst's calls on the
// stock — date, call, target, the gain since the call, and whether the target
// has been met. No chart: the table is faster to read for an institutional user.

import { useEffect, useMemo, useState } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useBrokerDetailViewModel } from '../../viewModels/brokerDetail'
import {
  buildCallRows,
  type AnalystHitRateRow, type CallRow, type CallRowInput,
} from '../../viewModels/hitRate'
import { useDailyCloses } from '../../hooks/useDailyCloses'
import { useStockPrices } from '../../hooks/useStockPrices'
import { RATING_TEXT_COLOR, formatPrice, formatShortDate } from '../../viewModels/shared'
import { TONE_TEXT_CLASS } from '../../lib/semanticColor'
import BrokerGlyph from '../BrokerGlyph'
import { hitRateTone, formatPct } from './shared'

interface Props {
  readonly row: AnalystHitRateRow
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function AnalystDetail({ row, filters, onSelectReport, onSelectTicker }: Props) {
  const { data: vm, loading, error } = useBrokerDetailViewModel(row.brokerId)

  // Stocks this analyst has called, optionally narrowed by the sidebar ticker
  // filter — but never blanked: if the filter excludes everything, fall back
  // to the full set so the panel always has something to show.
  const stocks = useMemo(() => {
    const all = vm?.stocks ?? []
    if (filters.tickers.length === 0) return all
    const keep = new Set(filters.tickers.map((t) => t as unknown as string))
    const narrowed = all.filter((s) => keep.has(s.ticker as unknown as string))
    return narrowed.length > 0 ? narrowed : all
  }, [vm, filters.tickers])

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  useEffect(() => {
    if (selectedTicker && stocks.some((s) => (s.ticker as unknown as string) === selectedTicker)) return
    setSelectedTicker(stocks[0]?.ticker as unknown as string ?? null)
  }, [stocks, selectedTicker])

  const closesQ = useDailyCloses((selectedTicker as unknown as StockTicker) ?? null)
  const priceRes = useStockPrices(selectedTicker ? [selectedTicker] : [])

  const entries = useMemo(
    () => (selectedTicker && vm ? vm.timelineByTicker.get(selectedTicker) ?? [] : []),
    [vm, selectedTicker],
  )

  const closes = closesQ.data ?? []
  const sampleLatest = closes.length > 0 ? closes[closes.length - 1]!.close : null
  const sampleAsOf = closes.length > 0 ? closes[closes.length - 1]!.date : null
  const liveCell = selectedTicker ? priceRes.prices.get(selectedTicker) : undefined
  const liveCmp = liveCell?.status === 'success' ? liveCell.price : null
  const cmp = liveCmp ?? sampleLatest
  const currency = closes[0]?.currency ?? entries[0]?.targetCurrency ?? 'INR'

  const rows = useMemo<readonly CallRow[]>(() => {
    const inputs: CallRowInput[] = entries.map((e) => ({
      reportId: e.reportId as unknown as string,
      publishedAt: e.publishedAt,
      rating: e.rating,
      stance: e.stance,
      targetPrice: e.targetPrice,
      targetCurrency: e.targetCurrency,
    }))
    return buildCallRows(inputs, closes, cmp)
  }, [entries, closes, cmp])

  const targeted = rows.filter((r) => r.result !== 'na').length
  const hitCount = rows.filter((r) => r.result === 'hit').length

  if (loading) return <Panel><Centered tone="loading" text="Loading track record…"/></Panel>
  if (error)   return <Panel><Centered tone="error" text={`Error: ${error.message}`}/></Panel>
  if (!vm || vm.stocks.length === 0) {
    return <Panel><Centered tone="loading" text="No calls from this analyst in the loaded window yet."/></Panel>
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryHeader row={row} brokerName={vm.brokerName} noteCount={vm.noteCount} stocksCovered={vm.stocksCovered}/>

      <section className="flex flex-col gap-3">
        <h3 className="section-title">Their calls &amp; how they played out</h3>

        {/* Stock selector */}
        <div className="flex flex-wrap gap-1.5">
          {stocks.map((s) => {
            const key = s.ticker as unknown as string
            const selected = key === selectedTicker
            return (
              <button
                key={key}
                onClick={() => setSelectedTicker(key)}
                className={`chip text-[11px] border ${
                  selected
                    ? 'border-accent/40 text-accent bg-accent/10'
                    : 'border-line/10 text-slate-400 hover:text-slate-200 hover:border-line/20'
                }`}
                title={s.stockName ?? key}
              >
                {key}
                <span className="text-slate-500 num ml-1">{s.noteCount}</span>
              </button>
            )
          })}
        </div>

        {selectedTicker && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <button
                onClick={() => onSelectTicker(selectedTicker as unknown as StockTicker)}
                className="text-slate-200 hover:text-accent text-[12.5px] font-medium"
                title="Open stock"
              >
                {stocks.find((s) => (s.ticker as unknown as string) === selectedTicker)?.stockName ?? selectedTicker}
                <span className="text-slate-500"> →</span>
              </button>
              <div className="flex items-baseline gap-3 text-[11.5px]">
                {cmp !== null && (
                  <span className="text-slate-400">
                    CMP <span className="num text-slate-100">{formatPrice(cmp, currency, 0)}</span>
                    {liveCmp === null && sampleAsOf && (
                      <span className="text-slate-600 num"> · sample {formatShortDate(sampleAsOf + 'T00:00:00Z')}</span>
                    )}
                  </span>
                )}
                {targeted > 0 && (
                  <span className="text-slate-400">
                    <span className="num text-slate-100">{hitCount} of {targeted}</span> targets met
                  </span>
                )}
              </div>
            </div>

            <CallsTable rows={rows} currency={currency} onSelectReport={onSelectReport}/>

            {closes.length === 0 && (
              <p className="text-[10.5px] text-slate-600 italic">
                Gain since call needs price history — showing current price vs target until a price feed is connected.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Calls table ─────────────────────────────────────────────────────────

function CallsTable({ rows, currency, onSelectReport }: {
  rows: readonly CallRow[]
  currency: string
  onSelectReport: (id: ReportId) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-line/10 bg-line/[0.01] px-3 py-3 text-[11.5px] text-slate-500">
        No calls on this stock in the loaded window.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded border border-line/5">
      <table className="w-full text-[12px]">
        <thead className="bg-line/[0.02]">
          <tr className="text-left text-slate-400 text-[10.5px] uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Call</th>
            <th className="px-3 py-2 font-medium text-right">Target</th>
            <th className="px-3 py-2 font-medium text-right">Gain since call</th>
            <th className="px-3 py-2 font-medium">Target met?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.reportId}
              role="button"
              tabIndex={0}
              onClick={() => onSelectReport(r.reportId as unknown as ReportId)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(r.reportId as unknown as ReportId) } }}
              className="border-t border-line/5 cursor-pointer hover:bg-line/[0.04] transition-colors"
              title="Open this note"
            >
              <td className="px-3 py-2 num text-slate-400 whitespace-nowrap">
                {formatShortDate(r.date + 'T00:00:00Z')} {r.date.slice(0, 4)}
              </td>
              <td className="px-3 py-2">
                {r.rating
                  ? <span className={`chip border border-line/10 bg-line/[0.04] ${RATING_TEXT_COLOR[r.rating]} text-[10px]`}>{r.rating}</span>
                  : <span className="text-slate-600">—</span>}
              </td>
              <td className="px-3 py-2 text-right num text-slate-200">
                {r.targetPrice !== null ? formatPrice(r.targetPrice, r.targetCurrency ?? currency, 0) : <span className="text-slate-600">—</span>}
              </td>
              <td className="px-3 py-2 text-right num">
                <GainCell row={r}/>
              </td>
              <td className="px-3 py-2"><ResultCell row={r}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GainCell({ row }: { row: CallRow }) {
  if (row.gainPct === null) return <span className="text-slate-600">—</span>
  const cls = row.favorable === true ? 'text-emerald-400' : row.favorable === false ? 'text-rose-400' : 'text-slate-400'
  const tip = row.direction === 'flat'
    ? 'Stock move since the note'
    : `Stock ${row.gainPct >= 0 ? 'rose' : 'fell'} ${Math.abs(row.gainPct).toFixed(1)}% since the call — ${row.favorable ? 'in its favour' : 'against it'}`
  return (
    <span className={cls} title={tip}>
      {row.gainPct >= 0 ? '+' : ''}{row.gainPct.toFixed(1)}%
    </span>
  )
}

function ResultCell({ row }: { row: CallRow }) {
  if (row.result === 'hit') {
    return <span className="text-emerald-400 text-[11.5px]" title="Current price has reached the target">✓ Hit</span>
  }
  if (row.result === 'open') {
    return <span className="text-slate-500 text-[11.5px]" title="Target not reached yet">Open</span>
  }
  return <span className="text-slate-600 text-[11.5px]" title="No directional target">—</span>
}

// ── Summary header ────────────────────────────────────────────────────────

function SummaryHeader({ row, brokerName, noteCount, stocksCovered }: {
  row: AnalystHitRateRow
  brokerName: string
  noteCount: number
  stocksCovered: number
}) {
  const toneText = TONE_TEXT_CLASS[hitRateTone(row.hitRate)]
  return (
    <section className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2.5">
          <BrokerGlyph shortName={row.shortName} color={row.color} withName={false} size={6}/>
          <h2 className="text-slate-100 font-semibold text-[18px] leading-tight truncate">{brokerName}</h2>
        </div>
        <p className="text-[12.5px] text-slate-400">
          Right on <span className={`${toneText} font-semibold`}>{formatPct(row.hitRate)}</span> of{' '}
          <span className="text-slate-200 num">{row.sampleSize}</span> scored calls ·{' '}
          across {stocksCovered} stock{stocksCovered === 1 ? '' : 's'}, {noteCount} note{noteCount === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11.5px] text-slate-400">
          <Stat label="Avg return after a call" value={`${row.meanReturnPct >= 0 ? '+' : ''}${row.meanReturnPct.toFixed(1)}%`}
            tone={row.meanReturnPct >= 0 ? 'pos' : 'neg'}/>
          {row.longHitRate !== null && <Stat label="Buy calls right" value={formatPct(row.longHitRate)}/>}
          {row.shortHitRate !== null && <Stat label="Sell calls right" value={formatPct(row.shortHitRate)}/>}
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className={`num font-bold text-[34px] leading-none ${toneText}`}>{formatPct(row.hitRate)}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">hit rate</span>
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const cls = tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-slate-200'
  return (
    <span>
      <span className="text-slate-500 mr-1">{label}</span>
      <span className={`num ${cls}`}>{value}</span>
    </span>
  )
}

// ── shells ────────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}

function Centered({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
