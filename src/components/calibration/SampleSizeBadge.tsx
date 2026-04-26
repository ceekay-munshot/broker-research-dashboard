import type { ConfidenceBand } from '../../domain'

const TONE: Readonly<Record<ConfidenceBand, string>> = {
  very_low: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
  low:      'border-amber-500/40 text-amber-300 bg-amber-500/10',
  medium:   'border-slate-400/30 text-slate-200 bg-line/[0.04]',
  high:     'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
}

const LABEL: Readonly<Record<ConfidenceBand, string>> = {
  very_low: 'V·LOW',
  low:      'LOW',
  medium:   'MED',
  high:     'HIGH',
}

export default function SampleSizeBadge({ band, sampleSize, compact }: {
  band: ConfidenceBand
  sampleSize: number
  compact?: boolean
}) {
  return (
    <span
      title={`Confidence band: ${band} (n=${sampleSize})`}
      className={`chip border ${TONE[band]} ${compact ? 'text-[9px]' : 'text-[10px]'} inline-flex items-center gap-1 uppercase tracking-wider font-semibold`}
    >
      <span>{LABEL[band]}</span>
      <span className="text-slate-300 normal-case font-normal">n={sampleSize}</span>
    </span>
  )
}
