// Overview — the broker-research feed.
//
// Deliberately simple and scannable: a few honest, API-direct counts, then an
// infinite chronological timeline of every broker note as it arrived. No
// derived ARB/outlier math here (that lives in the Stocks and Agreements &
// disagreements tabs) — this surface answers "what has the Street been
// saying, newest first?" at a glance.
//
//   1. Header
//   2. Simple counts — New today, Broker notes, Stocks analysed, Brokers
//   3. Timeline — broker · stock · rating/target/upside · one-line why, by day

import { useMemo, useState } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { TabId } from '../../app/tabs'
import { useDailyWorklogViewModel } from '../../hooks/useWorklogViewModel'
import { DEFAULT_WORKLOG_FILTERS, type WorklogItem } from '../../viewModels/worklog'
import { formatPrice, RATING_TEXT_COLOR } from '../../viewModels/shared'
import { TONE_CHIP_CLASS, getActionLabelTone } from '../../lib/semanticColor'
import { NOTE_SIGNAL_LABEL } from '../../lib/signalVocab'
import { resolveSummaryNoteSignal, type NoteSignalInput } from '../../lib/signalPolicy'

interface TodayProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly setActiveTab: (id: TabId) => void
}

const INITIAL_VISIBLE = 30
const PAGE = 30

