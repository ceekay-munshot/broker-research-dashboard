// Left rail for the "Where they disagree" mode — every flagged company,
// ranked by target spread, scannable at a glance.

import type { StockTicker } from '../../domain'
import type { DivergenceCardViewModel } from '../../viewModels/divergence'
import { CallBadge, SeverityBar, StanceMix } from './shared'

interface Props {
  readonly cases: readonly DivergenceCardViewModel[]
  readonly activeTicker: StockTicker | null
  readonly onSelect: (ticker: StockTicker) => void
}

export default function CompanyList({ cases, activeTicker, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {cases.map((c) => {
        const active = c.ticker === activeTicker
        return (
          <button
            key={c.ticker}
            onClick={() => onSelect(c.ticker)}
            className={`w-full text-left p-3 rounded-md border transition-colors flex flex-col gap-2 ${
              active
                ? 'border-accent/40 bg-accent/[0.07]'
                : 'border-line/5 bg-line/[0.02] hover:border-line/15 hover:bg-line/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="num text-[13px] font-semibold text-slate-100">{c.ticker}</span>
              <CallBadge cr={c.consensusRating}/>
            </div>
            <div className="text-[11px] text-slate-400 truncate">{c.stockName}</div>
            <SeverityBar spreadPct={c.targetStats.spreadPct}/>
            <div className="flex items-center justify-between text-[10.5px] text-slate-500">
              <span className="num">
                {c.targetStats.spreadPct !== null
                  ? `${Math.round(c.targetStats.spreadPct)}% spread`
                  : 'no target spread'}
              </span>
              <StanceMix dist={c.stanceDistribution}/>
            </div>
          </button>
        )
      })}
    </div>
  )
}
