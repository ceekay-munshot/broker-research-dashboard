import { useEffect } from 'react'
import type { ReportId, StockTicker } from '../domain'
import type { ResultantState, StrengthBand } from '../engine/types'
import type {
  StockDetailViewModel, LinkedReportVM,
} from '../viewModels/stockDetail'
import { useStockDetailViewModel } from '../viewModels/stockDetail'
import type {
  ConsensusPointVM, DisagreementPointVM, OutlierVM,
} from '../viewModels/divergence'
import { RATING_TEXT_COLOR, STANCE_TEXT_COLOR, formatPrice, formatShortDate } from '../viewModels/shared'
import { ARB_LABEL, ARB_COLOR, ARB_TOOLTIP, type ConsensusRating } from '../viewModels/arb'
import { RESULTANT_STATE_CHIP_CLASS as STATE_COLOR, BROKER_GLYPH_CLASS } from '../lib/semanticColor'
import { RESULTANT_STATE_LABEL, formatConsensusRating } from '../lib/signalVocab'

interface StockDrawerProps {
  readonly ticker: StockTicker | null
  readonly onClose: () => void
  readonly onSelectReport: (id: ReportId) => void
}

export default function StockDrawer({ ticker, onClose, onSelectReport }: StockDrawerProps) {
  useEffect(() => {
    if (!ticker) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ticker, onClose])

  if (!ticker) return null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute top-0 right-0 h-full w-full md:w-[620px] lg:w-[720px] bg-ink-950 border-l border-line/5 shadow-2xl flex flex-col">
        <Body ticker={ticker} onClose={onClose} onSelectReport={onSelectReport}/>
      </aside>
    </div>
  )
}

function Body({ ticker, onClose, onSelectReport }: { ticker: StockTicker; onClose: () => void; onSelectReport: (id: ReportId) => void }) {
  const { data, loading, error } = useStockDetailViewModel(ticker)

  if (loading) return <Message onClose={onClose} tone="loading" text={`Loading ${ticker}…`}/>
  if (error)   return <Message onClose={onClose} tone="error" text={`Error: ${error.message}`}/>
  if (!data)   return <Message onClose={onClose} tone="loading" text={`Loading ${ticker}…`}/>

  return <Content vm={data} onClose={onClose} onSelectReport={onSelectReport}/>
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-line/5">
      <div className="flex items-center gap-2">
        <span className="section-title">{title}</span>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-100 w-7 h-7 flex items-center justify-center rounded border border-line/5 hover:border-line/20 transition-colors"
        aria-label="Close"
      >✕</button>
    </div>
  )
}

function Message({ onClose, tone, text }: { onClose: () => void; tone: 'loading' | 'error'; text: string }) {
  return (
    <>
      <Header title="Stock detail" onClose={onClose}/>
      <div className="flex-1 flex items-center justify-center text-sm">
        <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
      </div>
    </>
  )
}

