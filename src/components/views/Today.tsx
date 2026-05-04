// Today — the investor's clean morning landing page.
//
// One unified screen, not four old tabs stacked. Layout:
//   1. Header (title + tagline, lots of breathing room)
//   2. Summary strip (4 numeric placeholder cards)
//   3. Priority feed (the centerpiece — top items to read first)
//   4. Three compact secondary panels at the bottom
//
// Empty-state honest: counts collapse to "—" and panels show neutral
// "no X today" copy when no server payload exists. No fake numbers,
// no fake names, no operator instructions.

import type { ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { TabId } from '../../app/tabs'
import { useMyBookViewModel } from '../../hooks/useMyBookViewModel'
import { useDailyWorklogViewModel } from '../../hooks/useWorklogViewModel'
import { useCatalystsViewModel } from '../../hooks/useCatalystsViewModel'
import { DEFAULT_WORKLOG_FILTERS, type WorklogItem } from '../../viewModels/worklog'

interface TodayProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly setActiveTab: (id: TabId) => void
}

export default function Today({ onSelectReport, onSelectTicker, setActiveTab }: TodayProps) {
  const book = useMyBookViewModel()
  const worklog = useDailyWorklogViewModel(DEFAULT_WORKLOG_FILTERS)
  const catalysts = useCatalystsViewModel()

  // Card counts — null means "loading or no data yet" → renders as "—"
  const priorityItems   = worklog.data?.summary.highPriority ?? null
  const portfolioTouched = book.data?.headline?.reportsOnBookToday ?? null
  const newBrokerNotes  = worklog.data?.summary.totalItems ?? null
  const upcomingCount   = catalysts.data?.upcoming7d.length ?? null

  // Items used by the priority feed + compact panels
  const allItems = worklog.data?.items ?? []
  const priorityList = allItems
    .filter((i) => i.priority.bucket === 'high')
    .slice(0, 6)
  const portfolioItems = allItems
    .filter((i) => i.book && (i.book.membership === 'held' || i.book.membership === 'watchlist'))
    .slice(0, 3)
  const recentItems = allItems.slice(0, 3)
  const upcomingCatalysts = (catalysts.data?.upcoming7d ?? []).slice(0, 3)

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-2xl tracking-tight">Today</h2>
        <p className="text-slate-400 text-sm">What changed and what to read first.</p>
      </header>

      <SummaryStrip
        priorityItems={priorityItems}
        portfolioTouched={portfolioTouched}
        newBrokerNotes={newBrokerNotes}
        upcomingCount={upcomingCount}
      />

      <PriorityFeed
        items={priorityList}
        loading={worklog.loading}
        onSelectReport={onSelectReport}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CompactPanel
          title="On your portfolio"
          empty="No new research on your positions today."
          loading={book.loading || worklog.loading}
          ctaLabel={portfolioItems.length > 0 ? 'View My Portfolio →' : null}
          onCta={() => setActiveTab('portfolio')}
        >
          {portfolioItems.map((it) => (
            <CompactItem key={it.id} item={it} onSelect={() => onSelectReport(it.reportId)}/>
          ))}
        </CompactPanel>

        <CompactPanel
          title="Recent broker notes"
          empty="No notes received today."
          loading={worklog.loading}
          ctaLabel={null}
        >
          {recentItems.map((it) => (
            <CompactItem key={it.id} item={it} onSelect={() => onSelectReport(it.reportId)}/>
          ))}
        </CompactPanel>

        <CompactPanel
          title="Upcoming catalysts"
          empty="No catalysts in the next week."
          loading={catalysts.loading}
          ctaLabel={upcomingCatalysts.length > 0 ? 'View Catalysts →' : null}
          onCta={() => setActiveTab('catalysts')}
        >
          {upcomingCatalysts.map((c) => (
            <button
              key={c.catalystId as unknown as string}
              onClick={() => onSelectTicker(c.ticker as StockTicker)}
              className="w-full text-left py-2 hover:bg-line/[0.04] rounded px-2 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-200 text-[12.5px] font-medium truncate">{c.ticker}</span>
                <span className="text-slate-500 text-[10.5px] num">{c.daysUntil > 0 ? `in ${c.daysUntil}d` : 'today'}</span>
              </div>
              <div className="text-slate-400 text-[11px] truncate">{c.headline}</div>
            </button>
          ))}
        </CompactPanel>
      </div>
    </div>
  )
}

// ── Summary strip ────────────────────────────────────────────────────────

