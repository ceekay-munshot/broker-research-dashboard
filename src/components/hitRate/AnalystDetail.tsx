// Right-hand drill-down for a selected analyst: a plain-language accuracy
// summary, a stock selector, the price chart with their calls marked, and the
// underlying call list. Reuses the per-broker timeline view-model that powers
// the Brokers-tab drawer; layers on the sample-price outcome grading.

import { useEffect, useMemo, useState } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useBrokerDetailViewModel } from '../../viewModels/brokerDetail'
import {
  buildCallMarkers, tallyMarkers,
  type AnalystHitRateRow, type CallMarker, type CallMarkerInput,
} from '../../viewModels/hitRate'
import { useDailyCloses } from '../../hooks/useDailyCloses'
import { RATING_TEXT_COLOR, formatPrice, formatShortDate } from '../../viewModels/shared'
import { TONE_TEXT_CLASS } from '../../lib/semanticColor'
import BrokerGlyph from '../BrokerGlyph'
import PriceCallsChart from './PriceCallsChart'
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

  const entries = useMemo(
    () => (selectedTicker && vm ? vm.timelineByTicker.get(selectedTicker) ?? [] : []),
    [vm, selectedTicker],
  )
  const markers = useMemo<readonly CallMarker[]>(() => {
    const inputs: CallMarkerInput[] = entries.map((e) => ({
      reportId: e.reportId as unknown as string,
      publishedAt: e.publishedAt,
      rating: e.rating,
      stance: e.stance,
      targetPrice: e.targetPrice,
    }))
    return buildCallMarkers(inputs, closesQ.data ?? [])
  }, [entries, closesQ.data])
  const tally = tallyMarkers(markers)
  const markerByReport = useMemo(
    () => new Map(markers.map((m) => [m.reportId, m])),
    [markers],
  )

  if (loading) return <Panel><Centered tone="loading" text="Loading track record…"/></Panel>
  if (error)   return <Panel><Centered tone="error" text={`Error: ${error.message}`}/></Panel>
  if (!vm || vm.stocks.length === 0) {
    return <Panel><Centered tone="loading" text="No calls from this analyst in the loaded window yet."/></Panel>
  }

  const currency = closesQ.data?.[0]?.currency ?? entries[0]?.targetCurrency ?? 'INR'
  const selectedStock = stocks.find((s) => (s.ticker as unknown as string) === selectedTicker) ?? null

  return (
    <div className="flex flex-col gap-5">
      <SummaryHeader row={row} brokerName={vm.brokerName} noteCount={vm.noteCount} stocksCovered={vm.stocksCovered}/>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="section-title">How their calls played out</h3>
          {tally.evaluated > 0 && (
            <span className="text-[11px] text-slate-400">
              On <span className="text-slate-200 font-medium">{selectedTicker}</span>:{' '}
              <span className="num text-slate-100">{tally.correct} of {tally.evaluated}</span> directional calls worked
            </span>
          )}
        </div>

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
          <div className="panel p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onSelectTicker(selectedTicker as unknown as StockTicker)}
                className="text-slate-200 hover:text-accent text-[12.5px] font-medium"
                title="Open stock"
              >
                {selectedStock?.stockName ?? selectedTicker} <span className="text-slate-500">→</span>
              </button>
            </div>
            <PriceCallsChart
              ticker={selectedTicker}
              stockName={selectedStock?.stockName ?? null}
              closes={closesQ.data ?? []}
              markers={markers}
              loading={closesQ.loading}
              currency={currency}
            />
          </div>
        )}

        <CallsList entries={entries} markerByReport={markerByReport} currency={currency} onSelectReport={onSelectReport}/>
      </section>
    </div>
  )
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

// ── Calls list ──────────────────────────────────────────────────────────

function CallsList({ entries, markerByReport, currency, onSelectReport }: {
  entries: readonly import('../../viewModels/brokerDetail').BrokerTimelineEntry[]
  markerByReport: ReadonlyMap<string, CallMarker>
  currency: string
  onSelectReport: (id: ReportId) => void
}) {
  if (entries.length === 0) return null
  return (
    <ul className="flex flex-col divide-y divide-line/5 rounded border border-line/5">
      {entries.map((e) => {
        const m = markerByReport.get(e.reportId as unknown as string)
        return (
          <li key={e.reportId as unknown as string}>
            <button
              onClick={() => onSelectReport(e.reportId)}
              className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-line/[0.03] transition-colors"
            >
              <OutcomeIcon outcome={m?.outcome ?? 'no_price'}/>
              <span className="num text-[11px] text-slate-400 w-20 shrink-0">
                {formatShortDate(e.publishedAt)} {e.publishedAt.slice(0, 4)}
              </span>
              {e.rating ? (
                <span className={`text-[11.5px] ${RATING_TEXT_COLOR[e.rating]} w-20 shrink-0`}>{e.rating}</span>
              ) : <span className="text-slate-600 w-20 shrink-0 text-[11.5px]">—</span>}
              <span className="num text-[11.5px] text-slate-300 w-20 shrink-0">
                {e.targetPrice !== null ? formatPrice(e.targetPrice, e.targetCurrency ?? currency, 0) : '—'}
              </span>
              <span className="text-[11.5px] text-slate-400 truncate flex-1">{e.headline}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function OutcomeIcon({ outcome }: { outcome: CallMarker['outcome'] }) {
  const map = {
    correct: { ch: '✓', cls: 'text-emerald-400', tip: 'Played out' },
    wrong:   { ch: '✗', cls: 'text-rose-400', tip: "Didn't play out" },
    neutral: { ch: '·', cls: 'text-slate-500', tip: 'No directional bet' },
    pending: { ch: '◦', cls: 'text-slate-500', tip: 'Too recent to grade' },
    no_price:{ ch: '·', cls: 'text-slate-600', tip: 'Outside price window' },
  } as const
  const v = map[outcome]
  return <span className={`w-4 shrink-0 text-center ${v.cls}`} title={v.tip}>{v.ch}</span>
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
