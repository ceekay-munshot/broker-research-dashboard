// Overview — the consolidated broker-research feed.
//
// Scannable by design. A few honest, API-direct counts, then a day-grouped
// timeline where the COMPANY is the hero: one card per stock per day, with a
// compact line per broker (tag · view · target · what's new). No raw email
// text — the full note opens in the Report drawer on click. Derived
// ARB/outlier math lives in the Stocks and Agreements & disagreements tabs.
//
//   1. Header
//   2. Simple counts — New today, Broker notes, Stocks analysed, Brokers
//   3. Timeline — by day → by company → per-broker view lines

import { useMemo, useState } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { TabId } from '../../app/tabs'
import { useDailyWorklogViewModel } from '../../hooks/useWorklogViewModel'
import { DEFAULT_WORKLOG_FILTERS, type WorklogItem } from '../../viewModels/worklog'
import { formatPrice, RATING_TEXT_COLOR } from '../../viewModels/shared'
import { resolveSummaryNoteSignal } from '../../lib/signalPolicy'

interface TodayProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly setActiveTab: (id: TabId) => void
}

const INITIAL_VISIBLE = 12
const PAGE = 12

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

  // Drop backend extraction artifacts — tickerless "companies" whose name is
  // really a forwarded digest filename or the forwarding fund's own entity
  // (e.g. "01618 VIMANA CAPITAL MANAGEMENT LLP 23April2026 India Daily").
  // Conservative: only tickerless names matching high-precision junk patterns
  // are hidden, so a real resolved stock is never dropped. See
  // docs/api-field-mapping.md → "Known extraction gaps".
  const items = useMemo(
    () => (worklog.data?.items ?? []).filter((i) => !looksLikeJunkCompany(i)),
    [worklog.data],
  )
  const hiddenJunk = (worklog.data?.items.length ?? 0) - items.length

  // Simple, API-direct counts over the feed we display. (The view-model's
  // `summary` is hard-scoped to *today* and shared with other views, so we
  // count the shown items here — consistent with the timeline, and non-zero
  // on a historical feed.)
  const todayKey = new Date().toISOString().slice(0, 10)
  const counts = useMemo(() => {
    const brokers = new Set<string>()
    const stocks = new Set<string>()
    let today = 0
    for (const i of items) {
      brokers.add(i.brokerId as unknown as string)
      stocks.add(stockKey(i))
      if (i.utcDate === todayKey) today++
    }
    return { today, total: items.length, stocks: stocks.size, brokers: brokers.size }
  }, [items, todayKey])

  const newToday = worklog.data ? counts.today : null
  const totalNotes = worklog.data ? counts.total : null
  const stocksAnalysed = worklog.data ? counts.stocks : null
  const activeBrokers = worklog.data ? counts.brokers : null

  // Day → company cards. Each card consolidates a stock's notes for that day
  // and dedupes to one view-line per broker (latest wins).
  const days = useMemo(() => buildDays(items), [items])

  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const { shownDays, shownCards, totalCards } = useMemo(() => sliceDays(days, visible), [days, visible])
  const hasMore = shownCards < totalCards

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-2xl tracking-tight">Broker Research Feed</h2>
        <p className="text-slate-400 text-sm">What the Street is saying, by company — newest first.</p>
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
            <div className="flex flex-col gap-6">
              {shownDays.map((day) => (
                <div key={day.key} className="flex flex-col gap-2.5">
                  <DayDivider label={day.label} count={day.cards.length}/>
                  <div className="flex flex-col gap-2.5">
                    {day.cards.map((card) => (
                      <StockCard
                        key={card.key}
                        card={card}
                        onSelectReport={onSelectReport}
                        onSelectTicker={card.ticker ? () => onSelectTicker(card.ticker as StockTicker) : null}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setVisible((v) => v + PAGE)}
                className="self-center mt-2 text-[12px] text-slate-400 hover:text-accent border border-line/10 hover:border-accent/40 rounded-md px-4 py-1.5 transition-colors"
              >
                Show more · {totalCards - shownCards} more stock{totalCards - shownCards > 1 ? 's' : ''}
              </button>
            )}
            {hiddenJunk > 0 && (
              <p className="self-center mt-1 text-[10.5px] text-slate-600">
                {hiddenJunk} unrecognized item{hiddenJunk > 1 ? 's' : ''} hidden
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// ── Counts ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number | null }) {
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
      <span className="text-[10.5px] text-slate-600 num">{count} stock{count > 1 ? 's' : ''}</span>
      <span className="flex-1 h-px bg-line/5"/>
    </div>
  )
}

/** One company for a given day: a header naming the stock (the hero — opens
 *  the Street view), then one compact line per broker that weighed in. A
 *  divergence hint appears when brokers disagree. */
function StockCard({ card, onSelectReport, onSelectTicker }: {
  card: StockCardData
  onSelectReport: (id: ReportId) => void
  onSelectTicker: (() => void) | null
}) {
  const ticker = card.ticker as unknown as string | null
  return (
    <div className="panel overflow-hidden">
      {/* Company header — the hero */}
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2 border-b border-line/5">
        {ticker && (
          <span className="num text-[13px] font-semibold text-slate-100 shrink-0">{ticker}</span>
        )}
        {onSelectTicker ? (
          <button
            onClick={onSelectTicker}
            title={ticker ? `Open ${card.name} stock view` : undefined}
            className="group text-left text-[12px] text-slate-400 truncate hover:text-accent transition-colors"
          >
            {card.name}
          </button>
        ) : (
          <span className="text-[12px] text-slate-400 truncate">{card.name}</span>
        )}
        {card.divergence && (
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 bg-amber-400/[0.08]">
            Brokers split
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10.5px] text-slate-500 num">{shortTime(card.latestAt)}</span>
      </div>

      {/* One line per broker — the consolidated views */}
      <ul className="flex flex-col">
        {card.views.map((v) => (
          <BrokerViewLine key={v.brokerId} view={v} onSelect={() => onSelectReport(v.reportId)}/>
        ))}
      </ul>
    </div>
  )
}

/** A single broker's view on the company: short broker tag, their call, the
 *  target, optional upside, and a "what's new" marker (new coverage / upgrade /
 *  downgrade) only when it adds information. Opens that broker's report. */
function BrokerViewLine({ view, onSelect }: { view: BrokerView; onSelect: () => void }) {
  return (
    <li className="border-b border-line/5 last:border-0">
      <button
        onClick={onSelect}
        className="w-full text-left px-3.5 py-2 hover:bg-line/[0.03] transition-colors flex items-center gap-2.5"
      >
        {/* broker tag */}
        <span
          className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-line/[0.06] text-slate-200 num"
          style={view.color ? { color: view.color } : undefined}
        >
          {view.brokerShortName}
        </span>

        {/* the call */}
        {view.rating ? (
          <span className={`shrink-0 text-[12px] font-medium ${RATING_TEXT_COLOR[view.rating]}`}>{view.rating}</span>
        ) : (
          <span className={`shrink-0 text-[12px] ${STANCE_TEXT[view.stance]}`}>{STANCE_WORD[view.stance]}</span>
        )}

        {/* target price (short) */}
        {view.targetPrice != null && (
          <span className="shrink-0 text-[12px] text-slate-300 num">
            TP {formatPrice(view.targetPrice, view.targetCurrency, 0)}
          </span>
        )}

        {/* upside */}
        {view.upsidePct != null && (
          <span className={`shrink-0 text-[11.5px] num ${view.upsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {view.upsidePct >= 0 ? '+' : ''}{Math.round(view.upsidePct)}%
          </span>
        )}

        {/* what's new — only the informative signals */}
        {view.marker && (
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${view.marker.cls}`}>
            {view.marker.label}
          </span>
        )}

        <span className="ml-auto shrink-0 text-[10.5px] text-slate-500 num pl-2">{shortTime(view.receivedAt)}</span>
      </button>
    </li>
  )
}

const STANCE_TEXT: Record<string, string> = {
  bullish: 'text-emerald-400',
  bearish: 'text-rose-400',
  neutral: 'text-slate-400',
}
const STANCE_WORD: Record<string, string> = {
  bullish: 'Positive',
  bearish: 'Negative',
  neutral: 'Neutral',
}

// ── Consolidation ─────────────────────────────────────────────────────────────

interface BrokerView {
  readonly brokerId: string
  readonly brokerShortName: string
  readonly color: string | null
  readonly stance: string
  readonly rating: WorklogItem['rating']
  readonly targetPrice: number | null
  readonly targetCurrency: WorklogItem['targetCurrency']
  readonly upsidePct: number | null
  readonly reportId: ReportId
  readonly receivedAt: string
  readonly marker: { label: string; cls: string } | null
}

interface StockCardData {
  readonly key: string
  readonly name: string
  readonly ticker: StockTicker | null
  readonly views: readonly BrokerView[]
  readonly latestAt: string
  readonly divergence: boolean
}

interface DayCards {
  readonly key: string
  readonly label: string
  readonly cards: readonly StockCardData[]
}

/** Heuristic: a TICKERLESS "company" whose name is really a forwarded digest
 *  filename or the forwarding fund's own entity, not a covered stock. Applied
 *  only to tickerless items, so a resolved ticker is never hidden. Each branch
 *  is a high-precision junk signal a listed equity's name would not contain.
 *  These are backend extraction artifacts (see docs/api-field-mapping.md). */
function looksLikeJunkCompany(item: WorklogItem): boolean {
  if (item.ticker) return false
  const name = (item.stockName ?? '').trim()
  if (!name) return false
  const n = name.toLowerCase()
  return (
    /^\d{3,}/.test(name) ||                                                            // leading id run: "01618 ..."
    /\b(llp|capital management|asset management|investment management)\b/.test(n) ||   // forwarding fund entity
    /\d{1,2}\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s?\d{2,4}/.test(n) || // smushed date: "23April2026"
    /\b(india daily|morning (note|insight|wrap)|daily wrap)\b/.test(n)                 // digest titles
  )
}

/** Stock identity key — ticker first, else normalized name. */
function stockKey(i: WorklogItem): string {
  if (i.ticker) return `t:${i.ticker as unknown as string}`
  if (i.stockName) return `n:${i.stockName.trim().toLowerCase()}`
  return `r:${i.reportId as unknown as string}`
}

/** "What's new" marker — only the signals that add information beyond the
 *  rating column. The shared signal policy already suppresses a signal that
 *  merely mirrors the formal rating (e.g. Bullish signal + Buy). */
function markerFor(item: WorklogItem): { label: string; cls: string } | null {
  const resolved = resolveSummaryNoteSignal(
    { noteSignalKind: item.noteSignalKind, noteSignalSource: item.noteSignalSource, actionLabel: item.actionLabel },
    item.rating,
  )
  switch (resolved?.noteSignalKind) {
    case 'new_coverage': return { label: 'New coverage', cls: 'border-sky-400/40 text-sky-300 bg-sky-400/[0.08]' }
    case 'upgrade':      return { label: '▲ Upgrade',     cls: 'border-emerald-400/40 text-emerald-300 bg-emerald-400/[0.08]' }
    case 'downgrade':    return { label: '▼ Downgrade',   cls: 'border-rose-400/40 text-rose-300 bg-rose-400/[0.08]' }
    default:             return null
  }
}

/** Build day → company cards. Items are grouped by UTC day, then by stock
 *  within the day; each stock's notes collapse to one view-line per broker
 *  (latest wins, preferring an entry that carries a target price). */
function buildDays(items: readonly WorklogItem[]): DayCards[] {
  const dayOrder: string[] = []
  const byDay = new Map<string, WorklogItem[]>()
  for (const it of items) {
    if (!byDay.has(it.utcDate)) { byDay.set(it.utcDate, []); dayOrder.push(it.utcDate) }
    byDay.get(it.utcDate)!.push(it)
  }

  return dayOrder.map((dayKey) => {
    const dayItems = byDay.get(dayKey)!

    const stockOrder: string[] = []
    const byStock = new Map<string, WorklogItem[]>()
    for (const it of dayItems) {
      const k = stockKey(it)
      if (!byStock.has(k)) { byStock.set(k, []); stockOrder.push(k) }
      byStock.get(k)!.push(it)
    }

    const cards: StockCardData[] = stockOrder.map((k) => {
      const group = byStock.get(k)!

      // One view per broker — latest by receivedAt, tie-break to the entry
      // that actually carries a target price, then a rating.
      const byBroker = new Map<string, WorklogItem>()
      for (const it of group) {
        const bid = it.brokerId as unknown as string
        const prev = byBroker.get(bid)
        if (!prev || isBetterView(it, prev)) byBroker.set(bid, it)
      }

      const views: BrokerView[] = [...byBroker.values()]
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .map((it) => ({
          brokerId: it.brokerId as unknown as string,
          brokerShortName: it.brokerShortName,
          color: it.brokerColor,
          stance: it.stance,
          rating: it.rating,
          targetPrice: it.targetPrice,
          targetCurrency: it.targetCurrency,
          upsidePct: it.upsidePct,
          reportId: it.reportId,
          receivedAt: it.receivedAt,
          marker: markerFor(it),
        }))

      const top = group.reduce((a, b) => (b.receivedAt > a.receivedAt ? b : a))
      const ratings = new Set(views.filter((v) => v.rating).map((v) => v.rating))
      const stances = new Set(views.map((v) => v.stance))
      return {
        key: k,
        name: top.stockName ?? (top.ticker as unknown as string | null) ?? top.title,
        ticker: top.ticker,
        views,
        latestAt: top.receivedAt,
        // Flag genuine disagreement: >1 broker and a mix of ratings or stances.
        divergence: views.length > 1 && (ratings.size > 1 || stances.size > 1),
      }
    })

    // Newest-active company first within the day.
    cards.sort((a, b) => b.latestAt.localeCompare(a.latestAt))
    return { key: dayKey, label: dayLabel(dayKey), cards }
  })
}

/** Prefer the more-recent item; on a timestamp tie prefer one with a target
 *  price, then one with a rating — so a broker's richest call wins. */
function isBetterView(candidate: WorklogItem, current: WorklogItem): boolean {
  if (candidate.receivedAt !== current.receivedAt) return candidate.receivedAt > current.receivedAt
  const score = (i: WorklogItem) => (i.targetPrice != null ? 2 : 0) + (i.rating != null ? 1 : 0)
  return score(candidate) > score(current)
}

/** Take whole/partial days until `limit` company-cards are collected, so a day
 *  header never renders with no cards beneath it. */
function sliceDays(days: readonly DayCards[], limit: number): {
  shownDays: DayCards[]; shownCards: number; totalCards: number
} {
  const totalCards = days.reduce((n, d) => n + d.cards.length, 0)
  const shownDays: DayCards[] = []
  let count = 0
  for (const day of days) {
    if (count >= limit) break
    const take = day.cards.slice(0, limit - count)
    shownDays.push({ ...day, cards: take })
    count += take.length
  }
  return { shownDays, shownCards: count, totalCards }
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
