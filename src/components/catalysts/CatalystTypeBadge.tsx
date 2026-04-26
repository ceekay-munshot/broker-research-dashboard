import type { CatalystType, CatalystImportance } from '../../domain'

const TYPE_LABEL: Readonly<Record<CatalystType, string>> = {
  earnings: 'Earnings',
  guidance_update: 'Guidance',
  investor_day: 'Investor day',
  capital_markets_day: 'CMD',
  product_launch: 'Product',
  agm: 'AGM',
  regulatory_decision: 'Regulatory',
  mna: 'M&A',
  other: 'Other',
}

const IMPORTANCE_TONE: Readonly<Record<CatalystImportance, string>> = {
  critical: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
  high:     'border-amber-500/40 text-amber-300 bg-amber-500/10',
  medium:   'border-slate-400/30 text-slate-200 bg-line/[0.04]',
  low:      'border-line/10 text-slate-400 bg-transparent',
}

export default function CatalystTypeBadge({
  type, importance, compact,
}: {
  type: CatalystType
  importance?: CatalystImportance
  compact?: boolean
}) {
  return (
    <span className={`chip border ${importance ? IMPORTANCE_TONE[importance] : 'border-line/10 text-slate-300'} ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider font-semibold inline-flex items-center gap-1`}>
      <span>{TYPE_LABEL[type]}</span>
      {importance && <span className="text-slate-300 normal-case font-normal">{importance}</span>}
    </span>
  )
}
