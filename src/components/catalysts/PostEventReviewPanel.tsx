import type { CatalystId, ReportId, StockTicker } from '../../domain'
import { usePostEventReviewViewModel } from '../../hooks/usePostEventReviewViewModel'
import BrokerVerdictRow from './BrokerVerdictRow'

interface PostEventReviewPanelProps {
  readonly catalystId: CatalystId | null
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectTicker: (t: StockTicker) => void
}

const DIRECTION_TONE = {
  up:      'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  down:    'text-rose-300 border-rose-500/40 bg-rose-500/10',
  flat:    'text-slate-300 border-slate-400/30 bg-line/[0.04]',
  mixed:   'text-amber-300 border-amber-500/40 bg-amber-500/10',
  unknown: 'text-slate-500 border-line/10',
} as const

export default function PostEventReviewPanel({
  catalystId, onSelectReport, onSelectTicker,
}: PostEventReviewPanelProps) {
  const { data, loading, error } = usePostEventReviewViewModel(catalystId)
  if (!catalystId) {
    return (
      <aside className="panel p-5 text-slate-500 text-[12px] sticky top-4">
        <p className="mb-2">Select a completed event to see the post-event review.</p>
        <p className="text-slate-600 text-[11px]">Reviews compare pre-event expectations to realized direction and feed into broker calibration.</p>
      </aside>
    )
  }
  if (loading || !data) return <aside className="panel p-5 text-slate-500 text-[12px] animate-pulse">Loading review…</aside>
  if (error) return <aside className="panel p-5 text-rose-400 text-[12px]">Error: {error.message}</aside>
  if (!data.hasReview) {
    return (
      <aside className="panel p-5 text-slate-500 text-[12px]">
        <p className="mb-2 text-slate-300">No post-event review available.</p>
        <p>{data.degradations[0] ?? '—'}</p>
      </aside>
    )
  }
  const h = data.headline!
  return (
    <aside className="panel p-4 flex flex-col gap-3 sticky top-4 max-h-[80vh] overflow-y-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onSelectTicker(data.review!.realizedOutcome.ticker)}
              className="chip border border-line/10 text-slate-200 hover:text-accent text-[10.5px]"
            >{h.tickerStr}</button>
            <span className={`chip border ${DIRECTION_TONE[h.headlineDirection]} text-[10px] uppercase tracking-wider font-semibold`}>
              {h.headlineDirection}
            </span>
            <span className="chip border border-line/10 text-slate-300 text-[10px] uppercase tracking-wider">
              {h.confidence}
            </span>
          </div>
          <h3 className="text-slate-100 font-semibold text-[13px]">Post-event review</h3>
        </div>
      </header>

      <div className="text-[12px] text-slate-200 leading-relaxed border-l-2 border-accent/30 pl-3">
        {h.outcomeSummary}
      </div>

      {data.executiveSummary && (
        <div className="text-[11.5px] text-slate-300 italic">
          {data.executiveSummary}
          {data.executiveSummaryFromLlm && (
            <span className="ml-1.5 text-[9.5px] text-slate-500 uppercase tracking-wider not-italic">[LLM]</span>
          )}
        </div>
      )}

      {/* Realized return windows */}
      <section className="flex flex-col gap-1.5">
        <h4 className="text-slate-100 text-[12px] font-semibold">Realized outcome</h4>
        <p className="text-slate-500 text-[10.5px]">Anchor close on {h.expectedDate}.</p>
        <div className="grid grid-cols-4 gap-1 text-[11px]">
          {data.returnWindows.map((w) => (
            <div key={w.window} className={`px-2 py-1.5 rounded border ${
              w.direction === 'up' ? 'border-emerald-500/30' :
              w.direction === 'down' ? 'border-rose-500/30' :
              w.direction === 'flat' ? 'border-line/10' : 'border-line/5'
            } bg-line/[0.02]`}>
              <div className="uppercase tracking-wider text-[9.5px] text-slate-500">{w.window}</div>
              <div className={`num text-[12px] font-semibold ${w.direction === 'up' ? 'text-emerald-300' : w.direction === 'down' ? 'text-rose-300' : 'text-slate-300'}`}>
                {w.rawReturnPct === null ? '—' : `${w.rawReturnPct >= 0 ? '+' : ''}${w.rawReturnPct.toFixed(2)}%`}
              </div>
              {w.benchmarkRelReturnPct !== null && (
                <div className="text-[10px] text-slate-500 num">
                  rel {w.benchmarkRelReturnPct >= 0 ? '+' : ''}{w.benchmarkRelReturnPct.toFixed(2)}%
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Broker verdicts */}
      <section className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between">
          <h4 className="text-slate-100 text-[12px] font-semibold">Broker verdicts</h4>
          <span className="text-[10.5px] text-slate-500 num">
            <span className="text-emerald-300">{data.verdictCounts.right} right</span> ·
            <span className="text-rose-300 ml-1">{data.verdictCounts.wrong} wrong</span>
            {data.verdictCounts.inconclusive > 0 && <> · <span>{data.verdictCounts.inconclusive} inc</span></>}
            {data.verdictCounts.noView > 0 && <> · <span className="text-slate-500">{data.verdictCounts.noView} no-view</span></>}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {data.verdictRows.map((row) => (
            <BrokerVerdictRow key={row.brokerId as unknown as string} row={row}/>
          ))}
        </div>
      </section>

      {/* Divergence resolution */}
      {data.divergenceKind && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-slate-100 text-[12px] font-semibold">Divergence resolution</h4>
          <div className={`chip text-[11px] border ${
            data.divergenceKind === 'outlier_vindicated'   ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' :
            data.divergenceKind === 'outlier_invalidated'  ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' :
            data.divergenceKind === 'resolved'             ? 'border-slate-400/30 text-slate-200' :
            data.divergenceKind === 'widened'              ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' :
            data.divergenceKind === 'persisted'            ? 'border-slate-400/30 text-slate-200' :
                                                              'border-line/10 text-slate-500'
          } inline-block self-start`}>
            {data.divergenceKind.replace(/_/g, ' ')}
          </div>
          <p className="text-slate-300 text-[11.5px]">{data.divergenceNote}</p>
        </section>
      )}

      {/* Expectation errors */}
      {data.expectationErrors.length > 0 && data.expectationErrors[0]!.kind !== 'no_significant_error' && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-slate-100 text-[12px] font-semibold">Where expectations missed</h4>
          <div className="flex flex-col gap-1">
            {data.expectationErrors.filter((e) => e.kind !== 'no_significant_error').map((e) => (
              <div key={e.kind} className="flex items-center gap-2 text-[11.5px]">
                <span className={`chip text-[10px] border ${e.magnitude >= 60 ? 'border-rose-500/40 text-rose-300 bg-rose-500/10' : 'border-amber-500/30 text-amber-300 bg-amber-500/[0.06]'}`}>
                  {e.magnitude}
                </span>
                <span className="text-slate-300">{e.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top post-event reads */}
      {data.topPostEventReportIds.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-slate-100 text-[12px] font-semibold">Top post-event reads</h4>
          <div className="flex flex-wrap gap-1">
            {data.topPostEventReportIds.map((id) => (
              <button
                key={id as unknown as string}
                onClick={() => onSelectReport(id)}
                className="chip border border-line/10 text-slate-300 hover:text-accent text-[10.5px]"
              >open report</button>
            ))}
          </div>
        </section>
      )}

      {/* Calibration implications */}
      {data.review && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-slate-100 text-[12px] font-semibold">What the system learned</h4>
          <ul className="text-[11.5px] text-slate-300 list-disc list-outside ml-4 flex flex-col gap-0.5">
            <li>
              {data.verdictCounts.right} broker{data.verdictCounts.right === 1 ? '' : 's'} right vs {data.verdictCounts.wrong} wrong → contributes to calibration scoring on this catalyst type ({data.review.calibrationFeedback.catalystTypePerformance.type.replace(/_/g, ' ')}).
            </li>
            {data.review.calibrationFeedback.preEventAlertUsefulness.filter((a) => a.useful).length > 0 && (
              <li>
                {data.review.calibrationFeedback.preEventAlertUsefulness.filter((a) => a.useful).length} pre-event alert(s) were useful — alert effectiveness gets a positive observation.
              </li>
            )}
            {data.review.divergenceResolution.vindicatedOutlierBrokerIds.length > 0 && (
              <li>
                {data.review.divergenceResolution.vindicatedOutlierBrokerIds.length} outlier(s) were vindicated — re-weight upward in future briefs.
              </li>
            )}
            <li className="text-slate-500 italic">Calibration scores remain unchanged unless <code className="kbd">VITE_CALIBRATION_AWARE_RANKING=1</code> is set.</li>
          </ul>
        </section>
      )}

      {data.notes.length > 0 && (
        <section className="text-[10.5px] text-slate-500">
          {data.notes.map((n, i) => <div key={i}>· {n}</div>)}
        </section>
      )}
    </aside>
  )
}
