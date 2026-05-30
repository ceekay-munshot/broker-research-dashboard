import { useEffect } from 'react'
import type { ReportId, StockTicker } from '../domain'
import {
  useStockStreetView,
  type BrokerSnapshotRow, type ConsensusTarget,
  type EstimateRow, type RatingCounts, type RevisionEntry,
  type StockStreetView,
} from '../viewModels/stockStreetView'
import { RATING_TEXT_COLOR, formatPrice } from '../viewModels/shared'
import BrokerGlyph from './BrokerGlyph'

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
      <aside className="absolute top-0 right-0 h-full w-full md:w-[720px] lg:w-[860px] bg-ink-950 border-l border-line/5 shadow-2xl flex flex-col">
        <Body ticker={ticker} onClose={onClose} onSelectReport={onSelectReport}/>
      </aside>
    </div>
  )
}

function Body({ ticker, onClose, onSelectReport }: { ticker: StockTicker; onClose: () => void; onSelectReport: (id: ReportId) => void }) {
  const { data, loading, error } = useStockStreetView(ticker)

  if (loading) return <Message onClose={onClose} tone="loading" text={`Loading ${ticker}…`}/>
  if (error)   return <Message onClose={onClose} tone="error" text={`Error: ${error.message}`}/>
  if (!data)   return <Message onClose={onClose} tone="loading" text={`Loading ${ticker}…`}/>

  return <Content vm={data} onClose={onClose} onSelectReport={onSelectReport}/>
}

function TopBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-end px-5 py-2 border-b border-line/5">
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
      <TopBar onClose={onClose}/>
      <div className="flex-1 flex items-center justify-center text-sm">
        <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
      </div>
    </>
  )
}

function Content({ vm, onClose, onSelectReport }: {
  vm: StockStreetView
  onClose: () => void
  onSelectReport: (id: ReportId) => void
}) {
  return (
    <>
      <TopBar onClose={onClose}/>
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 flex flex-col gap-6">
          <HeaderSection vm={vm}/>
          <ConsensusEstimatesSection rows={vm.consensusEstimates}/>
          <StreetAtAGlanceSection rows={vm.brokerSnapshot} onSelectReport={onSelectReport}/>
          <RevisionsSection entries={vm.revisions}/>
        </div>
      </div>
    </>
  )
}

// ── A · Header ───────────────────────────────────────────────────────────

function HeaderSection({ vm }: { vm: StockStreetView }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-slate-100 font-semibold text-[20px] leading-tight">
          {vm.stockName ?? vm.ticker}
        </h2>
        <div className="text-[11.5px] text-slate-500 mt-0.5">
          {vm.ticker}
          {vm.contextLine && <> · {vm.contextLine}</>}
        </div>
      </div>

      <div className="flex items-end justify-between gap-6 flex-wrap">
        <RatingDistribution counts={vm.ratingCounts}/>
        <ConsensusTargetBlock target={vm.consensusTarget}/>
      </div>
    </section>
  )
}

function RatingDistribution({ counts }: { counts: RatingCounts }) {
  const total = counts.buy + counts.hold + counts.sell + counts.notRated
  if (total === 0) {
    return <div className="text-[11.5px] text-slate-500">No ratings yet.</div>
  }
  const pct = (n: number) => total === 0 ? 0 : (100 * n / total)
  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      <div className="flex h-1.5 rounded overflow-hidden bg-line/5">
        <div className="bg-emerald-500/80" style={{ width: `${pct(counts.buy)}%` }}/>
        <div className="bg-slate-500/60"   style={{ width: `${pct(counts.hold)}%` }}/>
        <div className="bg-rose-500/80"    style={{ width: `${pct(counts.sell)}%` }}/>
      </div>
      <div className="flex gap-2 text-[11px]">
        {counts.buy > 0 && (
          <span className="chip border border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300 text-[10px]">{counts.buy} Buy</span>
        )}
        {counts.hold > 0 && (
          <span className="chip border border-slate-500/30 bg-line/[0.04] text-slate-300 text-[10px]">{counts.hold} Hold</span>
        )}
        {counts.sell > 0 && (
          <span className="chip border border-rose-500/30 bg-rose-500/[0.06] text-rose-300 text-[10px]">{counts.sell} Sell</span>
        )}
        {counts.notRated > 0 && (
          <span className="chip border border-line/10 text-slate-500 text-[10px]">{counts.notRated} N/R</span>
        )}
      </div>
    </div>
  )
}