export default function Today({ filters, onSelectReport, onSelectTicker }: TodayProps) {
  // The whole feed, newest-first — not date-scoped. The sidebar's broker /
  // stock / sector / rating chips still filter it.
  const worklog = useDailyWorklogViewModel({
    ...DEFAULT_WORKLOG_FILTERS,
    dateWindow: 'all',
    brokerIds: filters.brokerIds,
    tickers: filters.tickers,
    sectorIds: filters.sectorIds,
    ratings: filters.ratings,
  })

  const items = worklog.data?.items ?? []

  // Simple, API-direct counts over the feed we actually display. (The
  // view-model's `summary` is hard-scoped to *today* and shared with other
  // views, so we count the shown items here to stay consistent with the
  // timeline below — and so the cards aren't all 0 on a historical feed.)
  const todayKey = new Date().toISOString().slice(0, 10)
  const counts = useMemo(() => {
    const brokers = new Set<string>()
    const stocks = new Set<string>()
    let today = 0
    for (const i of items) {
      brokers.add(i.brokerId as unknown as string)
      if (i.ticker) stocks.add(`t:${i.ticker as unknown as string}`)
      else if (i.stockName) stocks.add(`n:${i.stockName.toLowerCase()}`)
      if (i.utcDate === todayKey) today++
    }
    return { today, total: items.length, stocks: stocks.size, brokers: brokers.size }
  }, [items, todayKey])

  const newToday = worklog.data ? counts.today : null
  const totalNotes = worklog.data ? counts.total : null
  const stocksAnalysed = worklog.data ? counts.stocks : null
  const activeBrokers = worklog.data ? counts.brokers : null

  // Newest-first timeline, split into day sections for temporal context.
  const days = useMemo(() => groupByDay(items), [items])

  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  // Walk the day groups and keep only the first `visible` items overall.
  const { shownDays, shownCount } = useMemo(() => sliceDays(days, visible), [days, visible])
  const hasMore = shownCount < items.length

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-2xl tracking-tight">Broker Research Feed</h2>
        <p className="text-slate-400 text-sm">Every broker note as it arrived — newest first.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="New today" value={newToday}/>
        <SummaryCard label="Broker notes" value={totalNotes}/>
        <SummaryCard label="Stocks analysed" value={stocksAnalysed}/>
        <SummaryCard label="Brokers" value={activeBrokers}/>
      </div>

      <section className="flex flex-col gap-2">
        {worklog.loading && !worklog.data ? (
          <div className="panel px-4 py-8 text-[12px] text-slate-500 animate-pulse">Loading the feed…</div>
        ) : items.length === 0 ? (
          <div className="panel px-4 py-8 text-[12px] text-slate-400">No broker notes yet.</div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {shownDays.map((day) => (
                <div key={day.key} className="flex flex-col gap-1.5">
                  <DayDivider label={day.label} count={day.items.length}/>
                  <ul className="flex flex-col">
                    {day.items.map((it) => (
                      <TimelineRow
                        key={it.id}
                        item={it}
                        onSelectReport={() => onSelectReport(it.reportId)}
                        onSelectTicker={it.ticker ? () => onSelectTicker(it.ticker as StockTicker) : null}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setVisible((v) => v + PAGE)}
                className="self-center mt-1 text-[12px] text-slate-400 hover:text-accent border border-line/10 hover:border-accent/40 rounded-md px-4 py-1.5 transition-colors"
              >
                Show more · {items.length - shownCount} older note{items.length - shownCount > 1 ? 's' : ''}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// ── Counts ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number | null }) {
  // null = still loading → "—". A real zero is shown as 0 (an honest count).
  return (
    <div className="rounded-lg bg-line/[0.02] px-4 py-3 flex flex-col gap-1.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className={`num text-[24px] leading-none font-semibold tracking-tight ${
        value == null ? 'text-slate-500' : 'text-slate-100'
      }`}>
        {value == null ? '—' : value.toLocaleString('en-US')}
      </span>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function DayDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="text-[10.5px] text-slate-600 num">{count}</span>
      <span className="flex-1 h-px bg-line/5"/>
    </div>
  )
}

/** One broker note in the timeline. A stance-toned rail dot anchors the row;
 *  the headline is broker · stock with rating / target / upside, and a single
 *  "why it matters" line beneath. The row opens the report; the ticker (when
 *  present) opens the stock view. */
function TimelineRow({ item, onSelectReport, onSelectTicker }: {
  item: WorklogItem
  onSelectReport: () => void
  onSelectTicker: (() => void) | null
}) {
  const why = item.thesis?.trim() || item.headline?.trim() || item.title
  const noteSignal = resolveNoteSignalChip(item)
  const stockLabel = (item.ticker as unknown as string | null) ?? item.stockName ?? '—'

  return (
    <li className="border-b border-line/5 last:border-0">
      <div className="flex gap-3 px-1 py-2.5 group">
        {/* Rail dot — stance tone */}
        <div className="flex flex-col items-center pt-1 shrink-0">
          <span className={`w-2 h-2 rounded-full ${STANCE_DOT[item.stance]}`}/>
        </div>

        <button
          onClick={onSelectReport}
          className="flex-1 min-w-0 text-left flex flex-col gap-1 hover:bg-line/[0.03] -my-1 -mr-1 py-1 pr-1 rounded transition-colors"
        >
          {/* broker · stock · rating · target · upside · time */}
          <div className="flex items-center gap-2 min-w-0 text-[12px]">
            <span className="text-slate-200 font-semibold shrink-0">{item.brokerShortName}</span>
            <Dot/>
            {onSelectTicker ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onSelectTicker() }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSelectTicker() } }}
                className="num text-slate-100 font-semibold shrink-0 hover:text-accent cursor-pointer transition-colors"
                title={item.stockName ?? undefined}
              >
                {stockLabel}
              </span>
            ) : (
              <span className="num text-slate-100 font-semibold shrink-0">{stockLabel}</span>
            )}
            {item.rating && (
              <><Dot/><span className={`shrink-0 ${RATING_TEXT_COLOR[item.rating]}`}>{item.rating}</span></>
            )}
            {item.targetPrice != null && (
              <><Dot/><span className="text-slate-300 num shrink-0">TP {formatPrice(item.targetPrice, item.targetCurrency, 0)}</span></>
            )}
            {item.upsidePct != null && (
              <><Dot/><span className={`num shrink-0 ${item.upsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.upsidePct >= 0 ? '+' : ''}{Math.round(item.upsidePct)}%
              </span></>
            )}
            <span className="text-[10.5px] text-slate-500 num shrink-0 ml-auto pl-2">
              {shortTime(item.receivedAt)}
            </span>
          </div>

          {/* why it matters — one line */}
          <div className="text-[12px] text-slate-400 truncate" title={why}>{why}</div>

          {/* signal chip — only when it adds info beyond the rating column */}
          {noteSignal !== null && noteSignal.noteSignalKind !== null && (
            <div>
              <span
                className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TONE_CHIP_CLASS[getActionLabelTone(NOTE_SIGNAL_LABEL[noteSignal.noteSignalKind])]}`}
              >
                {NOTE_SIGNAL_LABEL[noteSignal.noteSignalKind]}
              </span>
            </div>
          )}
        </button>
      </div>
    </li>
  )
}

function Dot() {
  return <span className="text-slate-600 shrink-0" aria-hidden>·</span>
}

const STANCE_DOT: Record<string, string> = {
  bullish: 'bg-emerald-400',
  bearish: 'bg-rose-400',
  neutral: 'bg-slate-500',
}

/** Resolve the Note signal chip, applying the non-duplication rule against the
 *  formal rating (so e.g. a Bullish-signal chip is suppressed when the rating
 *  is already Buy). Shared with the rest of the app via signalPolicy. */
function resolveNoteSignalChip(item: WorklogItem): NoteSignalInput | null {
  return resolveSummaryNoteSignal(
    {
      noteSignalKind: item.noteSignalKind,
      noteSignalSource: item.noteSignalSource,
      actionLabel: item.actionLabel,
    },
    item.rating,
  )
}

// ── Day grouping ──────────────────────────────────────────────────────────────

interface DayGroup {
  readonly key: string
  readonly label: string
  readonly items: readonly WorklogItem[]
}

/** Split items (assumed newest-first from the builder) into contiguous day
 *  sections keyed by UTC date, labelled Today / Yesterday / "DD Mon YYYY". */
function groupByDay(items: readonly WorklogItem[]): DayGroup[] {
  const order: string[] = []
  const byDay = new Map<string, WorklogItem[]>()
  for (const it of items) {
    const k = it.utcDate
    if (!byDay.has(k)) { byDay.set(k, []); order.push(k) }
    byDay.get(k)!.push(it)
  }
  return order.map((k) => ({ key: k, label: dayLabel(k), items: byDay.get(k)! }))
}

/** Take whole or partial day groups until `limit` items have been collected,
 *  so "Show more" never leaves a day header with no rows under it. */
function sliceDays(days: readonly DayGroup[], limit: number): { shownDays: DayGroup[]; shownCount: number } {
  const shownDays: DayGroup[] = []
  let count = 0
  for (const day of days) {
    if (count >= limit) break
    const remaining = limit - count
    const take = day.items.slice(0, remaining)
    shownDays.push({ ...day, items: take })
    count += take.length
  }
  return { shownDays, shownCount: count }
}

function dayLabel(utcDate: string): string {
  const todayKey = new Date().toISOString().slice(0, 10)
  if (utcDate === todayKey) return 'Today'
  const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (utcDate === y) return 'Yesterday'
  const d = new Date(`${utcDate}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function shortTime(iso: string, fromMs: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const ms = fromMs - t
  if (ms < 60_000)     return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  const d = new Date(t)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}