function SummaryStrip({
  priorityItems, portfolioTouched, newBrokerNotes, upcomingCount,
}: {
  priorityItems: number | null
  portfolioTouched: number | null
  newBrokerNotes: number | null
  upcomingCount: number | null
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <SummaryCard label="Priority items" value={priorityItems}/>
      <SummaryCard label="Portfolio names touched" value={portfolioTouched}/>
      <SummaryCard label="New broker notes" value={newBrokerNotes}/>
      <SummaryCard label="Upcoming catalysts" value={upcomingCount}/>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number | null }) {
  // "—" both for not-loaded-yet and for honest zero. Per the contract:
  // never invent counts; show a neutral em-dash until the server reports.
  const display = value == null || value === 0 ? '—' : value.toLocaleString('en-US')
  const tone = value == null || value === 0 ? 'text-slate-500' : 'text-slate-100'
  return (
    <div className="rounded-lg bg-line/[0.02] px-4 py-3 flex flex-col gap-1.5">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className={`num text-[24px] leading-none font-semibold tracking-tight ${tone}`}>
        {display}
      </span>
    </div>
  )
}

// ── Priority feed ────────────────────────────────────────────────────────

function PriorityFeed({
  items, loading, onSelectReport,
}: {
  items: readonly WorklogItem[]
  loading: boolean
  onSelectReport: (id: ReportId) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-slate-100 text-base font-semibold">Priority feed</h3>
          <p className="text-slate-400 text-[12px]">The most important items to read first.</p>
        </div>
        {items.length > 0 && (
          <span className="text-[11px] text-slate-500 num">{items.length} item{items.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {loading && items.length === 0 ? (
        <PlaceholderCard text="Loading…"/>
      ) : items.length === 0 ? (
        <PlaceholderCard text="Your morning brief will appear here once server extraction is live."/>
      ) : (
        <ul className="flex flex-col">
          {items.map((it) => (
            <li key={it.id}>
              <button
                onClick={() => onSelectReport(it.reportId)}
                className="w-full text-left py-3 px-2 hover:bg-line/[0.04] rounded-md transition-colors flex flex-col gap-1.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    {it.ticker && <span className="num text-slate-100 text-[13px] font-semibold">{it.ticker}</span>}
                    <span className="text-slate-300 text-[12.5px] truncate">{it.headline || it.title}</span>
                  </div>
                  <span className="text-slate-500 text-[11px] num shrink-0">{relativeTime(it.receivedAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{it.brokerShortName}</span>
                  {it.rating && <><span>·</span><span>{it.rating}</span></>}
                  {it.targetChangePct != null && (
                    <>
                      <span>·</span>
                      <span className={it.targetChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {it.targetChangePct >= 0 ? '+' : ''}{it.targetChangePct.toFixed(1)}% TP
                      </span>
                    </>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PlaceholderCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-line/[0.02] py-10 px-6 text-center">
      <p className="text-slate-400 text-[13px] max-w-md mx-auto">{text}</p>
    </div>
  )
}

// ── Compact panel ────────────────────────────────────────────────────────

function CompactPanel({
  title, empty, loading, ctaLabel, onCta, children,
}: {
  title: string
  empty: string
  loading: boolean
  ctaLabel: string | null
  onCta?: () => void
  children: React.ReactNode
}) {
  const childArr = Array.isArray(children) ? children : [children]
  const hasContent = childArr.some((c) => c)
  return (
    <div className="rounded-lg bg-line/[0.02] p-4 flex flex-col gap-2 min-h-[140px]">
      <div className="flex items-baseline justify-between">
        <h4 className="text-slate-200 text-[13px] font-medium">{title}</h4>
        {ctaLabel && (
          <button onClick={onCta} className="text-[11px] text-accent hover:text-accent-soft transition-colors">
            {ctaLabel}
          </button>
        )}
      </div>
      {loading && !hasContent ? (
        <p className="text-slate-500 text-[12px]">Loading…</p>
      ) : !hasContent ? (
        <p className="text-slate-500 text-[12px]">{empty}</p>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
    </div>
  )
}

function CompactItem({ item, onSelect }: { item: WorklogItem; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left py-2 px-2 hover:bg-line/[0.04] rounded transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-200 text-[12px] font-medium truncate">
          {item.ticker ?? item.brokerShortName}
        </span>
        <span className="text-slate-500 text-[10.5px] num">{relativeTime(item.receivedAt)}</span>
      </div>
      <div className="text-slate-400 text-[11px] truncate">{item.headline || item.title}</div>
    </button>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string, fromMs: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const ms = fromMs - t
  if (ms < 60_000)     return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}
