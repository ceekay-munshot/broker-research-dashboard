import type { AlertSeverity } from '../../domain'

const TONE: Readonly<Record<AlertSeverity, string>> = {
  critical: 'border-rose-500/50 text-rose-300 bg-rose-500/10',
  high:     'border-amber-500/50 text-amber-300 bg-amber-500/10',
  medium:   'border-slate-400/30 text-slate-200 bg-line/[0.04]',
  low:      'border-line/10 text-slate-400 bg-transparent',
  info:     'border-line/10 text-slate-500 bg-transparent',
}

export default function SeverityBadge({
  severity, compact,
}: {
  severity: AlertSeverity
  compact?: boolean
}) {
  return (
    <span className={`chip border ${TONE[severity]} ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider font-semibold`}>
      {severity}
    </span>
  )
}
