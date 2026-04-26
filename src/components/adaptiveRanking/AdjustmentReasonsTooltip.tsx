// Optional inline reason list — used in panels where the title= tooltip
// on RankCompareChip isn't enough. Renders nothing when the annotation
// is null or has no reasons.

import type { AdaptiveAnnotation } from '../../viewModels/adaptiveRanking'

export default function AdjustmentReasonsTooltip({
  annotation,
}: {
  annotation: AdaptiveAnnotation | null
}) {
  if (!annotation || (annotation.adjustment.reasons.length === 0 && annotation.adjustment.suppressed.length === 0)) {
    return null
  }
  return (
    <div className="text-[10.5px] text-slate-400 flex flex-col gap-0.5 mt-1">
      {annotation.adjustment.reasons.map((r) => (
        <span key={r.source + r.text} className="flex items-center gap-1.5">
          <span className={`num ${r.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(1)}
          </span>
          <span>{r.text}{r.clamped ? ' [clamped]' : ''}</span>
        </span>
      ))}
      {annotation.adjustment.suppressed.map((s, i) => (
        <span key={`sup-${i}`} className="italic text-slate-500">· {s.text}</span>
      ))}
    </div>
  )
}
