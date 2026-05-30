import { useState } from 'react'
import type { ReportId, Stance } from '../../domain'
import type { BrokerTimelineEntry } from '../../viewModels/brokerDetail'
import type { ReportChangeSet } from '../../viewModels/brokerMemory/types'
import {
  RATING_TEXT_COLOR, formatPrice, formatShortDate,
} from '../../viewModels/shared'

// A broker's notes on one stock, newest first. Each row answers four things a
// reader actually wants — in this order:
//   1. the stance   (rating + target)
//   2. why          (the one-line thesis)
//   3. did it change (Upgraded / Cut target / Reiterated …)
//   4. why it changed (the themes / risks that moved)
// Everything else from the raw note lives one click away, in the report.

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

  const changeCount = entries.filter((e) => isChange(e.change)).length
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
          {changeCount > 0 && <> · {changeCount} change{changeCount === 1 ? '' : 's'}</>}
          {' · '}{formatShortDate(oldest.publishedAt)} – {formatShortDate(newest.publishedAt)}
        </div>
      </div>
      <ol className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {entries.map((e, i) => (
          <TimelineRow
            key={e.reportId as unknown as string}
            entry={e}
            stockName={stockName}
            isLast={i === entries.length - 1}
            onSelectReport={onSelectReport}
          />
        ))}
      </ol>
    </div>
  )
}

