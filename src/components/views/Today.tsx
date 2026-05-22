// Overview — the investor's broker-research command center.
//
// Not an email feed: a consolidated read on where the Street disagrees and
// what changed today. Every number is real or honestly blank; no invented
// reasons, no operator language.
//
//   1. Header
//   2. Four cards — High ARB stocks, Outlier calls, New notes, Stocks touched
//   3. Where brokers disagree   → opens Street view
//   4. What changed today       → opens the report
//   5. Upcoming catalysts       → only when the feed has events

import type { ReactNode } from 'react'
import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { TabId } from '../../app/tabs'
import { useByStockViewModel, type ByStockRowViewModel } from '../../viewModels/byStock'
import { useDailyWorklogViewModel } from '../../hooks/useWorklogViewModel'
import { useCatalystsViewModel } from '../../hooks/useCatalystsViewModel'
import { DEFAULT_WORKLOG_FILTERS, type WorklogItem } from '../../viewModels/worklog'
import { ARB_LABEL, ARB_COLOR, ARB_TOOLTIP, type ConsensusRating } from '../../viewModels/arb'
import { formatPrice, RATING_TEXT_COLOR } from '../../viewModels/shared'
import { stockIdentityKey } from '../../lib/reportSubject'
import { TONE_CHIP_CLASS, getActionLabelTone } from '../../lib/semanticColor'

interface TodayProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly setActiveTab: (id: TabId) => void
}

