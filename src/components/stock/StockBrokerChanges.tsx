import type { EvidenceSnippet, ReportSummary, Broker, Stock, ReportId, StockTicker } from '../../domain'
import { useAdapterQuery } from '../../hooks/useAdapterQuery'
import { buildBrokerMemoryViewModel } from '../../viewModels/brokerMemory'
import type { StockBrokerLatestChange } from '../../viewModels/brokerMemory'
import { RATING_TEXT_COLOR } from '../../viewModels/shared'
import {
  TONE_TEXT_CLASS, TONE_CHIP_CLASS, getSignificanceTone, getChangeTone, BROKER_GLYPH_CLASS,
} from '../../lib/semanticColor'

interface StockBrokerChangesProps {
  readonly ticker: StockTicker
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  readonly onSelectReport: (id: ReportId) => void
}

/** Renders the "Latest broker changes" rail for one stock. Self-contained:
 *  fetches the data it needs through the adapter and builds the
 *  change-sets via the broker-memory view-model. */
export default function StockBrokerChanges({ ticker, brokers, stocks, onSelectReport }: StockBrokerChangesProps) {
  // Fetch all reports covering this ticker (we need history for the linker
  // to find prior comparables).
  const reports = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { tickers: [ticker], limit: 200 }),
    [ticker as unknown as string],
  )
  const summaries = useAdapterQuery<readonly ReportSummary[]>(
    async (a, s) => {
      const rs = reports.data?.items ?? []
      const results = await Promise.allSettled(rs.map((r) => a.getReportSummary(s, r.id)))
      return results
        .flatMap<ReportSummary>((r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [])
    },
    [reports.data?.items.map((r) => r.id as string).join(',') ?? ''],
  )
  const evidence = useAdapterQuery<readonly EvidenceSnippet[]>(
    async (a, s) => {
      const rs = reports.data?.items ?? []
      const results = await Promise.allSettled(rs.map((r) => a.listEvidenceSnippets(s, r.id)))
      return results.flatMap<EvidenceSnippet>((r) => r.status === 'fulfilled' ? [...r.value] : [])
    },
    [reports.data?.items.map((r) => r.id as string).join(',') ?? ''],
  )

  if (reports.loading && !reports.data) {
    return <Shell><p className="text-slate-500 animate-pulse">Loading broker history…</p></Shell>
  }
  if (reports.error) {
    return <Shell><p className="text-rose-400">Error: {reports.error.message}</p></Shell>
  }
  const vm = buildBrokerMemoryViewModel({
    reports: reports.data?.items ?? [],
    summaries: summaries.data ?? [],
    evidence: evidence.data ?? [],
    brokers,
    stocks,
  })
  const summary = vm.stockSummaries.get(ticker as unknown as string)
  const entries = summary?.brokerEntries ?? []

  if (entries.length === 0) {
    return <Shell>
      <p className="text-slate-500 text-[12px]">No comparable broker history for this ticker yet.</p>
    </Shell>
  }

  return (
    <div className="panel p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h3 className="text-slate-100 font-semibold text-[14px]">Latest broker changes</h3>
          <p className="text-slate-400 text-[11.5px]">
            Current note vs prior comparable, per broker. {' '}
            <span className="text-slate-500">{summary?.majorCount ?? 0} major · {summary?.moderateCount ?? 0} moderate · {summary?.unchangedCount ?? 0} unchanged · {summary?.firstCoverageCount ?? 0} new coverage</span>
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line/5">
        {entries.map((e) => (
          <li key={e.brokerId as unknown as string}>
            <BrokerRow entry={e} onSelectReport={onSelectReport}/>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BrokerRow({ entry, onSelectReport }: { entry: StockBrokerLatestChange; onSelectReport: (id: ReportId) => void }) {
  const c = entry.change
  const bucketCls = TONE_CHIP_CLASS[getSignificanceTone(c.significance.bucket)]
  const bucketLabel =
    c.significance.bucket === 'first_coverage' ? 'initiation'
    : c.significance.bucket === 'minor' ? 'unchanged'
    : c.significance.bucket

  return (
    <button
      onClick={() => onSelectReport(entry.latestReportId)}
      className="w-full text-left py-2.5 px-1 flex items-start gap-3 hover:bg-line/[0.02] rounded transition-colors"
    >
      <span
        className={`w-6 h-6 rounded-sm flex-shrink-0 flex items-center justify-center text-[9.5px] font-bold mt-0.5 ${BROKER_GLYPH_CLASS}`}
      >{entry.brokerShortName.slice(0, 3).toUpperCase()}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-slate-100 font-semibold">{entry.brokerShortName}</span>
          <span className={`chip border ${bucketCls} uppercase tracking-wider text-[9px] font-bold`}>{bucketLabel}</span>
          <span className="text-slate-500 text-[10.5px] num">{entry.latestPublishedAt.slice(0, 10)}</span>
          {entry.priorPublishedAt && (
            <span className="text-slate-500 text-[10.5px] num">← prior {entry.priorPublishedAt.slice(0, 10)}</span>
          )}
        </div>
        <div className="text-[11.5px] text-slate-300 mt-0.5 truncate">{c.headline}</div>
      </div>

      {/* Rating delta column */}
      <div className="flex flex-col items-end shrink-0 min-w-[110px] text-[10.5px]">
        {c.ratingAfter && (
          <span className={RATING_TEXT_COLOR[c.ratingAfter]}>
            {c.ratingChanged && c.ratingBefore ? `${c.ratingBefore} → ` : ''}
            {c.ratingAfter}
          </span>
        )}
        {c.targetChangePct !== null && (
          <span className={`num ${TONE_TEXT_CLASS[getChangeTone(c.targetChangePct)]}`}>
            {c.targetChangePct > 0 ? '▲ +' : c.targetChangePct < 0 ? '▼ ' : ''}
            {c.targetChangePct !== 0 ? `${Math.abs(c.targetChangePct).toFixed(1)}%` : 'flat'}
          </span>
        )}
      </div>
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <h3 className="text-slate-100 font-semibold text-[14px] mb-2">Latest broker changes</h3>
      {children}
    </div>
  )
}
