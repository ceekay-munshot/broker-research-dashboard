// Left rail for the "Who's been right" mode — brokers ranked by their
// calibration score (how useful their calls have proven historically).

import type { BrokerCalibrationSummary } from '../../domain'
import { brokerTier } from '../../viewModels/disagreementInsight'
import { BrokerTierDot, ScoreBadge } from './shared'

interface Props {
  readonly brokers: readonly BrokerCalibrationSummary[]
  readonly activeBrokerId: string | null
  readonly onSelect: (brokerId: string) => void
}

export default function BrokerList({ brokers, activeBrokerId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {brokers.map((b) => {
        const id = b.brokerId as unknown as string
        const active = id === activeBrokerId
        const tier = brokerTier(b.score, b.confidence, b.sampleSize)
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`w-full text-left p-3 rounded-md border transition-colors flex flex-col gap-1.5 ${
              active
                ? 'border-accent/40 bg-accent/[0.07]'
                : 'border-line/5 bg-line/[0.02] hover:border-line/15 hover:bg-line/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <BrokerTierDot tier={tier}/>
                <span className="text-[13px] font-semibold text-slate-100 truncate">{b.brokerShortName}</span>
              </span>
              <ScoreBadge score={b.score}/>
            </div>
            <div className="text-[10.5px] text-slate-500 num">
              {b.hitRate !== null ? `${Math.round(b.hitRate * 100)}% hit` : 'hit —'}
              {' · '}
              <span className={b.meanReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {b.meanReturnPct >= 0 ? '+' : ''}{b.meanReturnPct.toFixed(1)}% mean
              </span>
              {' · '}n={b.sampleSize}
            </div>
          </button>
        )
      })}
    </div>
  )
}
