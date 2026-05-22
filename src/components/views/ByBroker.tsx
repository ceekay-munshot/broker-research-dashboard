import { useState } from 'react'
import type { ReportId } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { BrokerCardViewModel, BrokerBookActivityItem } from '../../viewModels/byBroker'
import { useByBrokerViewModel } from '../../viewModels/byBroker'
import { STANCE_TEXT_COLOR, formatShortDate } from '../../viewModels/shared'
import { BROKER_GLYPH_CLASS } from '../../lib/semanticColor'
import { useAdapterQuery } from '../../hooks/useAdapterQuery'
import BrokerRecentChanges from '../broker/BrokerRecentChanges'
import BookBadge from '../portfolio/BookBadge'
import RankCompareChip from '../adaptiveRanking/RankCompareChip'
import { adaptiveRankingFlags } from '../../engine'

interface ByBrokerProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
}

export default function ByBroker({ filters, onSelectReport }: ByBrokerProps) {
  const { data, loading, error } = useByBrokerViewModel(filters)
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const stocks  = useAdapterQuery((a, s) => a.listStocks(s), [])

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-broker view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Broker / Research House</h2>
          <p className="text-slate-400 text-[12px]">Stance mix, latest notes, and top themes per research house.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {data.brokers.map((b) => <BrokerCard key={b.brokerId} b={b} onSelectReport={onSelectReport}/>)}
      </div>

      {brokers.data && stocks.data && (
        <BrokerRecentChanges
          brokers={brokers.data}
          stocks={stocks.data}
          onSelectReport={onSelectReport}
        />
      )}
    </div>
  )
}

function StanceBar({ counts }: { counts: BrokerCardViewModel['stanceCounts'] }) {
  const total = Math.max(1, counts.bullish + counts.neutral + counts.bearish)
  const pct = (v: number) => (100 * v / total).toFixed(0)
  return (
    <div className="flex w-full h-1.5 rounded overflow-hidden bg-line/5">
      <div className="bg-emerald-500/80" style={{ width: `${pct(counts.bullish)}%` }} title={`Bullish ${counts.bullish}`}/>
      <div className="bg-slate-500/60"   style={{ width: `${pct(counts.neutral)}%` }} title={`Neutral ${counts.neutral}`}/>
      <div className="bg-rose-500/80"    style={{ width: `${pct(counts.bearish)}%` }} title={`Bearish ${counts.bearish}`}/>
    </div>
  )
}