function ConsensusTargetBlock({ target }: { target: ConsensusTarget }) {
  if (target.median == null && target.min == null && target.max == null) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="section-title">Consensus target price</span>
        <span className="text-slate-500 text-[12px]">No target issued</span>
      </div>
    )
  }
  const hasRange = target.min !== null && target.max !== null && target.min !== target.max
  const pos = (() => {
    if (!hasRange || target.median == null) return null
    const span = target.max! - target.min!
    return span === 0 ? 0.5 : (target.median - target.min!) / span
  })()
  return (
    <div className="flex flex-col gap-1 items-end">
      <span className="section-title">Consensus target price</span>
      <span className="text-slate-100 font-semibold num text-[20px] leading-tight">
        {formatPrice(target.median, target.currency, 0)}
      </span>
      {hasRange && (
        <div className="flex items-center gap-2 text-[10.5px] text-slate-500 num">
          <span>{formatPrice(target.min, target.currency, 0)}</span>
          <span className="relative w-32 h-1 rounded-full bg-line/10">
            {pos !== null && (
              <span
                className="absolute -top-1 w-1 h-3 rounded-sm bg-slate-100"
                style={{ left: `calc(${(pos * 100).toFixed(1)}% - 2px)` }}
              />
            )}
          </span>
          <span>{formatPrice(target.max, target.currency, 0)}</span>
        </div>
      )}
    </div>
  )
}

// ── B · Consensus estimates ─────────────────────────────────────────────

function ConsensusEstimatesSection({ rows }: { rows: readonly EstimateRow[] }) {
  return (
    <Section title="Consensus estimates">
      {rows.length === 0 ? (
        <Placeholder>Not enough data yet — consensus financial estimates aren't extracted for this stock.</Placeholder>
      ) : (
        <EstimateTable rows={rows}/>
      )}
    </Section>
  )
}

