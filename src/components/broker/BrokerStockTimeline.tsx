import type { ReportId, Stance } from '../../domain'
import type { BrokerTimelineEntry } from '../../viewModels/brokerDetail'
import type { ReportChangeSet } from '../../viewModels/brokerMemory/types'
import {
  RATING_TEXT_COLOR, formatPrice, formatShortDate,
} from '../../viewModels/shared'

// A broker's notes on one stock, newest first. Each entry is a single clean
// line — the same shape as the Overview feed row: the call, current price →
// target, the gain left to target, and whether they raised or cut their
// target since last time. The full write-up is one click away in the report.

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
  const c = entry.change
  const badge = tpBadge(c, entry.targetCurrency)
  // Current price backed out from the target and the broker's stated upside
  // (cmp = target ÷ (1 + upside)). No live quote needed.
  const cmp = entry.targetPrice !== null && entry.upsidePct !== null && entry.upsidePct > -100
    ? entry.targetPrice / (1 + entry.upsidePct / 100)
    : null

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

      {/* One clean line: call · CMP → TP · % to target · target change · View report */}
      <div className="flex-1 min-w-0 pb-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectReport(entry.reportId)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(entry.reportId) } }}
          className="group w-full text-left rounded-md border border-line/5 hover:border-line/15 hover:bg-line/[0.02] focus:outline-none focus:border-accent/40 transition-colors p-2.5 flex items-center gap-x-2.5 gap-y-1 flex-wrap cursor-pointer"
        >
          {/* the call */}
          {entry.rating && (
            <span className={`text-[13px] font-semibold ${RATING_TEXT_COLOR[entry.rating]}`}>{entry.rating}</span>
          )}

          {/* current price → target */}
          <span className="num text-[12px] flex items-baseline gap-x-1.5">
            {cmp !== null && (
              <span className="text-slate-300 whitespace-nowrap">
                <span className="text-slate-500 text-[10px] mr-1">CMP</span>
                {formatPrice(cmp, entry.targetCurrency, 0)}
              </span>
            )}
            {cmp !== null && entry.targetPrice !== null && <span className="text-slate-600">→</span>}
            {entry.targetPrice !== null && (
              <span className="text-slate-100 font-semibold whitespace-nowrap">
                <span className="text-slate-500 text-[10px] font-normal mr-1">TP</span>
                {formatPrice(entry.targetPrice, entry.targetCurrency, 0)}
              </span>
            )}
          </span>

          {/* gain left to the target */}
          {entry.upsidePct !== null && (
            <span className={`num text-[11.5px] whitespace-nowrap ${entry.upsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {entry.upsidePct >= 0 ? '+' : ''}{Math.round(entry.upsidePct)}%
              <span className="text-slate-500 text-[10px] font-normal ml-1">to target</span>
            </span>
          )}

          {/* did they raise or cut their target since last time? */}
          {badge && (
            <span
              className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}
              title={badge.tooltip}
            >
              {badge.label}
            </span>
          )}

          <span className="ml-auto text-[9.5px] text-slate-600 group-hover:text-slate-400 shrink-0">View report →</span>
        </div>
      </div>
    </li>
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

/** Did this note raise or cut the broker's target vs their prior note —
 *  "Initiated" on first coverage, null when the target held. Mirrors the
 *  Overview feed row's target-change badge. */
function tpBadge(c: ReportChangeSet, currency: string | null): { label: string; cls: string; tooltip: string } | null {
  if (c.significance.bucket === 'first_coverage') {
    return { label: 'Initiated', cls: 'border-sky-400/40 text-sky-300 bg-sky-400/[0.08]', tooltip: 'First note from this broker on this stock' }
  }
  const pct = c.targetChangePct
  const prior = c.targetBefore != null ? formatPrice(c.targetBefore, currency, 0) : null
  if (pct != null && pct >= 0.5) {
    return {
      label: '▲ Target raised',
      cls: 'border-emerald-400/40 text-emerald-300 bg-emerald-400/[0.08]',
      tooltip: prior ? `Target raised from ${prior}` : 'Target raised vs the prior note',
    }
  }
  if (pct != null && pct <= -0.5) {
    return {
      label: '▼ Target cut',
      cls: 'border-rose-400/40 text-rose-300 bg-rose-400/[0.08]',
      tooltip: prior ? `Target cut from ${prior}` : 'Target cut vs the prior note',
    }
  }
  return null
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
