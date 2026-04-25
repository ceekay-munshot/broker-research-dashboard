import type { PortfolioMembership } from '../../domain'

interface BookBadgeProps {
  readonly membership: PortfolioMembership | null
  readonly direction?: 'long' | 'short' | 'hedge' | null
  readonly weightPct?: number | null
  readonly conviction?: 'high' | 'medium' | 'low' | null
  readonly compact?: boolean
}

const TONE: Readonly<Record<PortfolioMembership, string>> = {
  held:      'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  watchlist: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
  adjacent:  'border-slate-400/30 text-slate-300 bg-line/[0.04]',
  none:      'border-line/10 text-slate-500 bg-transparent',
}

const LABEL: Readonly<Record<PortfolioMembership, string>> = {
  held:      'In Book',
  watchlist: 'Watchlist',
  adjacent:  'Adjacent',
  none:      'Not in Book',
}

export default function BookBadge({ membership, direction, weightPct, conviction, compact }: BookBadgeProps) {
  if (!membership || membership === 'none') {
    return (
      <span className={`chip border ${TONE.none} ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider`}>
        {LABEL.none}
      </span>
    )
  }
  const tail = membership === 'held'
    ? buildHeldTail(direction, weightPct, conviction)
    : null

  return (
    <span className={`chip border ${TONE[membership]} ${compact ? 'text-[9px]' : 'text-[10px]'} inline-flex items-center gap-1`}>
      <span className="uppercase tracking-wider font-semibold">{LABEL[membership]}</span>
      {tail && <span className="text-[9.5px] text-slate-300">{tail}</span>}
    </span>
  )
}

function buildHeldTail(
  direction: 'long' | 'short' | 'hedge' | null | undefined,
  weightPct: number | null | undefined,
  conviction: 'high' | 'medium' | 'low' | null | undefined,
): string | null {
  const parts: string[] = []
  if (direction === 'short') parts.push('Short')
  else if (direction === 'hedge') parts.push('Hedge')
  else parts.push('Long')
  if (weightPct !== null && weightPct !== undefined) parts.push(`${weightPct.toFixed(1)}%`)
  if (conviction === 'high') parts.push('★')
  return parts.join(' · ')
}
