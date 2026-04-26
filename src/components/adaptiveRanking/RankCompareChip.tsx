import type { AdaptiveAnnotation } from '../../viewModels/adaptiveRanking'

interface RankCompareChipProps {
  readonly annotation: AdaptiveAnnotation | null
  /** Compact variant for dense rows (worklog cards). */
  readonly compact?: boolean
}

/** Operator/dev-mode chip rendered when VITE_SHOW_RANKING_COMPARE=1.
 *  Hidden by the parent surface when the flag is off — this component
 *  always renders if invoked, so the parent owns the gating. */
export default function RankCompareChip({ annotation, compact }: RankCompareChipProps) {
  if (!annotation) return null
  const { adjustment, rankDelta } = annotation
  const arrow = rankDelta > 0 ? '▲' : rankDelta < 0 ? '▼' : '▬'
  const tone =
    adjustment.delta > 0  ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.06]'
    : adjustment.delta < 0  ? 'border-rose-500/30 text-rose-300 bg-rose-500/[0.06]'
    :                          'border-line/10 text-slate-500'

  const tooltip = buildTooltip(annotation)

  return (
    <span
      title={tooltip}
      className={`chip border ${tone} ${compact ? 'text-[9px]' : 'text-[10px]'} num inline-flex items-center gap-1 cursor-help`}
    >
      <span>rank {arrow}{Math.abs(rankDelta)}</span>
      <span className="text-slate-500">·</span>
      <span>cal {adjustment.delta >= 0 ? '+' : ''}{adjustment.delta.toFixed(1)}</span>
    </span>
  )
}

function buildTooltip(a: AdaptiveAnnotation): string {
  const lines: string[] = []
  lines.push(`baseline ${a.adjustment.baselineScore.toFixed(1)} → adjusted ${a.adjustment.adjustedScore.toFixed(1)} (Δ ${a.adjustment.delta >= 0 ? '+' : ''}${a.adjustment.delta.toFixed(1)})`)
  for (const r of a.adjustment.reasons) lines.push(`+ ${r.text}${r.clamped ? ' [clamped]' : ''}`)
  for (const s of a.adjustment.suppressed) lines.push(`· ${s.text}`)
  return lines.join('\n')
}
