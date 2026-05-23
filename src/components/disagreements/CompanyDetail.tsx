// Right pane for the "Where they disagree" mode — one company, framed
// around the Street's agreement AND disagreement at equal weight. The
// takeaway, the target-price gap, where they agree, where they disagree,
// and the outliers. Secondary analysis (key drivers, open questions,
// confidence rationale) sits behind a `MoreDetail` expander.

import type { StockTicker } from '../../domain'
import type { DivergenceCardViewModel } from '../../viewModels/divergence'
import { composeStreetInsight, type BrokerTier } from '../../viewModels/disagreementInsight'
import { VerdictBadge, ConfidenceMeter, StanceMix, OutlierRow, MoreDetail } from './shared'
import TargetPriceScale from './TargetPriceScale'
import WhereTheyAgree from './WhereTheyAgree'
import WhyTheyDisagree from './WhyTheyDisagree'

interface Props {
  readonly c: DivergenceCardViewModel
  readonly tierFor: (brokerId: string) => BrokerTier
  readonly onSelectTicker: (ticker: StockTicker) => void
}

export default function CompanyDetail({ c, tierFor, onSelectTicker }: Props) {
  const insight = composeStreetInsight(c)

  // Order the disagreements for "Why they disagree": the overall bull-vs-
  // bear thesis (stance) first, then thematic splits by debate volume.
  // Rating and target-price are excluded — the verdict badge and the
  // target scale already carry those.
  const stancePoints = c.disagreements.filter((d) => d.dimension === 'stance')
  const themePoints = c.disagreements
    .filter((d) => d.dimension !== 'stance' && d.dimension !== 'rating' && d.dimension !== 'target_price')
    .sort((a, b) => debateVolume(b) - debateVolume(a))
  const whyPoints = [...stancePoints, ...themePoints]

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
          <VerdictBadge state={c.resultant.state} strength={c.strength}/>
          <ConfidenceMeter score={c.confidence.score} band={c.confidence.band}/>
        </div>
      </header>

      <div className="rounded-md bg-line/[0.03] border border-line/8 border-l-2 border-l-accent/70 p-3.5">
        <div className="text-[9.5px] uppercase tracking-[0.16em] text-accent/90 mb-1">The takeaway</div>
        <p className="text-[14px] text-slate-100 leading-relaxed">{insight}</p>
      </div>

      <TargetPriceScale stats={c.targetStats} currency={c.currency} outliers={c.outliers}/>

      {/* Agreement and disagreement get equal weight — agreement was
          previously buried inside MoreDetail. WhereTheyAgree owns its own
          sort + filter; CompanyDetail just hands in the raw point list. */}
      <WhereTheyAgree points={c.consensus} tierFor={tierFor}/>

      <WhyTheyDisagree points={whyPoints} tierFor={tierFor}/>

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

      {hasMoreDetail(c) && (
        <MoreDetail>
          {c.resultant.keyDrivers.length > 0 && (
            <BulletList title="Key drivers" items={c.resultant.keyDrivers}/>
          )}
          {c.resultant.openQuestions.length > 0 && (
            <BulletList title="Open questions" items={c.resultant.openQuestions}/>
          )}
          {c.confidence.rationale.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="section-title">How this confidence was scored</span>
              {c.confidence.rationale.map((r, i) => (
                <span key={i} className="text-[11px] text-slate-500 leading-snug">· {r}</span>
              ))}
            </div>
          )}
        </MoreDetail>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

function debateVolume(d: DivergenceCardViewModel['disagreements'][number]): number {
  return d.bullCitationCount + d.bearCitationCount + d.bullBrokers.length + d.bearBrokers.length
}

function hasMoreDetail(c: DivergenceCardViewModel): boolean {
  return c.resultant.keyDrivers.length > 0
    || c.resultant.openQuestions.length > 0
    || c.confidence.rationale.length > 0
}

function BulletList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="section-title">{title}</span>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="text-[12px] text-slate-300 leading-snug flex gap-1.5">
            <span className="text-slate-600 shrink-0">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