function EstimateTable({ rows }: { rows: readonly EstimateRow[] }) {
  const periods = Array.from(new Set(rows.flatMap((r) => r.values.map((v) => v.period))))
  const showCagr = rows.some((r) => r.cagr2yr !== null)
  return (
    <div className="overflow-x-auto rounded border border-line/5">
      <table className="w-full text-[12px]">
        <thead className="bg-line/[0.02]">
          <tr className="text-left text-slate-400 text-[10.5px] uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Metric</th>
            {periods.map((p) => <th key={p} className="px-3 py-2 font-medium text-right">{p}</th>)}
            {showCagr && <th className="px-3 py-2 font-medium text-right">2-yr CAGR</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric} className="border-t border-line/5">
              <td className="px-3 py-2 text-slate-200">{r.metric}</td>
              {periods.map((p) => {
                const v = r.values.find((x) => x.period === p)
                return (
                  <td key={p} className="px-3 py-2 text-right num">
                    {v?.point != null ? (
                      <div className="flex flex-col items-end">
                        <span className="text-slate-100">{v.point.toLocaleString()}</span>
                        {v.rangeLow != null && v.rangeHigh != null && (
                          <span className="text-[10px] text-slate-500">{v.rangeLow.toLocaleString()}–{v.rangeHigh.toLocaleString()}</span>
                        )}
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                )
              })}
              {showCagr && (
                <td className="px-3 py-2 text-right num">
                  {r.cagr2yr != null ? (
                    <span className={r.cagr2yr > 0 ? 'text-emerald-400' : r.cagr2yr < 0 ? 'text-rose-400' : 'text-slate-400'}>
                      {r.cagr2yr.toFixed(1)}%
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── C · Street views at a glance ────────────────────────────────────────

const QUARTER_VIEW_LABEL = { positive: 'Positive', mixed: 'Mixed', negative: 'Negative', in_line: 'In-line' } as const
const QUARTER_VIEW_TONE  = { positive: 'text-emerald-300', mixed: 'text-amber-300', negative: 'text-rose-300', in_line: 'text-slate-400' } as const
const FORWARD_LABEL = { bullish: 'Bullish', cautiously_optimistic: 'Caut. optimistic', neutral: 'Neutral', cautious: 'Cautious', bearish: 'Bearish' } as const
const FORWARD_TONE  = { bullish: 'text-emerald-300', cautiously_optimistic: 'text-emerald-400/80', neutral: 'text-slate-400', cautious: 'text-amber-300', bearish: 'text-rose-300' } as const

function StreetAtAGlanceSection({ rows, onSelectReport }: {
  rows: readonly BrokerSnapshotRow[]
  onSelectReport: (id: ReportId) => void
}) {
  return (
    <Section title="Street views at a glance">
      {rows.length === 0 ? (
        <Placeholder>No broker coverage in this window.</Placeholder>
      ) : (
        <div className="overflow-x-auto rounded border border-line/5">
          <table className="w-full text-[12px]">
            <thead className="bg-line/[0.02]">
              <tr className="text-left text-slate-400 text-[10.5px] uppercase tracking-wider">
                <th className="px-3 py-2 font-medium">Broker</th>
                <th className="px-3 py-2 font-medium">Rating</th>
                <th className="px-3 py-2 font-medium text-right">TP</th>
                <th className="px-3 py-2 font-medium">Quarter view</th>
                <th className="px-3 py-2 font-medium">Forward outlook</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.brokerId as unknown as string}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectReport(r.reportId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectReport(r.reportId) } }}
                  title={`Open ${r.brokerShortName}'s note`}
                  className="border-t border-line/5 cursor-pointer hover:bg-line/[0.04] transition-colors"
                >
                  <td className="px-3 py-2 text-slate-200">
                    <BrokerGlyph shortName={r.brokerShortName} color={r.brokerColor} size={4}/>
                  </td>
                  <td className="px-3 py-2">
                    {r.rating ? (
                      <span className={`chip border border-line/10 bg-line/[0.04] ${RATING_TEXT_COLOR[r.rating]} text-[10px]`}>{r.rating}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right num text-slate-100">
                    {r.targetPrice != null ? formatPrice(r.targetPrice, r.targetCurrency, 0) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.quarterView ? (
                      <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${QUARTER_VIEW_TONE[r.quarterView]}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"/>
                        {QUARTER_VIEW_LABEL[r.quarterView]}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.forwardOutlook ? (
                      <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${FORWARD_TONE[r.forwardOutlook]}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"/>
                        {FORWARD_LABEL[r.forwardOutlook]}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ── D · Estimate revisions ──────────────────────────────────────────────

function RevisionsSection({ entries }: { entries: readonly RevisionEntry[] }) {
  return (
    <Section title="Estimate revisions vs previous">
      {entries.length === 0 ? (
        <Placeholder>No comparable revisions yet — most brokers don't have a prior comparable note to diff against.</Placeholder>
      ) : (
        <ul className="flex flex-col divide-y divide-line/5 rounded border border-line/5">
          {entries.map((e) => (
            <li key={e.brokerId as unknown as string} className="flex items-center gap-3 px-3 py-2">
              <span className="text-slate-200 text-[12.5px] font-medium min-w-[110px]">{e.brokerShortName}</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {e.deltas.map((d, i) => (
                  <DeltaChip key={i} delta={d}/>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DeltaChip({ delta }: { delta: RevisionEntry['deltas'][number] }) {
  const cls = delta.direction === 'up'
    ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300'
    : delta.direction === 'down'
      ? 'border-rose-500/30 bg-rose-500/[0.06] text-rose-300'
      : 'border-line/10 bg-line/[0.04] text-slate-400'
  return (
    <span className={`chip border ${cls} text-[10px]`}>
      {delta.pctText ? `${delta.metric} ${delta.pctText}` : `${delta.metric} unch`}
    </span>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line/10 bg-line/[0.01] px-3 py-3 text-[11.5px] text-slate-500">
      {children}
    </div>
  )
}
