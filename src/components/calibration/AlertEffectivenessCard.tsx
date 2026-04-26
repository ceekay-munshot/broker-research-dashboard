import type { AlertEffectivenessSummary } from '../../domain'
import SampleSizeBadge from './SampleSizeBadge'

export default function AlertEffectivenessCard({ summary }: { summary: AlertEffectivenessSummary }) {
  if (summary.sampleSize === 0) {
    return (
      <div className="panel p-3 flex flex-col gap-1 border border-line/5 opacity-60">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 text-[12.5px] font-medium truncate">{summary.kind.replace(/_/g, ' ')}</span>
          <span className="text-[10.5px] text-slate-500">no events yet</span>
        </div>
      </div>
    )
  }
  const fiveDay = summary.byWindow.find((w) => w.window === '5d')
  const tone =
    summary.score >= 30 ? 'border-emerald-500/30 bg-emerald-500/5'
    : summary.score >= 10 ? 'border-line/10'
    : summary.score >= -10 ? 'border-line/5'
    :                         'border-rose-500/30 bg-rose-500/[0.04]'
  return (
    <div className={`panel p-3 flex flex-col gap-2 border ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-100 text-[12.5px] font-semibold truncate">{summary.kind.replace(/_/g, ' ')}</span>
          <SampleSizeBadge band={summary.confidence} sampleSize={summary.sampleSize} compact/>
        </div>
        <span className={`chip border text-[11px] font-semibold num ${
          summary.score >= 30  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
          : summary.score >= 10  ? 'border-slate-400/30 text-slate-200 bg-line/[0.04]'
          : summary.score >= -10 ? 'border-line/10 text-slate-400'
          :                         'border-rose-500/40 text-rose-300 bg-rose-500/10'
        }`}>
          {summary.score >= 0 ? '+' : ''}{summary.score.toFixed(0)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <Stat label="hit"  value={summary.hitRate === null ? '—' : `${(summary.hitRate * 100).toFixed(0)}%`}/>
        <Stat label="mean" value={`${summary.meanReturnPct >= 0 ? '+' : ''}${summary.meanReturnPct.toFixed(2)}%`}/>
        {fiveDay?.meanRelReturnPct !== null && fiveDay !== undefined && (
          <Stat label="rel" value={`${fiveDay.meanRelReturnPct! >= 0 ? '+' : ''}${fiveDay.meanRelReturnPct!.toFixed(2)}%`}/>
        )}
      </div>
      <div className="flex flex-wrap gap-1 text-[10.5px] text-slate-400">
        {summary.byMembership.filter((m) => m.sampleSize > 0).map((m) => (
          <span key={m.membership} className="chip border border-line/10 text-slate-300">
            <span className="uppercase tracking-wider text-[9.5px] text-slate-500 mr-1">{m.membership}</span>
            <span className="num">n={m.sampleSize} {m.hitRate === null ? '' : `· ${(m.hitRate * 100).toFixed(0)}%`}</span>
          </span>
        ))}
      </div>
      {summary.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {summary.reasons.slice(0, 3).map((r) => (
            <span key={r.code} className="chip text-[10px] border border-line/10 text-slate-300">
              {r.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-500 uppercase tracking-wider text-[9.5px] mr-1">{label}</span>
      <span className="num text-slate-200">{value}</span>
    </span>
  )
}
