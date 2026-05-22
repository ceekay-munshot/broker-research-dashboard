import type { WorklogItem } from '../../viewModels/worklog'
import type { ReportChangeSet } from '../../viewModels/brokerMemory'
import { TONE_TEXT_CLASS, TONE_CHIP_CLASS, getSignificanceTone, getChangeTone } from '../../lib/semanticColor'

interface WorklogChangeTabProps {
  readonly item: WorklogItem
  readonly onOpenPriorReport: (() => void) | null
}

export default function WorklogChangeTab({ item, onOpenPriorReport }: WorklogChangeTabProps) {
  const c = item.change
  if (!c) {
    return <p className="text-slate-500 italic">No linked change-set for this item.</p>
  }
  if (c.significance.bucket === 'first_coverage') {
    return (
      <div className="flex flex-col gap-3">
        <BucketChip bucket="first_coverage"/>
        <p className="text-slate-300">This is the first note from {item.brokerShortName} on {item.ticker}.
          There is no prior note to compare against.</p>
        <p className="text-slate-500 text-[11px]">Comparability: <code>{c.comparability}</code></p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Significance header */}
      <div className="flex items-center gap-2">
        <BucketChip bucket={c.significance.bucket}/>
        <span className="num text-slate-300 text-[13px] font-semibold">
          score {c.significance.score}
        </span>
      </div>

      {/* One-liner headline */}
      <div>
        <div className="section-title mb-1">Summary</div>
        <p className="text-slate-200 leading-snug">{c.headline}</p>
      </div>

      {/* Prior anchor */}
      <div>
        <div className="section-title mb-1">Previous comparable note</div>
        {onOpenPriorReport ? (
          <button
            onClick={onOpenPriorReport}
            className="text-slate-300 hover:text-accent text-left text-[12px]"
          >
            Published {shortDate(c.priorPublishedAt!)} · {daysAgoLabel(c.daysSincePrior)} ago ·{' '}
            <code className="text-slate-500">{c.reportTypeBefore}</code>
          </button>
        ) : (
          <p className="text-slate-400 text-[12px]">
            Published {shortDate(c.priorPublishedAt!)} · {daysAgoLabel(c.daysSincePrior)} ago ·{' '}
            <code className="text-slate-500">{c.reportTypeBefore}</code>
          </p>
        )}
        <p className="text-slate-500 text-[10.5px] mt-1">Comparability: <code>{c.comparability}</code></p>
      </div>

      {/* Rating / stance / target grid */}
      <div className="grid grid-cols-3 gap-2">
        <DeltaBox label="Rating"
          before={c.ratingBefore ?? '—'} after={c.ratingAfter ?? '—'}
          changed={c.ratingChanged}/>
        <DeltaBox label="Stance"
          before={c.stanceBefore ?? '—'} after={c.stanceAfter ?? '—'}
          changed={c.stanceChanged}/>
        <DeltaBox
          label="Target"
          before={c.targetBefore !== null ? c.targetBefore.toLocaleString() : '—'}
          after={c.targetAfter !== null ? c.targetAfter.toLocaleString() : '—'}
          changed={c.targetChangeAbs !== null && c.targetChangeAbs !== 0}
          caption={c.targetChangePct !== null ? `${c.targetChangePct > 0 ? '+' : ''}${c.targetChangePct.toFixed(1)}%` : undefined}
          captionTone={TONE_TEXT_CLASS[getChangeTone(c.targetChangePct)]}
        />
      </div>

      {/* Thesis / themes / risks delta */}
      <ThematicDelta change={c}/>

      {/* Significance rule table */}
      <div>
        <div className="section-title mb-1">Why this is {c.significance.bucket}</div>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1 font-normal">Rule</th>
              <th className="pb-1 font-normal">Reason</th>
              <th className="pb-1 font-normal text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {c.significance.reasons.map((r) => (
              <tr key={r.code} className="align-top">
                <td className="py-1 pr-2 text-slate-500 font-mono">{r.code}</td>
                <td className="py-1 pr-2 text-slate-200">{r.text}</td>
                <td className={`py-1 text-right num ${TONE_TEXT_CLASS[getChangeTone(r.points)]}`}>
                  {r.points > 0 ? `+${r.points}` : r.points === 0 ? '0' : r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ThematicDelta({ change }: { change: ReportChangeSet }) {
  if (change.thematic === 'unavailable') {
    return (
      <div>
        <div className="section-title mb-1">Thesis delta</div>
        <p className="text-slate-500 italic text-[11.5px]">Thematic diff unavailable — summaries or themes missing on one side.</p>
      </div>
    )
  }

  const hasAny =
    change.themesAdded.length + change.themesDropped.length + change.themesRetained.length
    + change.risksAdded.length + change.risksDropped.length + change.risksRetained.length > 0

  if (!hasAny) {
    return (
      <div>
        <div className="section-title mb-1">Thesis delta</div>
        <p className="text-slate-400 text-[11.5px]">No thematic delta — broker's view appears unchanged.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="section-title mb-1">Thesis delta
          {change.thematic === 'partial' && <span className="text-amber-400 ml-2">partial</span>}
        </div>
      </div>
      {change.themesAdded.length > 0 && (
        <Pill color="emerald" label="New themes" items={change.themesAdded}/>
      )}
      {change.themesDropped.length > 0 && (
        <Pill color="slate" label="Dropped themes" items={change.themesDropped}/>
      )}
      {change.risksAdded.length > 0 && (
        <Pill color="rose" label="New risks" items={change.risksAdded}/>
      )}
      {change.risksDropped.length > 0 && (
        <Pill color="emerald" label="Risks resolved" items={change.risksDropped}/>
      )}
      {change.risksRetained.length > 0 && (
        <Pill color="amber" label="Carry-forward concerns" items={change.risksRetained}/>
      )}
      {change.themesRetained.length > 0 && (
        <Pill color="slate-dim" label="Repeated thesis" items={change.themesRetained}/>
      )}
    </div>
  )
}

function Pill({ label, items, color }: { label: string; items: readonly string[]; color: 'emerald' | 'rose' | 'amber' | 'slate' | 'slate-dim' }) {
  const cls =
    color === 'emerald'    ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.05]'
    : color === 'rose'     ? 'border-rose-500/30 text-rose-300 bg-rose-500/[0.05]'
    : color === 'amber'    ? 'border-amber-500/30 text-amber-300 bg-amber-500/[0.05]'
    : color === 'slate'    ? 'border-slate-500/30 text-slate-300 bg-slate-500/[0.05]'
    :                        'border-line/10 text-slate-500 bg-transparent'
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((t) => (
          <span key={t} className={`chip text-[10.5px] border ${cls}`}>{t}</span>
        ))}
      </div>
    </div>
  )
}

function BucketChip({ bucket }: { bucket: ReportChangeSet['significance']['bucket'] }) {
  const cls = TONE_CHIP_CLASS[getSignificanceTone(bucket)]
  const label =
    bucket === 'major' ? 'Major change'
    : bucket === 'moderate' ? 'Moderate change'
    : bucket === 'first_coverage' ? 'Initiation / no prior'
    : 'Minor / unchanged'
  return <span className={`chip uppercase tracking-wider text-[9px] font-bold border ${cls}`}>{label}</span>
}

function DeltaBox({
  label, before, after, changed, caption, captionTone,
}: {
  label: string; before: string; after: string; changed: boolean; caption?: string; captionTone?: string
}) {
  return (
    <div className="rounded border border-line/10 p-2 bg-line/[0.02]">
      <div className="section-title mb-1">{label}</div>
      <div className="flex items-center gap-1 text-[11.5px]">
        <span className="text-slate-500">{before}</span>
        <span className={changed ? 'text-slate-300' : 'text-slate-500'}>→</span>
        <span className={changed ? 'text-slate-100 font-semibold' : 'text-slate-400'}>{after}</span>
      </div>
      {caption && <div className={`num text-[10.5px] mt-0.5 ${captionTone ?? 'text-slate-500'}`}>{caption}</div>}
    </div>
  )
}

function shortDate(iso: string): string {
  return iso.slice(0, 10)
}

function daysAgoLabel(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}