function TimelineRow({ entry, stockName, isLast, onSelectReport }: {
  entry: BrokerTimelineEntry
  stockName: string | null
  isLast: boolean
  onSelectReport: (id: ReportId) => void
}) {
  const [open, setOpen] = useState(false)
  const c = entry.change
  const tag = changeTag(c)
  const why = whyText(entry.thesis, stockName)
  const tgt = c.targetChangePct
  const tgtMoved = tgt !== null && Math.abs(tgt) >= 0.5
  const drivers = driverChips(c)

  return (
    <li className="flex gap-3 relative">
      {/* Date + marker rail */}
      <div className="w-12 shrink-0 flex flex-col items-end pt-0.5">
        <span className="num text-[10.5px] text-slate-400">{formatShortDate(entry.publishedAt)}</span>
        <span className="text-[9.5px] text-slate-600 num">{entry.publishedAt.slice(0, 4)}</span>
      </div>
      <div className="w-4 shrink-0 flex flex-col items-center">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-2 ring-ink-950 ${markerDot(c)}`}/>
        {!isLast && <span className="flex-1 w-px bg-line/10 mt-1 mb-1"/>}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 pb-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectReport(entry.reportId)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(entry.reportId) } }}
          className="group w-full text-left rounded-md border border-line/5 hover:border-line/15 hover:bg-line/[0.02] focus:outline-none focus:border-accent/40 transition-colors p-2.5 flex flex-col gap-1.5 cursor-pointer"
        >
          {/* 1 — stance, and 3 — did it change */}
          <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
            {entry.rating && (
              <span className={`text-[13px] font-semibold ${RATING_TEXT_COLOR[entry.rating]}`}>{entry.rating}</span>
            )}
            {entry.targetPrice !== null && (
              <span className="text-[12px] text-slate-300 num">
                {formatPrice(entry.targetPrice, entry.targetCurrency, 0)}
                {tgtMoved && (
                  <span className={`ml-1 ${tgt! > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tgt! > 0 ? '▲' : '▼'} {Math.abs(tgt!).toFixed(1)}%
                  </span>
                )}
              </span>
            )}
            {tag && (
              <span className={`text-[10.5px] font-medium ${TAG_TONE[tag.tone]}`}>{tag.label}</span>
            )}
            <span className="ml-auto text-[9.5px] text-slate-600 group-hover:text-slate-400 shrink-0">View report →</span>
          </div>

          {/* 2 — why */}
          {why && (
            <WhyLine
              text={why}
              open={open}
              onToggle={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(!open) }}
            />
          )}

          {/* 4 — why it changed */}
          {drivers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {drivers.map((d) => (
                <span
                  key={d.key}
                  title={d.title}
                  className={`chip text-[9px] border max-w-[180px] truncate ${d.cls}`}
                >
                  {d.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function WhyLine({ text, open, onToggle }: {
  text: string
  open: boolean
  onToggle: (e: React.MouseEvent) => void
}) {
  const truncated = text.length > 150
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

// ── Change semantics ──────────────────────────────────────────────────

const RATING_RANK: Readonly<Record<string, number>> = {
  Sell: 0, Underweight: 1, 'Not Rated': 2, Hold: 2, Overweight: 3, Buy: 4,
}
const STANCE_RANK: Readonly<Record<Stance, number>> = { bearish: 0, neutral: 1, bullish: 2 }

/** Did the call get more positive or more negative vs the prior note? Stance
 *  is the cleaner signal; rating rank breaks ties (e.g. Sell→Underweight, both
 *  bearish). Null when nothing directional moved. */
function moveDirection(c: ReportChangeSet): 'up' | 'down' | null {
  if (c.stanceBefore && c.stanceAfter && c.stanceAfter !== c.stanceBefore) {
    return STANCE_RANK[c.stanceAfter] > STANCE_RANK[c.stanceBefore] ? 'up' : 'down'
  }
  if (c.ratingChanged && c.ratingBefore && c.ratingAfter) {
    const a = RATING_RANK[c.ratingAfter] ?? 2
    const b = RATING_RANK[c.ratingBefore] ?? 2
    if (a !== b) return a > b ? 'up' : 'down'
  }
  return null
}

function isChange(c: ReportChangeSet): boolean {
  const b = c.significance.bucket
  return b === 'major' || b === 'moderate' || b === 'first_coverage'
}

type TagTone = 'up' | 'down' | 'new' | 'muted'
const TAG_TONE: Readonly<Record<TagTone, string>> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  new: 'text-accent',
  muted: 'text-slate-500',
}

/** The "did it change?" answer, in plain words. The target move is shown
 *  inline on the price, so this focuses on the rating/coverage story. */
function changeTag(c: ReportChangeSet): { label: string; tone: TagTone } | null {
  if (c.significance.bucket === 'first_coverage') return { label: 'Initiated coverage', tone: 'new' }
  if (c.ratingChanged && c.ratingBefore) {
    const dir = moveDirection(c)
    if (dir === 'up') return { label: `Upgraded · was ${c.ratingBefore}`, tone: 'up' }
    if (dir === 'down') return { label: `Downgraded · was ${c.ratingBefore}`, tone: 'down' }
    return { label: `Rating changed · was ${c.ratingBefore}`, tone: 'muted' }
  }
  const moved =
    (c.targetChangePct !== null && Math.abs(c.targetChangePct) >= 0.5)
    || c.stanceChanged
    || c.themesAdded.length > 0 || c.themesDropped.length > 0
    || c.risksAdded.length > 0 || c.risksDropped.length > 0
  // Nothing of substance moved — say so plainly, quietly.
  return moved ? null : { label: 'Reiterated', tone: 'muted' }
}

/** Why the view changed — the themes that came on / dropped off the table and
 *  any risk that appeared or cleared. Risk text is long and lives in the
 *  report, so we surface it as a count, not a wall of caps. */
function driverChips(c: ReportChangeSet): ReadonlyArray<{ key: string; label: string; title?: string; cls: string }> {
  const out: Array<{ key: string; label: string; title?: string; cls: string }> = []
  for (const t of c.themesAdded.slice(0, 2)) {
    out.push({ key: `a-${t}`, label: `↑ ${t}`, title: 'Theme now in focus', cls: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.04]' })
  }
  for (const t of c.themesDropped.slice(0, 2)) {
    out.push({ key: `d-${t}`, label: `↓ ${t}`, title: 'Theme dropped', cls: 'border-slate-500/30 text-slate-400' })
  }
  if (c.risksAdded.length > 0) {
    out.push({
      key: 'risk-add',
      label: `⚠ ${c.risksAdded.length} new risk${c.risksAdded.length === 1 ? '' : 's'}`,
      title: c.risksAdded.join('\n'),
      cls: 'border-rose-500/30 text-rose-300 bg-rose-500/[0.04]',
    })
  }
  if (c.risksDropped.length > 0) {
    out.push({
      key: 'risk-drop',
      label: `✓ ${c.risksDropped.length} risk${c.risksDropped.length === 1 ? '' : 's'} cleared`,
      title: c.risksDropped.join('\n'),
      cls: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.04]',
    })
  }
  return out
}

/** The thesis, minus the boilerplate that just restates the stance the card
 *  already shows ("HDFC Bank: we rate the stock Hold with a ₹1,840 target
 *  (+3% upside)."). Conservative — only strips that exact opener and a leading
 *  "<Stock>: " label, and falls back to the full text if neither is present. */
function whyText(thesis: string, stockName: string | null): string {
  let t = (thesis ?? '').trim()
  if (stockName && t.toLowerCase().startsWith(`${stockName.toLowerCase()}:`)) {
    t = t.slice(stockName.length + 1).trim()
  }
  const stripped = t.replace(/^we rate\b.*?\.\s+/i, '').trim()
  return stripped.length > 0 ? stripped : t
}

function markerDot(c: ReportChangeSet): string {
  const bucket = c.significance.bucket
  if (bucket === 'first_coverage') return 'bg-accent'
  const dir = moveDirection(c)
  const tgt = c.targetChangePct
  const up = dir === 'up' || (dir === null && tgt !== null && tgt >= 0.5)
  const down = dir === 'down' || (dir === null && tgt !== null && tgt <= -0.5)
  if (up) return bucket === 'major' ? 'bg-emerald-400' : 'bg-emerald-400/60'
  if (down) return bucket === 'major' ? 'bg-rose-400' : 'bg-rose-400/60'
  return 'bg-slate-500/50'
}