export default function Today({ filters, onSelectReport, onSelectTicker }: TodayProps) {
  const byStock = useByStockViewModel(filters, 'contested')
  const worklog = useDailyWorklogViewModel(DEFAULT_WORKLOG_FILTERS)
  const catalysts = useCatalystsViewModel()

  const rows = byStock.data?.rows ?? []
  const brokerName = new Map<string, string>()
  for (const b of byStock.data?.brokers ?? []) brokerName.set(b.id as string, b.shortName)

  // Card counts — null while loading → renders as "—".
  const highArbStocks = byStock.data ? rows.filter((r) => r.arbVerdict.band === 'high').length : null
  const outlierCalls = byStock.data
    ? rows.reduce((sum, r) => sum + r.outlierBrokerIds.length, 0)
    : null
  const newBrokerNotes = worklog.data?.summary.totalItems ?? null
  const stocksTouched = worklog.data?.summary.mentionedStocks ?? null

  // Section data.
  const disagreeRows = rows
    .filter((r) => r.arbVerdict.band === 'high' || r.arbVerdict.band === 'moderate')
    .slice(0, 6)
  const changedGroups = groupChangedItems(worklog.data?.items ?? []).slice(0, 6)
  const upcomingCatalysts = (catalysts.data?.upcoming7d ?? []).slice(0, 4)

  // The forwarded-email feed carries no catalyst data today, so the catalysts
  // panel would otherwise be permanent dead space — render it only when the
  // feed actually has upcoming events.
  const hasCatalysts = upcomingCatalysts.length > 0

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-2xl tracking-tight">Broker Research Overview</h2>
        <p className="text-slate-400 text-sm">Consensus, outliers, and what changed today.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="High ARB stocks" value={highArbStocks}/>
        <SummaryCard label="Outlier calls" value={outlierCalls}/>
        <SummaryCard label="New broker notes" value={newBrokerNotes}/>
        <SummaryCard label="Stocks touched" value={stocksTouched}/>
      </div>

      {/* 1 — Where brokers disagree */}
      <Section
        title="Where brokers disagree"
        subtitle="The stocks with the widest ARB — open Street view for the full breakdown."
      >
        {byStock.loading && !byStock.data ? (
          <Loading/>
        ) : disagreeRows.length === 0 ? (
          <Empty text="No material broker disagreements right now."/>
        ) : (
          <ul className="flex flex-col">
            {disagreeRows.map((r) => (
              <DisagreeRow
                key={r.ticker}
                row={r}
                brokerName={brokerName}
                onSelect={() => onSelectTicker(r.ticker)}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* 2 — What changed today */}
      <Section
        title="What changed today"
        subtitle="The latest broker notes, grouped by company — click a note to open the report."
      >
        {worklog.loading && !worklog.data ? (
          <Loading/>
        ) : changedGroups.length === 0 ? (
          <Empty text="No broker notes received yet."/>
        ) : (
          <ul className="flex flex-col">
            {changedGroups.map((g) => (
              <ChangedStockGroup
                key={g.key}
                group={g}
                onSelectReport={onSelectReport}
                onSelectTicker={onSelectTicker}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* 3 — Upcoming catalysts — only when the feed has any */}
      {hasCatalysts && (
        <Section title="Upcoming catalysts">
          <ul className="flex flex-col">
            {upcomingCatalysts.map((c) => (
              <li key={c.catalystId as unknown as string} className="border-b border-line/5 last:border-0">
                <button
                  onClick={() => onSelectTicker(c.ticker as StockTicker)}
                  className="w-full text-left px-4 py-2 hover:bg-line/[0.03] transition-colors flex flex-col gap-0.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-200 text-[12px] font-medium truncate">{c.ticker}</span>
                    <span className="text-slate-500 text-[10.5px] num shrink-0">
                      {c.daysUntil > 0 ? `in ${c.daysUntil}d` : 'today'}
                    </span>
                  </div>
                  <span className="text-slate-400 text-[11px] truncate">{c.headline}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────────

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

// ── Section shell ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-slate-100 text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-slate-400 text-[12px]">{subtitle}</p>}
      </div>
      <div className="panel">{children}</div>
    </section>
  )
}

function Loading() {
  return <div className="px-4 py-6 text-[12px] text-slate-500 animate-pulse">Loading…</div>
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-[12px] text-slate-400">{text}</div>
}

// ── Where brokers disagree ──────────────────────────────────────────────────

function DisagreeRow({ row, brokerName, onSelect }: {
  row: ByStockRowViewModel
  brokerName: ReadonlyMap<string, string>
  onSelect: () => void
}) {
  const outlierId = row.outlierBrokerIds[0]
  const outlierExtra = row.outlierBrokerIds.length - 1
  return (
    <li className="border-b border-line/5 last:border-0">
      <button
        onClick={onSelect}
        className="w-full text-left px-4 py-2.5 hover:bg-line/[0.03] transition-colors flex items-center gap-3 flex-wrap"
      >
        <span className="num text-slate-100 text-[13px] font-semibold w-16 shrink-0">{row.ticker}</span>
        <span
          className={`chip border ${ARB_COLOR[row.arbVerdict.band]} text-[10px] shrink-0 cursor-help`}
          title={ARB_TOOLTIP}
        >{ARB_LABEL[row.arbVerdict.band]}</span>
        <ConsensusText cr={row.consensusRating}/>
        <span className="text-[11px] text-slate-500 num">
          {row.spreadPct !== null ? `spread ${Math.round(row.spreadPct)}%` : 'spread —'}
        </span>
        {outlierId && (
          <span className="text-[11px] text-amber-300 ml-auto shrink-0">
            outlier: {brokerName.get(outlierId as string) ?? '—'}
            {outlierExtra > 0 ? ` +${outlierExtra}` : ''}
          </span>
        )}
      </button>
    </li>
  )
}

function ConsensusText({ cr }: { cr: ConsensusRating }) {
  if (cr.kind === 'none') {
    return <span className="text-[11px] text-slate-500 shrink-0">No rating</span>
  }
  if (cr.kind === 'tie') {
    return <span className="text-[11px] text-amber-300 shrink-0">Mixed ratings</span>
  }
  const unanimous = cr.agree === cr.total && cr.total > 1
  return (
    <span className="text-[11px] text-slate-300 shrink-0">
      {unanimous ? 'Unanimous ' : 'Consensus '}{cr.rating}
      <span className="text-slate-500 num"> {cr.agree}/{cr.total}</span>
    </span>
  )
}

// ── What changed today ──────────────────────────────────────────────────────

interface ChangedGroup {
  readonly key: string
  readonly name: string
  readonly ticker: StockTicker | null
  readonly items: readonly WorklogItem[]
}

/** Group worklog items by stock identity (ticker, else company name) so the
 *  Overview shows one card per company with its notes nested — not the same
 *  stock split across separate rows. Groups, and notes within them, are
 *  ordered by their strongest note via `compareForOverview`. */
function groupChangedItems(items: readonly WorklogItem[]): ChangedGroup[] {
  const byKey = new Map<string, WorklogItem[]>()
  for (const it of items) {
    const k = stockIdentityKey(
      it.ticker as unknown as string | null, it.stockName, it.reportId as unknown as string,
    )
    const bucket = byKey.get(k) ?? []
    bucket.push(it)
    byKey.set(k, bucket)
  }
  const groups: ChangedGroup[] = [...byKey.entries()].map(([key, its]) => {
    const sorted = [...its].sort(compareForOverview)
    const top = sorted[0]!
    return {
      key,
      name: top.stockName ?? (top.ticker as unknown as string | null) ?? top.title,
      ticker: top.ticker,
      items: sorted,
    }
  })
  return groups.sort((a, b) => compareForOverview(a.items[0]!, b.items[0]!))
}

/** One company group: a header naming the stock, with its broker notes nested
 *  beneath it. The header opens the stock's Street view; each note opens its
 *  own report. */
function ChangedStockGroup({ group, onSelectReport, onSelectTicker }: {
  group: ChangedGroup
  onSelectReport: (id: ReportId) => void
  onSelectTicker: (t: StockTicker) => void
}) {
  const NOTE_CAP = 4
  const shown = group.items.slice(0, NOTE_CAP)
  const extra = group.items.length - shown.length
  const ticker = group.ticker
  const header = (
    <>
      <span className="text-slate-100 text-[13px] font-semibold truncate">{group.name}</span>
      {group.items.length > 1 && (
        <span className="text-[10.5px] text-slate-500 shrink-0">{group.items.length} notes</span>
      )}
    </>
  )
  return (
    <li className="border-b border-line/5 last:border-0 py-1">
      {ticker ? (
        <button
          onClick={() => onSelectTicker(ticker)}
          className="w-full text-left px-4 pt-1.5 pb-1 flex items-center gap-2 hover:bg-line/[0.03] transition-colors"
        >
          {header}
        </button>
      ) : (
        <div className="px-4 pt-1.5 pb-1 flex items-center gap-2">{header}</div>
      )}
      <ul className="flex flex-col">
        {shown.map((it) => (
          <ChangedNoteRow key={it.id} item={it} onSelect={() => onSelectReport(it.reportId)}/>
        ))}
        {extra > 0 && (
          <li className="pl-6 pr-4 py-1 text-[10.5px] text-slate-500">
            +{extra} more note{extra > 1 ? 's' : ''}
          </li>
        )}
      </ul>
    </li>
  )
}

/** One broker note, nested under its company group. */
function ChangedNoteRow({ item, onSelect }: { item: WorklogItem; onSelect: () => void }) {
  const thesis = item.thesis?.trim() || null
  const numbers = item.keyNumbers.slice(0, 3)
  const extraNumbers = item.keyNumbers.length - numbers.length
  const hasSignals = item.actionLabel !== null || item.keyNumbers.length > 0

  return (
    <li>
      <button
        onClick={onSelect}
        className="w-full text-left pl-6 pr-4 py-1.5 hover:bg-line/[0.03] transition-colors flex flex-col gap-1"
      >
        {/* Broker · rating · target · upside · time */}
        <div className="flex items-center gap-2 min-w-0 text-[11.5px]">
          <span className="text-slate-300 shrink-0 font-medium">{item.brokerShortName}</span>
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
            {relativeTime(item.receivedAt)}
          </span>
        </div>

        {/* Why it matters — extracted thesis, else the headline */}
        {thesis ? (
          <div className="text-[12px] text-slate-300 truncate" title={thesis}>
            <span className="text-slate-500">Why it matters: </span>{thesis}
          </div>
        ) : (
          <div className="text-[12px] text-slate-400 truncate" title={item.headline || item.title}>
            {item.headline || item.title}
          </div>
        )}

        {/* Signals — one action label + up to three key-number chips */}
        {hasSignals && (
          <div className="flex items-center gap-1.5 overflow-hidden">
            {item.actionLabel && (
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TONE_CHIP_CLASS[getActionLabelTone(item.actionLabel)]}`}>
                {item.actionLabel}
              </span>
            )}
            {numbers.map((n) => (
              <span
                key={n.label}
                className="shrink-0 whitespace-nowrap num text-[10.5px] px-1.5 py-0.5 rounded border border-line/5 bg-line/[0.04] text-slate-300"
              >
                {n.label} {n.value}
              </span>
            ))}
            {extraNumbers > 0 && (
              <span className="shrink-0 text-[10.5px] text-slate-500">+{extraNumbers}</span>
            )}
          </div>
        )}
      </button>
    </li>
  )
}

function Dot() {
  return <span className="text-slate-600 shrink-0" aria-hidden>·</span>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string, fromMs: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const ms = fromMs - t
  if (ms < 60_000)     return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

/** Overview-only re-rank for the "What changed today" teaser. Reads threaded
 *  view-model fields only — never re-parses email text, never replaces the
 *  worklog builder's canonical order. Tier 0: a decision-ready note (rating +
 *  target + upside + thesis). Tier 1: a big-upside call. Tier 2: the rest.
 *  Newest-first within a tier; Array.sort is stable so ties keep builder order. */
function compareForOverview(a: WorklogItem, b: WorklogItem): number {
  const tier = (it: WorklogItem): number => {
    if (it.rating !== null && it.targetPrice !== null && it.upsidePct !== null && !!it.thesis) return 0
    if (it.upsidePct !== null && it.upsidePct >= 15) return 1
    return 2
  }
  const byTier = tier(a) - tier(b)
  if (byTier !== 0) return byTier
  return b.receivedAt.localeCompare(a.receivedAt)
}