function Content({ vm, onClose, onSelectReport }: {
  vm: StockDetailViewModel;
  onClose: () => void;
  onSelectReport: (id: ReportId) => void;
}) {
  const { closure } = vm
  return (
    <>
      <Header title={`${vm.ticker} · Street view`} onClose={onClose}/>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 flex flex-col gap-5">
          {/* Title row */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-slate-100 text-[18px] font-semibold">{vm.ticker}</h2>
              <StateBadge state={closure.resultant.state} strength={closure.resultant.strength}/>
            </div>
            <div className="text-[11.5px] text-slate-400">
              {vm.stockName} · Spot {formatPrice(vm.spotPrice, vm.currency, 2)} · {closure.brokerCount} broker{closure.brokerCount === 1 ? '' : 's'}
            </div>
          </div>

          {/* Narrative */}
          <div className="rounded border border-accent/30 bg-accent/[0.04] p-3 text-[13px] text-slate-100 leading-relaxed">
            {closure.resultant.narrative}
          </div>

          {/* ARB verdict + consensus rating */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`chip border ${ARB_COLOR[vm.arb.band]} text-[11px] ${vm.arb.band === 'none' ? '' : 'cursor-help'}`}
              title={vm.arb.band === 'none' ? undefined : ARB_TOOLTIP}
            >{ARB_LABEL[vm.arb.band]}</span>
            <span className="text-[11px] text-slate-500">{vm.arb.subtext}</span>
            <span className="ml-auto"><ConsensusLine cr={vm.consensusRating}/></span>
          </div>

          {/* Target stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Mean" value={formatPrice(closure.targetStats.mean, vm.currency, 0)}/>
            <Stat label="Median" value={formatPrice(closure.targetStats.median, vm.currency, 0)}/>
            <Stat label="High" value={formatPrice(closure.targetStats.high, vm.currency, 0)} valueClass="text-emerald-400"
              sub={vm.highTargetBroker ? vm.highTargetBroker.name + (vm.highTargetTieCount > 0 ? ` +${vm.highTargetTieCount}` : '') : undefined}/>
            <Stat label="Low" value={formatPrice(closure.targetStats.low, vm.currency, 0)} valueClass="text-rose-400"
              sub={vm.lowTargetBroker ? vm.lowTargetBroker.name + (vm.lowTargetTieCount > 0 ? ` +${vm.lowTargetTieCount}` : '') : undefined}/>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500 uppercase tracking-widest">Spread</span>
            <span className={`num ${closure.targetStats.spreadPct !== null && closure.targetStats.spreadPct >= 25 ? 'text-amber-300' : 'text-slate-300'}`}>
              {closure.targetStats.spreadPct !== null ? `${closure.targetStats.spreadPct.toFixed(1)}%` : '—'}
            </span>
            <span className="mx-2 text-slate-700">·</span>
            <span className="text-slate-500 uppercase tracking-widest">Stdev</span>
            <span className="num text-slate-300">
              {closure.targetStats.stdev !== null ? `±${closure.targetStats.stdev.toFixed(1)}` : '—'}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-widest">Confidence</span>
              <ConfidenceBar score={closure.confidence.score} band={closure.confidence.band}/>
            </span>
          </div>

          {/* Stance distribution */}
          <div className="flex items-center gap-3 text-[11.5px]">
            <span className="text-slate-500 uppercase tracking-widest text-[10px]">Stance</span>
            <StanceBar dist={closure.stanceDistribution}/>
            <span className="num"><span className="text-emerald-400">{closure.stanceDistribution.bullish}</span> bull</span>
            <span className="num"><span className="text-slate-400">{closure.stanceDistribution.neutral}</span> neutral</span>
            <span className="num"><span className="text-rose-400">{closure.stanceDistribution.bearish}</span> bear</span>
          </div>

          {/* Consensus */}
          {vm.consensus.length > 0 && (
            <Section title={`Where they agree (${vm.consensus.length})`}>
              <ul className="flex flex-col gap-1.5">
                {vm.consensus.map((c, idx) => <ConsensusRow key={idx} point={c}/>)}
              </ul>
            </Section>
          )}

          {/* Disagreements */}
          {vm.disagreements.length > 0 && (
            <Section title={`Where they disagree (${vm.disagreements.length})`}>
              <ul className="flex flex-col gap-2">
                {vm.disagreements.map((d, idx) => <DisagreementRow key={idx} point={d}/>)}
              </ul>
            </Section>
          )}

          {/* Why missing — honest when ARB exists but no reason was extracted */}
          {vm.whyMissing && (
            <Section title="Why they disagree">
              <div className="rounded border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[12px] text-slate-300 leading-snug">
                Reason not extracted yet — source reports available.
              </div>
            </Section>
          )}

          {/* Outliers */}
          {vm.outliers.length > 0 && (
            <Section title={`Outliers (${vm.outliers.length})`}>
              <ul className="flex flex-col gap-2">
                {vm.outliers.map((o, idx) => <OutlierRow key={idx} out={o}/>)}
              </ul>
            </Section>
          )}

          {/* Key drivers */}
          {closure.resultant.keyDrivers.length > 0 && (
            <Section title="Key drivers">
              <ul className="flex flex-col gap-1 text-[12.5px] text-slate-300">
                {closure.resultant.keyDrivers.map((k, idx) => (
                  <li key={idx} className="leading-snug">{k}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Open questions */}
          {closure.resultant.openQuestions.length > 0 && (
            <Section title="Open questions">
              <ul className="flex flex-col gap-1 text-[12.5px] text-slate-300">
                {closure.resultant.openQuestions.map((q, idx) => (
                  <li key={idx} className="leading-snug">{q}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Linked reports */}
          <Section title="Source reports">
            <ul className="flex flex-col gap-1.5">
              {vm.linkedReports.map((r) => (
                <li key={r.reportId}>
                  <LinkedReportRow r={r} onClick={() => onSelectReport(r.reportId)}/>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value, valueClass, sub }: { label: string; value: string; valueClass?: string; sub?: string }) {
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <div className="section-title">{label}</div>
      <div className={`text-[14px] font-semibold num ${valueClass ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 truncate" title={sub}>{sub}</div>}
    </div>
  )
}

function ConsensusLine({ cr }: { cr: ConsensusRating }) {
  // Text comes from the shared formatConsensusRating so every surface
  // (Overview, By Stock, Stock Drawer, Report Drawer) reads the same:
  //   "2 of 2 brokers rated Buy" / "Mixed ratings" / "No rating issued".
  // Renderer only owns the tone wrapper.
  const tone = cr.kind === 'tie' ? 'text-amber-300'
    : cr.kind === 'none' ? 'text-slate-500'
    : 'text-slate-300'
  return <span className={`text-[11.5px] ${tone}`}>{formatConsensusRating(cr)}</span>
}

function ConsensusRow({ point }: { point: ConsensusPointVM }) {
  const tone = point.polarity === 'bullish' ? 'text-emerald-400'
    : point.polarity === 'bearish' ? 'text-rose-400' : 'text-slate-300'
  return (
    <li className="flex flex-col gap-0.5 rounded border border-line/5 bg-line/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-widest text-slate-400">{point.topic}</span>
        <span className={`chip border border-line/10 ${tone} text-[9.5px]`}>Consensus</span>
      </div>
      <span className="text-[12.5px] text-slate-200 leading-snug">{point.claim}</span>
      {point.supportingClaims.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {point.supportingClaims.slice(0, 5).map((c, idx) => (
            <span key={idx} className="chip bg-line/[0.04] border border-line/5 text-slate-400 text-[10px]">{c}</span>
          ))}
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-1">
        {point.brokers.map((b) => b.name).join(' · ')}
        {point.evidenceCount > 0 && <span className="num ml-2">· {point.evidenceCount} citation{point.evidenceCount === 1 ? '' : 's'}</span>}
      </div>
    </li>
  )
}

function DisagreementRow({ point }: { point: DisagreementPointVM }) {
  return (
    <li className="rounded border border-line/5 bg-line/[0.02] p-3 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-widest text-slate-400">{point.topic}</div>
      <div className="flex gap-2 text-[12.5px]">
        <span className="chip border border-emerald-500/30 text-emerald-400 shrink-0">Bull</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          {point.bullClaims.slice(0, 3).map((c, idx) => (
            <span key={idx} className="text-slate-200 leading-snug">{c}</span>
          ))}
          <span className="text-[10.5px] text-slate-500">
            {point.bullBrokers.map((b) => b.name).join(' · ') || '—'}
            {point.bullCitationCount > 0 && <span className="ml-2 num">· {point.bullCitationCount} citations</span>}
          </span>
        </div>
      </div>
      <div className="flex gap-2 text-[12.5px]">
        <span className="chip border border-rose-500/30 text-rose-400 shrink-0">Bear</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          {point.bearClaims.slice(0, 3).map((c, idx) => (
            <span key={idx} className="text-slate-200 leading-snug">{c}</span>
          ))}
          <span className="text-[10.5px] text-slate-500">
            {point.bearBrokers.map((b) => b.name).join(' · ') || '—'}
            {point.bearCitationCount > 0 && <span className="ml-2 num">· {point.bearCitationCount} citations</span>}
          </span>
        </div>
      </div>
    </li>
  )
}

function OutlierRow({ out }: { out: OutlierVM }) {
  const tone = out.direction === 'bullish' ? 'text-emerald-400' : 'text-rose-400'
  return (
    <li className="rounded border border-amber-500/20 bg-amber-500/[0.04] p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="chip border border-amber-500/40 text-amber-300">Outlier</span>
        <span className="text-slate-100 font-semibold">{out.brokerName}</span>
        <span className={`${tone} uppercase text-[10px] tracking-widest`}>{out.direction}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {out.reasons.map((r, idx) => (
          <span key={idx} className="chip bg-line/[0.04] border border-line/5 text-slate-300 text-[10px]">{r}</span>
        ))}
      </div>
    </li>
  )
}

function LinkedReportRow({ r, onClick }: { r: LinkedReportVM; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded border border-line/5 bg-line/[0.02] hover:bg-line/[0.04] transition-colors p-2.5 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold ${BROKER_GLYPH_CLASS}`}
        >{r.brokerShortName.slice(0, 3).toUpperCase()}</span>
        <span className="text-slate-300 text-[11.5px]">{r.brokerShortName}</span>
        <span className={`chip border border-line/10 ${STANCE_TEXT_COLOR[r.stance]} text-[9.5px]`}>{r.stance}</span>
        {r.rating && (
          <span className={`text-[10.5px] ${RATING_TEXT_COLOR[r.rating]}`}>{r.rating}</span>
        )}
        <span className="num text-[10.5px] text-slate-500 ml-auto">{formatShortDate(r.publishedAt)}</span>
      </div>
      <div className="text-[12.5px] text-slate-100 leading-snug">{r.title}</div>
      {r.targetPrice !== null && (
        <div className="text-[10.5px] text-slate-500 num">
          Target {r.targetPrice.toLocaleString()}
          {r.priorTargetPrice !== null && r.priorTargetPrice !== r.targetPrice && (
            <span className="ml-1 text-slate-600">(from {r.priorTargetPrice.toLocaleString()})</span>
          )}
        </div>
      )}
    </button>
  )
}

function StanceBar({ dist }: { dist: Readonly<Record<'bullish' | 'neutral' | 'bearish', number>> }) {
  const total = Math.max(1, dist.bullish + dist.neutral + dist.bearish)
  const pct = (n: number) => (100 * n / total).toFixed(0)
  return (
    <div className="flex-1 flex h-1.5 rounded overflow-hidden bg-line/5">
      <div className="bg-emerald-500/80" style={{ width: `${pct(dist.bullish)}%` }}/>
      <div className="bg-slate-500/60"   style={{ width: `${pct(dist.neutral)}%` }}/>
      <div className="bg-rose-500/80"    style={{ width: `${pct(dist.bearish)}%` }}/>
    </div>
  )
}

function ConfidenceBar({ score, band }: { score: number; band: StrengthBand }) {
  const pct = Math.round(score * 100)
  const color = band === 'strong' ? 'bg-emerald-400' : band === 'moderate' ? 'bg-amber-400' : 'bg-slate-500'
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-20 h-1 rounded-full bg-line/5 overflow-hidden">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }}/>
      </span>
      <span className="num text-slate-300">{pct}%</span>
    </span>
  )
}

// ─── State badge ─────────────────────────────────────────────────────
// Labels come from src/lib/signalVocab.ts so every surface reads the same.

function StateBadge({ state, strength }: { state: ResultantState; strength: StrengthBand }) {
  return (
    <span className={`chip border ${STATE_COLOR[state]} inline-flex items-center gap-1 text-[11px]`}>
      <span>{RESULTANT_STATE_LABEL[state]}</span>
      <span className="text-slate-500">·</span>
      <span className="uppercase tracking-widest text-[9px] text-slate-500">{strength}</span>
    </span>
  )
}
