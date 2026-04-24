import type { WorklogItem } from '../../viewModels/worklog'
import { STANCE_TEXT_COLOR, RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'

interface WorklogCardProps {
  readonly item: WorklogItem
  readonly selected: boolean
  readonly onClick: () => void
}

export default function WorklogCard({ item, selected, onClick }: WorklogCardProps) {
  const bucketTone =
    item.priority.bucket === 'high'    ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
    : item.priority.bucket === 'medium' ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
    : 'bg-slate-600/15 text-slate-400 border-slate-600/30'

  const originLabel =
    item.origin === 'direct_attachment' ? 'PDF'
    : item.origin === 'direct_body'     ? 'Body'
    : 'Digest'

  const tp = formatTargetChange(item)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded flex items-start gap-3 border transition-colors ${
        selected
          ? 'bg-accent/8 border-accent/30'
          : 'bg-transparent border-transparent hover:bg-line/[0.03]'
      }`}
    >
      {/* Priority bucket chip */}
      <span className={`chip ${bucketTone} shrink-0 mt-0.5 uppercase tracking-wider text-[9px] font-bold`}>
        {item.priority.bucket}
      </span>

      {/* Broker glyph */}
      <span
        className="w-6 h-6 rounded-sm flex-shrink-0 flex items-center justify-center text-[9.5px] font-bold text-ink-950 mt-0.5"
        style={{ background: item.brokerColor ?? '#94a3b8' }}
      >{item.brokerShortName.slice(0, 3).toUpperCase()}</span>

      {/* Ticker */}
      {item.ticker && (
        <span className="chip border border-line/10 text-slate-200 shrink-0 mt-0.5">{item.ticker}</span>
      )}

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] font-medium truncate ${STANCE_TEXT_COLOR[item.stance]}`}>
          {item.headline}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
          <span>{formatTimeHM(item.receivedAt)}</span>
          <span>·</span>
          <span>{typeLabel(item.reportType)}</span>
          <span>·</span>
          <span>{originLabel}</span>
          {item.evidenceCount > 0 && (<><span>·</span><span>{item.evidenceCount} evid</span></>)}
          {item.hasDivergence && (<><span>·</span><span className="text-amber-400">divergence</span></>)}
          {item.source.duplicateCount > 0 && (<><span>·</span><span className="text-slate-400">+{item.source.duplicateCount} dup</span></>)}
          {renderChangePill(item)}
        </div>
        <div className="text-[11.5px] text-slate-400 truncate mt-0.5">{item.summaryShort}</div>
        {/* Top priority reasons */}
        {item.priority.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.priority.reasons.slice(0, 3).map((r) => (
              <span key={r.code} className={`chip text-[10px] border border-line/10 ${r.points >= 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                {r.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rating + target */}
      <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[88px]">
        {item.rating && (
          <span className={`text-[11px] ${RATING_TEXT_COLOR[item.rating]}`}>{item.rating}</span>
        )}
        {item.targetPrice !== null && (
          <span className="num text-[11px] text-slate-300">{formatPrice(item.targetPrice, item.targetCurrency)}</span>
        )}
        {tp && (
          <span className={`num text-[10.5px] ${tp.tone}`}>{tp.text}</span>
        )}
      </div>
    </button>
  )
}

function renderChangePill(item: WorklogItem) {
  const c = item.change
  if (!c) return null
  const bucket = c.significance.bucket
  const tone =
    bucket === 'major'          ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    : bucket === 'moderate'     ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : bucket === 'first_coverage' ? 'text-accent border-accent/30 bg-accent/10'
    :                             'text-slate-500 border-slate-500/20 bg-line/[0.02]'
  const label =
    bucket === 'major'          ? '▲ major change'
    : bucket === 'moderate'     ? '▲ moderate change'
    : bucket === 'first_coverage' ? '★ initiation'
    :                             'unchanged'
  return (
    <>
      <span>·</span>
      <span className={`chip text-[9.5px] border ${tone}`}>{label}</span>
    </>
  )
}

function formatTargetChange(item: WorklogItem): { text: string; tone: string } | null {
  if (item.targetChangeAbs === null || item.targetChangePct === null) return null
  if (item.targetChangeAbs === 0) return null
  const sign = item.targetChangeAbs > 0 ? '▲' : '▼'
  const tone = item.targetChangeAbs > 0 ? 'text-emerald-400' : 'text-rose-400'
  return { text: `${sign} ${Math.abs(item.targetChangePct).toFixed(1)}%`, tone }
}

function typeLabel(t: string) { return t.replace(/_/g, ' ') }

function formatTimeHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
