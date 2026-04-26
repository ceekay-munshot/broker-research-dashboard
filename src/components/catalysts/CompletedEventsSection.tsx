import type { CatalystId } from '../../domain'
import { useCompletedCatalystsViewModel } from '../../hooks/useCompletedCatalystsViewModel'
import type { CompletedEventCardViewModel } from '../../viewModels/postEventReview'
import CatalystTypeBadge from './CatalystTypeBadge'

interface CompletedEventsSectionProps {
  readonly selectedId: CatalystId | null
  readonly onSelect: (id: CatalystId) => void
}

const DIRECTION_TONE = {
  up:      'border-emerald-500/40 text-emerald-300',
  down:    'border-rose-500/40 text-rose-300',
  flat:    'border-slate-400/30 text-slate-300',
  mixed:   'border-amber-500/40 text-amber-300',
  unknown: 'border-line/10 text-slate-500',
} as const

const DIVERGENCE_TONE = {
  outlier_vindicated:   'border-emerald-500/40 text-emerald-300',
  outlier_invalidated:  'border-amber-500/40 text-amber-300',
  resolved:             'border-slate-400/30 text-slate-200',
  persisted:            'border-slate-400/30 text-slate-200',
  widened:              'border-amber-500/40 text-amber-300',
  no_divergence_pre:    'border-line/10 text-slate-500',
} as const

export default function CompletedEventsSection({
  selectedId, onSelect,
}: CompletedEventsSectionProps) {
  const { data, loading, error } = useCompletedCatalystsViewModel()
  if (loading || !data) return null
  if (error) return null
  if (!data.hasData) return null
  return (
    <section className="panel p-3 flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-slate-100 text-[13px] font-semibold">Recently completed events</h3>
          <p className="text-slate-500 text-[11px]">Realized outcome + broker right/wrong + calibration implications.</p>
        </div>
        <span className="text-slate-500 text-[10.5px] num">{data.items.length}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {data.items.map((c) => (
          <CompletedCard key={c.catalystId as unknown as string} card={c} selected={selectedId === c.catalystId} onSelect={() => onSelect(c.catalystId)}/>
        ))}
      </div>
    </section>
  )
}

function CompletedCard({
  card, selected, onSelect,
}: {
  card: CompletedEventCardViewModel
  selected: boolean
  onSelect: () => void
}) {
  const ringTone = selected ? 'ring-1 ring-accent/40' : ''
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`px-3 py-2 rounded border border-line/10 ${ringTone} hover:bg-line/[0.04] cursor-pointer transition-colors flex flex-col gap-1`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="chip border border-line/10 text-slate-200 text-[10.5px]">{card.ticker}</span>
        <CatalystTypeBadge type={card.type} importance={card.importance} compact/>
        <span className={`chip border ${DIRECTION_TONE[card.headlineDirection]} text-[10px] uppercase tracking-wider font-semibold`}>
          {card.headlineDirection}
        </span>
        <span className="ml-auto text-[10.5px] text-slate-500 num">{card.daysSinceEvent}d ago</span>
      </div>
      <div className="text-slate-100 text-[12.5px] font-medium truncate" title={card.headline}>
        {card.headline}
      </div>
      <div className="text-slate-400 text-[11px] truncate" title={card.outcomeSummary}>
        {card.outcomeSummary}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        {card.fiveDayReturnPct !== null && (
          <span className={`num ${card.fiveDayReturnPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            5d {card.fiveDayReturnPct >= 0 ? '+' : ''}{card.fiveDayReturnPct.toFixed(2)}%
          </span>
        )}
        <span className="text-emerald-300 num">{card.rightCount} right</span>
        <span className="text-rose-300 num">{card.wrongCount} wrong</span>
        <span className={`chip border ${DIVERGENCE_TONE[card.divergenceKind]} text-[9.5px] uppercase tracking-wider`}>
          {card.divergenceKind.replace(/_/g, ' ')}
        </span>
        <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-wider">{card.confidence}</span>
      </div>
    </div>
  )
}
