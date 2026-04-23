import type { StockTicker, Stance } from '../../domain'
import type { ResultantState, StrengthBand } from '../../engine/types'
import type { FiltersState } from '../../app/filters'
import type {
  DivergenceCardViewModel, ConsensusPointVM, DisagreementPointVM, OutlierVM,
} from '../../viewModels/divergence'
import { useDivergenceViewModel } from '../../viewModels/divergence'
import { formatPrice } from '../../viewModels/shared'

interface DivergenceProps {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function Divergence({ filters, onSelectTicker }: DivergenceProps) {
  const { data, loading, error } = useDivergenceViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading divergence view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">Divergence / ARB Closure</h2>
          <p className="text-slate-400 text-[12px]">
            Stocks where the Street materially disagrees — filtered to ≥25% target spread OR explicit
            disagreement points OR ≥1 outlier broker. Each card surfaces consensus, disagreement, outliers,
            and deterministic resultant logic with citation counts.
          </p>
        </div>
        <div className="text-[11px] text-slate-500 num">
          {data.cases.length} of {data.totalStocks} covered names flagged
        </div>
      </div>

      {data.cases.length === 0 && (
        <div className="panel p-8 text-center text-slate-500 text-[13px]">
          No material divergences for the current scope. Every covered name has aligned stance, tight
          targets, and no outlier brokers.
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
        {data.cases.map((d) => (
          <DivergenceCard key={d.ticker} d={d} onSelectTicker={onSelectTicker}/>
        ))}
      </div>
    </div>
  )
}

function DivergenceCard({ d, onSelectTicker }: {
  d: DivergenceCardViewModel;
  onSelectTicker: (t: StockTicker) => void;
}) {
  return (
    <article className="panel p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="section-title">Divergence · {d.sectorName}</div>
          <button
            onClick={() => onSelectTicker(d.ticker)}
            className="text-slate-100 text-[16px] font-semibold leading-none mt-0.5 text-left hover:text-accent transition-colors"
          >
            {d.ticker} · {d.stockName}
          </button>
          <div className="text-[11.5px] text-slate-400 mt-1">
            {d.brokerCount} broker{d.brokerCount === 1 ? '' : 's'}
            {' · '}
            <StanceMix dist={d.stanceDistribution}/>
            {' · spread '}
            <span className={d.targetStats.spreadPct !== null && d.targetStats.spreadPct >= 25 ? 'text-amber-300' : ''}>
              {d.targetStats.spreadPct !== null ? `${d.targetStats.spreadPct.toFixed(0)}%` : '—'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StateBadge state={d.resultant.state} strength={d.strength}/>
          <ConfidenceBar score={d.confidence.score} band={d.confidence.band}/>
        </div>
      </header>

      <SpreadBar low={d.targetStats.low ?? 0} high={d.targetStats.high ?? 0} currency={d.currency}/>

      <div className="text-[12.5px] text-slate-300 leading-relaxed rounded border border-white/5 bg-white/[0.02] p-3">
        {d.resultant.narrative}
      </div>

      {d.consensus.length > 0 && (
        <Section title="Where they agree">
          <ul className="flex flex-col gap-1.5">
            {d.consensus.map((c, idx) => <ConsensusRow key={idx} point={c}/>)}
          </ul>
        </Section>
      )}

      {d.disagreements.length > 0 && (
        <Section title="Where they disagree">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {d.disagreements.map((dg, idx) => <DisagreementRow key={idx} point={dg}/>)}
          </div>
        </Section>
      )}

      {d.outliers.length > 0 && (
        <Section title="Identified outliers">
          <ul className="flex flex-col gap-2">
            {d.outliers.map((o, idx) => <OutlierRow key={idx} out={o}/>)}
          </ul>
        </Section>
      )}

      {d.resultant.keyDrivers.length > 0 && (
        <Section title="Key drivers">
          <ul className="flex flex-col gap-1 text-[12px] text-slate-300">
            {d.resultant.keyDrivers.map((k, idx) => (
              <li key={idx} className="leading-snug">{k}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.resultant.openQuestions.length > 0 && (
        <Section title="Open questions">
          <ul className="flex flex-col gap-1 text-[12px] text-slate-300">
            {d.resultant.openQuestions.map((q, idx) => (
              <li key={idx} className="leading-snug">{q}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="text-[10.5px] text-slate-500 flex flex-col gap-0.5 pt-2 border-t border-white/5">
        {d.confidence.rationale.map((r, idx) => <span key={idx}>· {r}</span>)}
      </div>
    </article>
  )
}

function SpreadBar({ low, high, currency }: { low: number; high: number; currency: string }) {
  const pct = low > 0 ? (((high - low) / low) * 100).toFixed(0) : '0'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10.5px] text-slate-500 uppercase tracking-widest">
        <span>Low target</span>
        <span className="text-amber-400">Spread {pct}%</span>
        <span>High target</span>
      </div>
      <div className="h-1.5 rounded-full bg-gradient-to-r from-rose-500/60 via-slate-500/30 to-emerald-500/60"/>
      <div className="flex items-center justify-between text-[11.5px] num">
        <span className="text-rose-400">{formatPrice(low, currency, 0)}</span>
        <span className="text-emerald-400">{formatPrice(high, currency, 0)}</span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

function ConsensusRow({ point }: { point: ConsensusPointVM }) {
  const tone = point.polarity === 'bullish' ? 'text-emerald-400'
    : point.polarity === 'bearish' ? 'text-rose-400' : 'text-slate-300'
  return (
    <li className="flex flex-col gap-0.5 rounded border border-white/5 bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-widest text-slate-400">{point.topic}</span>
        <span className={`chip border border-white/10 ${tone} text-[9.5px]`}>Consensus</span>
      </div>
      <span className="text-[12.5px] text-slate-200 leading-snug">{point.claim}</span>
      {point.supportingClaims.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {point.supportingClaims.slice(0, 4).map((c, idx) => (
            <span key={idx} className="chip bg-white/[0.04] border border-white/5 text-slate-400 text-[10px]">{c}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
        <span>{point.brokerNames.join(' · ')}</span>
        {point.evidenceCount > 0 && (
          <>
            <span className="text-slate-700">·</span>
            <span className="num">{point.evidenceCount} citation{point.evidenceCount === 1 ? '' : 's'}</span>
          </>
        )}
      </div>
    </li>
  )
}

function DisagreementRow({ point }: { point: DisagreementPointVM }) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-3 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-widest text-slate-400">{point.topic}</div>
      <div className="flex gap-2 text-[12px]">
        <span className="chip border border-emerald-500/30 text-emerald-400 shrink-0">Bull</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          {point.bullClaims.slice(0, 3).map((c, idx) => (
            <span key={idx} className="text-slate-200 leading-snug truncate" title={c}>{c}</span>
          ))}
          <span className="text-[10.5px] text-slate-500">
            {point.bullBrokerNames.join(' · ') || '—'}
            {point.bullCitationCount > 0 && <span className="ml-2 num">· {point.bullCitationCount} citations</span>}
          </span>
        </div>
      </div>
      <div className="flex gap-2 text-[12px]">
        <span className="chip border border-rose-500/30 text-rose-400 shrink-0">Bear</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          {point.bearClaims.slice(0, 3).map((c, idx) => (
            <span key={idx} className="text-slate-200 leading-snug truncate" title={c}>{c}</span>
          ))}
          <span className="text-[10.5px] text-slate-500">
            {point.bearBrokerNames.join(' · ') || '—'}
            {point.bearCitationCount > 0 && <span className="ml-2 num">· {point.bearCitationCount} citations</span>}
          </span>
        </div>
      </div>
    </div>
  )
}

function OutlierRow({ out }: { out: OutlierVM }) {
  const tone = out.direction === 'bullish' ? 'text-emerald-400' : 'text-rose-400'
  return (
    <li className="rounded border border-amber-500/20 bg-amber-500/[0.04] p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="chip border border-amber-500/40 text-amber-300">Outlier</span>
        <span className="text-slate-100 font-semibold">{out.brokerName}</span>
        <span className={`${tone} uppercase text-[10px] tracking-widest`}>{out.direction}</span>
        {out.targetZScore !== null && (
          <span className="num text-[10.5px] text-slate-400 ml-auto">
            z = {out.targetZScore > 0 ? '+' : ''}{out.targetZScore.toFixed(2)}σ
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {out.reasons.map((r, idx) => (
          <span key={idx} className="chip bg-white/[0.04] border border-white/5 text-slate-300 text-[10px]">{r}</span>
        ))}
      </div>
      <div className="text-[11px] text-slate-400 leading-snug">{out.notes}</div>
    </li>
  )
}

// ─── Shared widgets ───────────────────────────────────────────────────

const STATE_LABEL: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'Consensus · Bull',
  consensus_bearish:   'Consensus · Bear',
  mixed_constructive:  'Mixed · Bull tilt',
  mixed_cautious:      'Mixed · Bear tilt',
  unresolved:          'Unresolved',
  outlier_driven:      'Outlier-driven',
}

const STATE_COLOR: Readonly<Record<ResultantState, string>> = {
  consensus_bullish:   'border-emerald-500/50 text-emerald-300 bg-emerald-500/[0.06]',
  consensus_bearish:   'border-rose-500/50 text-rose-300 bg-rose-500/[0.06]',
  mixed_constructive:  'border-emerald-400/30 text-emerald-300 bg-emerald-500/[0.03]',
  mixed_cautious:      'border-rose-400/30 text-rose-300 bg-rose-500/[0.03]',
  unresolved:          'border-slate-400/30 text-slate-300 bg-white/[0.02]',
  outlier_driven:      'border-amber-500/40 text-amber-300 bg-amber-500/[0.04]',
}

function StateBadge({ state, strength }: { state: ResultantState; strength: StrengthBand }) {
  return (
    <span className={`chip border ${STATE_COLOR[state]} inline-flex items-center gap-1 text-[10px]`}>
      <span>{STATE_LABEL[state]}</span>
      <span className="text-slate-500">·</span>
      <span className="uppercase tracking-widest text-[9px] text-slate-500">{strength}</span>
    </span>
  )
}

function ConfidenceBar({ score, band }: { score: number; band: StrengthBand }) {
  const pct = Math.round(score * 100)
  const color = band === 'strong' ? 'bg-emerald-400' : band === 'moderate' ? 'bg-amber-400' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-slate-500 uppercase tracking-widest">Confidence</span>
      <div className="w-20 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="num text-slate-300">{pct}%</span>
    </div>
  )
}

function StanceMix({ dist }: { dist: Readonly<Record<Stance, number>> }) {
  return (
    <>
      <span className="text-emerald-400">{dist.bullish}</span>
      <span className="text-slate-600">/</span>
      <span className="text-slate-400">{dist.neutral}</span>
      <span className="text-slate-600">/</span>
      <span className="text-rose-400">{dist.bearish}</span>
    </>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
