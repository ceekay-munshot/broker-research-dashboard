// Right pane for the "Where they disagree" mode — one company, displayed
// as a spreadsheet-style matrix: topics down the rows, brokers across the
// columns. Header carries the consensus + confidence; the matrix toggles
// between disagree and agree. Outliers and secondary analysis sit below.

import type { StockTicker } from '../../domain'
import type { DivergenceCardViewModel } from '../../viewModels/divergence'
import type { BrokerTier } from '../../viewModels/disagreementInsight'
import { CallBadge, StanceMix, OutlierRow } from './shared'
import TargetPriceScale from './TargetPriceScale'
import StreetMatrix from './StreetMatrix'

interface Props {
  readonly c: DivergenceCardViewModel
  readonly tierFor: (brokerId: string) => BrokerTier
  readonly onSelectTicker: (ticker: StockTicker) => void
}

export default function CompanyDetail({ c, tierFor, onSelectTicker }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <button
            onClick={() => onSelectTicker(c.ticker)}
            className="text-left text-slate-100 text-[18px] font-semibold leading-tight hover:text-accent transition-colors"
          >
            {c.ticker} · {c.stockName}
          </button>
          <div className="text-[11.5px] text-slate-400 flex items-center gap-1.5">
            <span className="num">{c.brokerCount}</span>
            broker{c.brokerCount === 1 ? '' : 's'}
            <span className="text-slate-600">·</span>
            <StanceMix dist={c.stanceDistribution}/>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <CallBadge cr={c.consensusRating}/>
        </div>
      </header>

      <TargetPriceScale stats={c.targetStats} currency={c.currency} outliers={c.outliers}/>

      <StreetMatrix c={c} tierFor={tierFor}/>

      {c.outliers.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="section-title">
            {c.outliers.length === 1 ? 'Outlier broker' : `Outlier brokers (${c.outliers.length})`}
          </span>
          <ul className="flex flex-col gap-2">
            {c.outliers.map((o, i) => (
              <OutlierRow key={i} outlier={o} tier={tierFor(o.brokerId)}/>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
