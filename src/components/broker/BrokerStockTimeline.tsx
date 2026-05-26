import { useState } from 'react'
import type { ReportId } from '../../domain'
import type { BrokerTimelineEntry } from '../../viewModels/brokerDetail'
import type { SignificanceBucket } from '../../viewModels/brokerMemory/types'
import {
  RATING_TEXT_COLOR, formatPrice, formatShortDate,
} from '../../viewModels/shared'

interface Props {
  readonly ticker: string
  readonly stockName: string | null
  readonly entries: readonly BrokerTimelineEntry[]
  readonly onSelectReport: (id: ReportId) => void
}

export default function BrokerStockTimeline({ ticker, stockName, entries, onSelectReport }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] text-slate-500 p-6">
        No notes from this broker on this stock yet.
      </div>
    )
  }

  const changeCount = entries.filter((e) => {
    const b = e.change.significance.bucket
    return b === 'major' || b === 'moderate'
  }).length
  const oldest = entries[entries.length - 1]!
  const newest = entries[0]!

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-line/5">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-semibold text-[14px]">{ticker}</span>
          {stockName && <span className="text-slate-400 text-[11.5px] truncate">· {stockName}</span>}
        </div>
        <div className="text-[10.5px] text-slate-500 mt-0.5">
          {entries.length} note{entries.length === 1 ? '' : 's'}
          {changeCount > 0 && <> · {changeCount} view change{changeCount === 1 ? '' : 's'}</>}
          {' · coverage '}{formatShortDate(oldest.publishedAt)} – {formatShortDate(newest.publishedAt)}
        </div>
      </div>
      <ol className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {entries.map((e, i) => (
          <TimelineRow
            key={e.reportId as unknown as string}
            entry={e}
            isLast={i === entries.length - 1}
            onSelectReport={onSelectReport}
          />
        ))}
      </ol>
    </div>
  )
}

function TimelineRow({ entry, isLast, onSelectReport }: {
  entry: BrokerTimelineEntry
  isLast: boolean
  onSelectReport: (id: ReportId) => void
}) {
  const [open, setOpen] = useState(false)
  const c = entry.change
  const bucket = c.significance.bucket
  const move = isMove(bucket)
  const tone = markerTone(c)

  return (
    <li className="flex gap-3 relative">
      {/* Date + marker rail */}
      <div className="w-12 shrink-0 flex flex-col items-end pt-0.5">
        <span className="num text-[10.5px] text-slate-400">{formatShortDate(entry.publishedAt)}</span>
        <span className="text-[9.5px] text-slate-600 num">{entry.publishedAt.slice(0, 4)}</span>
      </div>
      <div className="w-4 shrink-0 flex flex-col items-center">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-2 ring-ink-950 ${tone.dot}`}/>
        {!isLast && <span className={`flex-1 w-px ${tone.line} mt-1 mb-1`}/>}
      </div>

      {/* Body */}
      <div className={`flex-1 min-w-0 pb-4 ${move ? '' : 'opacity-80'}`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectReport(entry.reportId)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(entry.reportId) } }}
          className="w-full text-left rounded border border-line/5 hover:border-line/15 hover:bg-line/[0.02] focus:outline-none focus:border-accent/40 transition-colors p-2.5 flex flex-col gap-1.5 cursor-pointer"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {move && (
              <span className={`chip border ${tone.badge} text-[9px] font-bold tracking-wider`}>
                {bucketLabel(bucket)}
              </span>
            )}
            {entry.rating && (
              <span className={`text-[11px] ${RATING_TEXT_COLOR[entry.rating]}`}>
                {c.ratingChanged && c.ratingBefore ? (
                  <><span className="text-slate-500 line-through mr-1">{c.ratingBefore}</span>{entry.rating}</>
                ) : entry.rating}
              </span>
            )}
            {entry.targetPrice !== null && (
              <span className="text-[11px] text-slate-300 num">
                {formatPrice(entry.targetPrice, entry.targetCurrency, 0)}
                {c.targetChangePct !== null && Math.abs(c.targetChangePct) >= 0.5 && (
                  <span className={`ml-1 ${c.targetChangePct > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {c.targetChangePct > 0 ? '▲' : '▼'} {Math.abs(c.targetChangePct).toFixed(1)}%
                  </span>
                )}
              </span>
            )}
            <span className="ml-auto text-[9.5px] text-slate-600 hover:text-slate-400">View report →</span>
          </div>

          <div className="text-[12px] text-slate-100 leading-snug">
            {bucket === 'first_coverage' ? 'Initiated coverage' : c.headline}
          </div>

          {entry.thesis && (
            <ThesisLine
              text={entry.thesis}
              open={open}
              onToggle={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(!open) }}
            />
          )}

          {(c.themesAdded.length > 0 || c.themesDropped.length > 0 || c.risksAdded.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {c.themesAdded.slice(0, 3).map((t) => (
                <span key={`a-${t}`} className="chip border border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.04] text-[9px]" title="New theme">+ {t}</span>
              ))}
              {c.themesDropped.slice(0, 3).map((t) => (
                <span key={`d-${t}`} className="chip border border-slate-500/30 text-slate-400 text-[9px]" title="Dropped theme">– {t}</span>
              ))}
              {c.risksAdded.slice(0, 2).map((r) => (
                <span key={`r-${r}`} className="chip border border-rose-500/30 text-rose-300 bg-rose-500/[0.04] text-[9px]" title="New risk">⚠ {r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function ThesisLine({ text, open, onToggle }: {
  text: string
  open: boolean
  onToggle: (e: React.MouseEvent) => void
}) {
  const truncated = text.length > 160
  return (
    <div className="text-[11.5px] text-slate-400 leading-relaxed">
      <span className={open ? '' : 'line-clamp-2'}>{text}</span>
      {truncated && (
        <button
          onClick={onToggle}
          className="ml-1 text-slate-500 hover:text-slate-300 text-[10.5px]"
        >{open ? 'less' : 'more'}</button>
      )}
    </div>
  )
}

function isMove(bucket: SignificanceBucket): boolean {
  return bucket === 'major' || bucket === 'moderate' || bucket === 'first_coverage'
}

function bucketLabel(bucket: SignificanceBucket): string {
  if (bucket === 'first_coverage') return 'Initiation'
  if (bucket === 'minor') return 'Reiterated'
  return bucket
}

function markerTone(c: BrokerTimelineEntry['change']): { dot: string; line: string; badge: string } {
  const bucket = c.significance.bucket
  if (bucket === 'first_coverage') {
    return {
      dot: 'bg-accent',
      line: 'bg-line/10',
      badge: 'border-accent/40 text-accent bg-accent/10',
    }
  }
  if (bucket === 'major') {
    const tp = c.targetChangePct
    if (tp !== null && tp <= -0.5) {
      return { dot: 'bg-rose-400', line: 'bg-line/10', badge: 'border-rose-500/40 text-rose-300 bg-rose-500/10' }
    }
    if (tp !== null && tp >= 0.5) {
      return { dot: 'bg-emerald-400', line: 'bg-line/10', badge: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' }
    }
    return { dot: 'bg-amber-400', line: 'bg-line/10', badge: 'border-amber-500/40 text-amber-300 bg-amber-500/10' }
  }
  if (bucket === 'moderate') {
    return { dot: 'bg-amber-400/70', line: 'bg-line/10', badge: 'border-amber-500/30 text-amber-300 bg-amber-500/[0.06]' }
  }
  return { dot: 'bg-slate-500/60', line: 'bg-line/5', badge: 'border-slate-500/20 text-slate-400' }
}
