import type { Broker, EvidenceSnippet, ReportId, ReportSummary, Stock } from '../../domain'
import { useAdapterQuery } from '../../hooks/useAdapterQuery'
import { buildBrokerMemoryViewModel, type BrokerRecentChange } from '../../viewModels/brokerMemory'
import { TONE_TEXT_CLASS, getChangeTone, type SemanticTone } from '../../lib/semanticColor'

interface BrokerRecentChangesProps {
  readonly brokers: readonly Broker[]
  readonly stocks: readonly Stock[]
  readonly onSelectReport: (id: ReportId) => void
  readonly windowDays?: number
}

/**
 * "What changed recently" — per-broker aggregate panel. Buckets the
 * broker-memory output into four columns: biggest target raises,
 * biggest target cuts, rating changes, and repeated-thesis items. Shows
 * only brokers with ≥1 comparable change-set in the window.
 */
export default function BrokerRecentChanges({ brokers, stocks, onSelectReport, windowDays = 14 }: BrokerRecentChangesProps) {
  const reports = useAdapterQuery(
    (a, s) => a.listResearchReports(s, { limit: 400 }),
    [],
  )
  const summaries = useAdapterQuery<readonly ReportSummary[]>(
    async (a, s) => {
      const rs = reports.data?.items ?? []
      const results = await Promise.allSettled(rs.map((r) => a.getReportSummary(s, r.id)))
      return results.flatMap<ReportSummary>(
        (r) => r.status === 'fulfilled' && r.value !== null ? [r.value] : [],
      )
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
    return <Shell><p className="text-slate-500 animate-pulse">Loading history…</p></Shell>
  }
  if (reports.error) return <Shell><p className="text-rose-400">Error: {reports.error.message}</p></Shell>

  const vm = buildBrokerMemoryViewModel({
    reports: reports.data?.items ?? [],
    summaries: summaries.data ?? [],
    evidence: evidence.data ?? [],
    brokers,
    stocks,
    brokerWindowDays: windowDays,
  })

  // Flatten into a deterministic display order: brokers with any changes
  // first, ordered by total compared desc.
  const rows = [...vm.brokerSummaries.values()]
    .filter((s) => s.totalCompared > 0)
    .sort((a, b) => b.totalCompared - a.totalCompared)

  if (rows.length === 0) {
    return <Shell>
      <p className="text-slate-500 text-[12px]">No change history in the last {windowDays} days.</p>
    </Shell>
  }

  return (
    <div className="panel p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h3 className="text-slate-100 font-semibold text-[14px]">What changed recently</h3>
          <p className="text-slate-400 text-[11.5px]">
            Per-broker summary of the last {windowDays} days: biggest moves, rating changes, and names where the thesis repeated.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((s) => (
          <div key={s.brokerId as unknown as string} className="border border-line/5 rounded p-3 bg-line/[0.01]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-slate-100 font-semibold text-[13px]">{s.brokerShortName}</h4>
              <span className="text-[10.5px] text-slate-500 num">
                {s.totalCompared} note{s.totalCompared === 1 ? '' : 's'} compared ·{' '}
                {s.majorViewChanges.length} major ·{' '}
                {s.ratingChanges.length} rating Δ
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Column
                title="Biggest target raises"
                tone="positive"
                changes={s.biggestTargetRaises}
                onSelectReport={onSelectReport}
              />
              <Column
                title="Biggest target cuts"
                tone="negative"
                changes={s.biggestTargetCuts}
                onSelectReport={onSelectReport}
              />
              <Column
                title="Rating changes"
                tone="info"
                changes={s.ratingChanges}
                onSelectReport={onSelectReport}
                renderExtra={(c) => (
                  <span className="text-[10.5px] text-slate-500">
                    {c.change.ratingBefore ?? '—'} → {c.change.ratingAfter ?? '—'}
                  </span>
                )}
              />
              <Column
                title="Repeated thesis"
                tone="neutral"
                changes={s.repeatedThesis}
                onSelectReport={onSelectReport}
                emptyText="Every note added something new."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Column({
  title, changes, onSelectReport, tone, emptyText, renderExtra,
}: {
  title: string
  changes: readonly BrokerRecentChange[]
  onSelectReport: (id: ReportId) => void
  tone: SemanticTone
  emptyText?: string
  renderExtra?: (c: BrokerRecentChange) => React.ReactNode
}) {
  const tHead = TONE_TEXT_CLASS[tone]

  return (
    <div>
      <div className={`text-[10.5px] uppercase tracking-widest ${tHead} mb-1.5`}>{title}</div>
      {changes.length === 0 && (
        <p className="text-slate-500 italic text-[11px]">{emptyText ?? '—'}</p>
      )}
      <ul className="flex flex-col gap-1">
        {changes.map((c) => (
          <li key={c.reportId as unknown as string}>
            <button
              onClick={() => onSelectReport(c.reportId)}
              className="w-full text-left flex flex-col gap-0.5 hover:bg-line/[0.04] rounded px-1.5 py-1 -mx-1.5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="chip border border-line/10 text-slate-200 text-[10.5px]">{c.ticker as unknown as string}</span>
                {c.change.targetChangePct !== null && (
                  <span className={`num text-[10.5px] ${TONE_TEXT_CLASS[getChangeTone(c.change.targetChangePct)]}`}>
                    {c.change.targetChangePct > 0 ? '+' : ''}
                    {c.change.targetChangePct.toFixed(1)}%
                  </span>
                )}
                {renderExtra?.(c)}
              </div>
              <span className="text-slate-400 text-[11px] truncate block">{c.change.headline}</span>
              <span className="text-slate-500 text-[10px] num">{c.receivedAt.slice(0, 10)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <h3 className="text-slate-100 font-semibold text-[14px] mb-2">What changed recently</h3>
      {children}
    </div>
  )
}
