import type { ReportId, StockTicker } from '../../domain'
import type {
  MyBookActivityRow, MyBookPositionCardViewModel, MyBookSection,
} from '../../viewModels/portfolio'
import { useMyBookViewModel } from '../../hooks/useMyBookViewModel'
import { useAlertFeed } from '../../hooks/useAlertFeed'
import { STANCE_TEXT_COLOR, RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import BookBadge from '../portfolio/BookBadge'
import AlertBanner from '../alerts/AlertBanner'
import RankCompareChip from '../adaptiveRanking/RankCompareChip'
import { adaptiveRankingFlags } from '../../engine'

interface MyBookProps {
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onOpenDivergence: () => void
  readonly onOpenBriefing: () => void
}

export default function MyBook({ onSelectReport, onSelectTicker, onOpenDivergence, onOpenBriefing }: MyBookProps) {
  const { data, loading, error } = useMyBookViewModel()
  const feed = useAlertFeed({ limit: 50 })
  if (error)             return <ViewMessage tone="error"   text={`Error: ${error.message}`}/>
  if (loading || !data)  return <ViewMessage tone="loading" text="Loading book…"/>

  if (!data.hasPortfolio) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-slate-100 font-semibold text-base">My Book</h2>
          <p className="text-slate-400 text-[12px]">Portfolio-aware morning view: today's activity on positions, broker changes on held names, and coverage gaps.</p>
        </header>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No portfolio configured</div>
          <p className="max-w-md mx-auto">
            Connect a portfolio source to enable book-level relevance ranking,
            coverage analytics, and the My Book morning view. The rest of the
            dashboard works without a portfolio — switch to the Daily Worklog or
            By Stock to continue.
          </p>
          <p className="text-slate-500 text-[11px] mt-3">See <code className="kbd">docs/portfolio.md</code> for setup.</p>
        </div>
      </div>
    )
  }

  const h = data.headline

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">My Book</h2>
          <p className="text-slate-400 text-[12px]">
            Portfolio-aware morning view. Snapshot as of {data.snapshotAsOf?.slice(0, 10) ?? '—'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <Stat label="Held"          value={String(h.heldCount)}/>
          <Stat label="Watchlist"     value={String(h.watchlistCount)}/>
          <Stat label="Gross"         value={h.grossExposurePct !== null ? `${h.grossExposurePct.toFixed(1)}%` : '—'}/>
          <Stat label="On book today" value={String(h.reportsOnBookToday)} tone="accent"/>
          <Stat label="On book 7d"    value={String(h.reportsOnBookLast7d)}/>
          <Stat label="High relevance" value={String(h.criticalToday)} tone="rose"/>
          <Stat label="Stale / thin"   value={String(h.staleCoverageCount)} tone="amber"/>
          <Stat label="Divergent"      value={String(h.unresolvedDivergenceCount)} tone="amber"/>
        </div>
      </header>

      {data.degradations.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-amber-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Degraded</span>
          {data.degradations.join('  ·  ')}
        </div>
      )}

      {feed.data && (
        <AlertBanner cards={feed.data.groups.flatMap((g) => g.items)} onOpenBriefing={onOpenBriefing}/>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ActivitySection
          section={data.todayOnBook}
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
        />
        <ActivitySection
          section={data.significantChanges}
          onSelectReport={onSelectReport}
          onSelectTicker={onSelectTicker}
        />
      </div>

      <PositionGroupSection
        section={data.unresolvedDivergence}
        actionLabel="Open in Divergence"
        onAction={onOpenDivergence}
        onSelectTicker={onSelectTicker}
      />

      <ActivitySection
        section={data.watchlistFresh}
        onSelectReport={onSelectReport}
        onSelectTicker={onSelectTicker}
      />

      <PositionGroupSection
        section={data.staleCoverage}
        actionLabel={null}
        onAction={null}
        onSelectTicker={onSelectTicker}
      />

      <section>
        <h3 className="section-title mb-2">All positions ({data.positions.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {data.positions.map((p) => (
            <PositionCard key={p.ticker as string} card={p} onSelectTicker={onSelectTicker} onSelectReport={onSelectReport}/>
          ))}
        </div>
      </section>
    </div>
  )
}

function ActivitySection({
  section, onSelectReport, onSelectTicker,
}: {
  section: MyBookSection<MyBookActivityRow>
  onSelectReport: (id: ReportId) => void
  onSelectTicker: (t: StockTicker) => void
}) {
  return (
    <section className="panel p-3 flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-slate-100 text-[13px] font-semibold">{section.title}</h3>
          <p className="text-slate-500 text-[11px]">{section.subtitle}</p>
        </div>
        <span className="text-slate-500 text-[11px] num">{section.items.length}</span>
      </div>
      {section.items.length === 0 && (
        <div className="text-[11.5px] text-slate-500 py-3 px-1">{section.emptyText}</div>
      )}
      <ul className="flex flex-col gap-1">
        {section.items.map((row) => (
          <li key={`${row.reportId}:${row.ticker}`}>
            <ActivityRow row={row} onSelectReport={onSelectReport} onSelectTicker={onSelectTicker}/>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActivityRow({
  row, onSelectReport, onSelectTicker,
}: {
  row: MyBookActivityRow
  onSelectReport: (id: ReportId) => void
  onSelectTicker: (t: StockTicker) => void
}) {
  const bucket = row.relevance.bucket
  const tone =
    bucket === 'critical' ? 'border-rose-500/40 bg-rose-500/5'
    : bucket === 'high'    ? 'border-amber-500/30 bg-amber-500/5'
    : bucket === 'medium'  ? 'border-line/10'
    :                         'border-line/5'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectReport(row.reportId)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(row.reportId) } }}
      className={`w-full text-left px-2.5 py-2 rounded border ${tone} hover:bg-line/[0.03] transition-colors cursor-pointer`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-5 h-5 rounded-sm flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-ink-950"
          style={{ background: row.brokerColor ?? '#94a3b8' }}
        >{row.brokerShortName.slice(0, 3).toUpperCase()}</span>

        <button
          onClick={(e) => { e.stopPropagation(); onSelectTicker(row.ticker) }}
          className="chip border border-line/10 text-slate-200 hover:text-accent text-[10.5px] flex-shrink-0"
        >{row.ticker as unknown as string}</button>

        <BookBadge membership={row.membership} direction={row.relevance.direction} weightPct={row.relevance.weightPct} conviction={row.relevance.conviction} compact/>

        <RelevanceChip bucket={bucket}/>

        {adaptiveRankingFlags().showCompare && row.adaptive && row.adaptive.adjustment.applied && (
          <RankCompareChip annotation={row.adaptive} compact/>
        )}

        <span className={`flex-1 truncate text-[12px] ${STANCE_TEXT_COLOR[row.stance]}`} title={row.headline}>
          {row.headline}
        </span>

        <div className="text-right shrink-0 min-w-[80px]">
          {row.rating && (
            <div className={`text-[10.5px] ${RATING_TEXT_COLOR[row.rating as keyof typeof RATING_TEXT_COLOR]}`}>{row.rating}</div>
          )}
          {row.targetPrice !== null && (
            <div className="num text-[10.5px] text-slate-300">{formatPrice(row.targetPrice, row.targetCurrency)}</div>
          )}
        </div>
      </div>
      <div className="mt-1 ml-7 text-[10.5px] text-slate-500 truncate">
        {row.relevance.bookSummary}
      </div>
    </div>
  )
}

function PositionGroupSection({
  section, actionLabel, onAction, onSelectTicker,
}: {
  section: MyBookSection<MyBookPositionCardViewModel>
  actionLabel: string | null
  onAction: (() => void) | null
  onSelectTicker: (t: StockTicker) => void
}) {
  return (
    <section className="panel p-3">
      <div className="flex items-end justify-between mb-2 gap-3">
        <div>
          <h3 className="text-slate-100 text-[13px] font-semibold">{section.title}</h3>
          <p className="text-slate-500 text-[11px]">{section.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="num">{section.items.length}</span>
          {actionLabel && onAction && (
            <button onClick={onAction} className="chip border border-line/10 text-slate-300 hover:text-accent">{actionLabel} →</button>
          )}
        </div>
      </div>
      {section.items.length === 0 && (
        <div className="text-[11.5px] text-slate-500 py-3 px-1">{section.emptyText}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {section.items.map((c) => (
          <PositionCard key={c.ticker as string} card={c} onSelectTicker={onSelectTicker} onSelectReport={null}/>
        ))}
      </div>
    </section>
  )
}

function PositionCard({
  card, onSelectTicker, onSelectReport,
}: {
  card: MyBookPositionCardViewModel
  onSelectTicker: (t: StockTicker) => void
  onSelectReport: ((id: ReportId) => void) | null
}) {
  const stale = card.daysSinceLastReport === null || (card.membership === 'held' && (card.daysSinceLastReport ?? 0) > 14)
  return (
    <div className={`panel p-3 flex flex-col gap-1.5 ${stale ? 'border-amber-500/20' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onSelectTicker(card.ticker)}
          className="text-left hover:text-accent"
        >
          <div className="text-slate-100 font-semibold text-[13px]">{card.ticker as unknown as string}</div>
          <div className="text-slate-500 text-[10.5px] truncate max-w-[180px]">{card.stockName ?? '—'}</div>
        </button>
        <BookBadge membership={card.membership} direction={card.direction} weightPct={card.weightPct} conviction={card.conviction} compact/>
      </div>

      {card.note && (
        <div className="text-[11px] text-slate-400 italic line-clamp-2">"{card.note}"</div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-300 mt-1">
        <span className="text-slate-500">7d:</span>
        <span className="num">{card.reportsLast7d}</span>
        <span className="text-slate-500">brokers:</span>
        <span className="num">{card.distinctBrokersLast7d}</span>
        <span className="text-slate-500">last:</span>
        <span className="num">
          {card.daysSinceLastReport === null ? '—' :
            card.daysSinceLastReport === 0 ? 'today' :
            `${card.daysSinceLastReport}d`}
        </span>
      </div>

      {card.riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {card.riskFlags.map((f) => (
            <span key={f} className="chip text-[9.5px] border border-amber-500/30 text-amber-300 bg-amber-500/5">{prettyFlag(f)}</span>
          ))}
        </div>
      )}

      {card.headlineRelevance && card.headlineReportId && onSelectReport && (
        <button
          onClick={() => onSelectReport(card.headlineReportId!)}
          className="mt-1 text-left text-[11px] text-slate-400 hover:text-slate-200 truncate"
          title={card.headlineRelevance.bookSummary}
        >
          → {card.headlineRelevance.bookSummary}
        </button>
      )}
    </div>
  )
}

function RelevanceChip({ bucket }: { bucket: string }) {
  const tone =
    bucket === 'critical' ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
    : bucket === 'high'    ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
    : bucket === 'medium'  ? 'border-slate-400/30 text-slate-200 bg-line/[0.04]'
    :                         'border-line/10 text-slate-500 bg-transparent'
  return (
    <span className={`chip border ${tone} text-[9px] uppercase tracking-wider font-semibold`}>{bucket}</span>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'rose' | 'amber' }) {
  const valueClass =
    tone === 'accent' ? 'text-accent'
    : tone === 'rose' ? 'text-rose-300'
    : tone === 'amber'? 'text-amber-300'
    :                    'text-slate-100'
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`num text-[12px] font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

function prettyFlag(f: string): string {
  return f.replace(/_/g, ' ')
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