function BrokerCard({ b, onSelectReport }: { b: BrokerCardViewModel; onSelectReport: (id: ReportId) => void }) {
  const [expanded, setExpanded] = useState(false)
  const expandable = b.notes.length > 3
  const shownNotes = expanded ? b.notes : b.notes.slice(0, 3)
  const toggle = () => { if (expandable) setExpanded((v) => !v) }

  return (
    <div
      className={`panel panel-hover p-4 flex flex-col gap-3 ${expandable ? 'cursor-pointer' : ''}`}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={expandable ? toggle : undefined}
      onKeyDown={expandable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
      } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-sm flex items-center justify-center text-[11px] font-bold ${BROKER_GLYPH_CLASS}`}
          >
            {b.shortName.slice(0, 3).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-slate-100 text-[13px] font-semibold">{b.name}</span>
            <span className="text-[10.5px] uppercase tracking-widest text-slate-500">
              {b.reportCount} {b.reportCount === 1 ? 'note' : 'notes'} · {b.tickersCovered} {b.tickersCovered === 1 ? 'stock' : 'stocks'}
              {b.latestReportAt && <> · latest {formatShortDate(b.latestReportAt)}</>}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {b.conflictCount > 0 && (
            <span
              className="chip border border-amber-500/40 text-amber-300 bg-amber-500/10 text-[9.5px]"
              title={`${b.conflictCount} note${b.conflictCount === 1 ? '' : 's'} flagged for QA — broker conflict or broker/stock overlap`}
            >QA {b.conflictCount}</span>
          )}
          {expandable && (
            <span
              className={`text-slate-500 text-[16px] leading-none transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >›</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-slate-500 w-14">Stance</span>
        <StanceBar counts={b.stanceCounts}/>
        <div className="flex gap-2 num w-28 justify-end">
          <span className="text-emerald-400">{b.stanceCounts.bullish}</span>
          <span className="text-slate-400">{b.stanceCounts.neutral}</span>
          <span className="text-rose-400">{b.stanceCounts.bearish}</span>
        </div>
      </div>

      <div>
        <div className="section-title mb-1.5">
          Latest notes
          {expandable && !expanded && (
            <span className="text-slate-500"> · 3 of {b.notes.length}</span>
          )}
        </div>
        <ul className={`flex flex-col gap-1.5 ${expanded ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
          {b.notes.length === 0 && (
            <li className="text-[11.5px] text-slate-500">No recent notes in the selected range.</li>
          )}
          {shownNotes.map((r) => (
            <li key={r.reportId}>
              <button
                onClick={(e) => { e.stopPropagation(); onSelectReport(r.reportId) }}
                className="w-full text-left flex items-start gap-2 text-[12px] leading-tight hover:text-slate-100 transition-colors"
              >
                <span
                  className="num text-[10.5px] text-slate-500 w-12 pt-0.5"
                  title={r.brokerEvidence ? `Broker resolved from: ${r.brokerEvidence}` : undefined}
                >{formatShortDate(r.publishedAt)}</span>
                {r.ticker && (
                  <span className={`chip border ${r.stance === 'bullish' ? 'border-emerald-500/30 text-emerald-400' : r.stance === 'bearish' ? 'border-rose-500/30 text-rose-400' : 'border-slate-500/30 text-slate-300'}`}>{r.ticker}</span>
                )}
                <span className={`flex-1 truncate ${STANCE_TEXT_COLOR[r.stance]}`} title={r.headline}>{r.headline}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="section-title mb-1.5">Top themes</div>
        <div className="flex flex-wrap gap-1.5">
          {b.topThemes.length === 0 && <span className="text-[11.5px] text-slate-500">No themes identified.</span>}
          {b.topThemes.map((t) => (
            <span key={t.theme} className="chip bg-line/[0.04] border border-line/5 text-slate-300">
              {t.theme}<span className="text-slate-500 num">·{t.count}</span>
            </span>
          ))}
        </div>
      </div>

      {b.bookActivity.hasPortfolio && (
        <BookActivitySection activity={b.bookActivity} onSelectReport={onSelectReport}/>
      )}
    </div>
  )
}

function BookActivitySection({
  activity, onSelectReport,
}: {
  activity: BrokerCardViewModel['bookActivity']
  onSelectReport: (id: ReportId) => void
}) {
  return (
    <div className="border-t border-line/5 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="section-title">On book</div>
        <span className="text-[10.5px] text-slate-500 num">
          {activity.onBookCount} on book
          {activity.outlierOnBookCount > 0 && (
            <span className="text-amber-400"> · {activity.outlierOnBookCount} outlier</span>
          )}
        </span>
      </div>
      {activity.latestOnBook.length === 0 ? (
        <div className="text-[11.5px] text-slate-500">No coverage on the book in this window.</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {activity.latestOnBook.map((it) => (
            <li key={it.reportId}>
              <BookActivityRow item={it} onSelectReport={onSelectReport}/>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BookActivityRow({
  item, onSelectReport,
}: {
  item: BrokerBookActivityItem
  onSelectReport: (id: ReportId) => void
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelectReport(item.reportId) }}
      className="w-full text-left flex items-center gap-2 text-[11.5px] hover:bg-line/[0.03] rounded px-1 py-0.5 transition-colors"
    >
      <span className="num text-[10.5px] text-slate-500 w-12">{formatShortDate(item.publishedAt)}</span>
      {item.ticker && <span className="chip border border-line/10 text-slate-200 text-[10px]">{item.ticker as unknown as string}</span>}
      <BookBadge membership={item.membership} compact/>
      <span className={`chip text-[9.5px] uppercase tracking-wider border ${
        item.relevanceBucket === 'critical' ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
        : item.relevanceBucket === 'high'    ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
        : item.relevanceBucket === 'medium'  ? 'border-line/10 text-slate-300'
        :                                       'border-line/10 text-slate-500'
      }`}>{item.relevanceBucket}</span>
      {item.isOutlier && <span className="chip text-[9px] border border-amber-500/40 text-amber-300">outlier</span>}
      {adaptiveRankingFlags().showCompare && item.adaptive && item.adaptive.adjustment.applied && (
        <RankCompareChip annotation={item.adaptive} compact/>
      )}
      <span className={`flex-1 truncate ${STANCE_TEXT_COLOR[item.stance]}`} title={item.bookSummary}>{item.headline}</span>
    </button>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
