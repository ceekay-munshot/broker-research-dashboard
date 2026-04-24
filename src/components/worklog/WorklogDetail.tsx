import { useEffect, useState } from 'react'
import type { EvidenceSnippet, ReportSummary } from '../../domain'
import type { WorklogItem } from '../../viewModels/worklog'
import { useAdapterQuery } from '../../hooks/useAdapterQuery'
import { STANCE_TEXT_COLOR, RATING_TEXT_COLOR, formatPrice } from '../../viewModels/shared'
import WorklogChangeTab from './WorklogChangeTab'

interface WorklogDetailProps {
  readonly item: WorklogItem
  readonly onOpenReport: () => void
  readonly onOpenStock: () => void
  readonly onOpenDivergence: () => void
  readonly onClose: () => void
}

export default function WorklogDetail({ item, onOpenReport, onOpenStock, onOpenDivergence, onClose }: WorklogDetailProps) {
  const [tab, setTab] = useState<'summary' | 'change' | 'evidence' | 'priority' | 'lineage'>(
    // Default to the Change tab when there's a meaningful delta — that's
    // what the analyst most wants to see first.
    item.change && (item.change.significance.bucket === 'major' || item.change.significance.bucket === 'moderate')
      ? 'change' : 'summary',
  )

  // Reset to summary when switching to a different item.
  useEffect(() => { setTab('summary') }, [item.id])

  const summaryQ = useAdapterQuery(
    (a, s) => a.getReportSummary(s, item.reportId),
    [item.reportId as unknown as string],
  )
  const evidenceQ = useAdapterQuery(
    (a, s) => a.listEvidenceSnippets(s, item.reportId),
    [item.reportId as unknown as string],
  )

  return (
    <aside className="panel p-0 sticky top-4 flex flex-col max-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="p-4 border-b border-line/5 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="chip border border-line/10 text-slate-200">{item.brokerShortName}</span>
            {item.ticker && <span className="chip border border-line/10 text-slate-200">{item.ticker}</span>}
            <span className="chip border border-line/10 text-slate-400 uppercase text-[9px] tracking-wider">{item.origin.replace('_', ' ')}</span>
          </div>
          <h3 className={`text-[14px] font-semibold leading-snug ${STANCE_TEXT_COLOR[item.stance]}`}>{item.headline}</h3>
          <p className="text-[11.5px] text-slate-500 mt-1">
            {item.stockName ?? '—'}{item.sectorName && <> · <span>{item.sectorName}</span></>} · {prettyTime(item.receivedAt)}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-[18px] leading-none">×</button>
      </div>

      {/* Signal strip */}
      <div className="px-4 py-3 border-b border-line/5 grid grid-cols-3 gap-2">
        <Sig label="Rating" value={item.rating ?? '—'} cls={item.rating ? RATING_TEXT_COLOR[item.rating] : 'text-slate-500'}/>
        <Sig
          label="Target"
          value={item.targetPrice !== null ? formatPrice(item.targetPrice, item.targetCurrency) : '—'}
          cls="text-slate-100"
        />
        <Sig
          label="Change"
          value={item.targetChangePct !== null ? `${item.targetChangePct > 0 ? '+' : ''}${item.targetChangePct.toFixed(1)}%` : '—'}
          cls={item.targetChangePct && item.targetChangePct > 0 ? 'text-emerald-400' : item.targetChangePct && item.targetChangePct < 0 ? 'text-rose-400' : 'text-slate-500'}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line/5 text-[11.5px]">
        {(['summary', 'change', 'evidence', 'priority', 'lineage'] as const).map((t) => {
          const showDot = t === 'change' && item.change
            && (item.change.significance.bucket === 'major' || item.change.significance.bucket === 'moderate')
          const dotColor = item.change?.significance.bucket === 'major' ? 'bg-rose-400' : 'bg-amber-400'
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 inline-flex items-center gap-1.5 ${tab === t ? 'text-slate-100 border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t}
              {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}/>}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-4 text-[12px]">
        {tab === 'summary' && <SummaryTab summary={summaryQ.data} loading={summaryQ.loading}/>}
        {tab === 'change' && <WorklogChangeTab item={item} onOpenPriorReport={null}/>}
        {tab === 'evidence' && <EvidenceTab evidence={evidenceQ.data ?? null} loading={evidenceQ.loading}/>}
        {tab === 'priority' && <PriorityTab item={item}/>}
        {tab === 'lineage' && <LineageTab item={item}/>}
      </div>

      {/* Pivot buttons */}
      <div className="p-3 border-t border-line/5 flex items-center gap-2">
        <button className="chip border border-line/10 text-slate-300 hover:text-slate-100 hover:border-line/20" onClick={onOpenReport}>
          Open report
        </button>
        {item.ticker && (
          <button className="chip border border-line/10 text-slate-300 hover:text-slate-100 hover:border-line/20" onClick={onOpenStock}>
            Open stock
          </button>
        )}
        {item.hasDivergence && (
          <button className="chip border border-amber-500/30 text-amber-300 hover:text-amber-100 hover:border-amber-500/50" onClick={onOpenDivergence}>
            View divergence
          </button>
        )}
      </div>
    </aside>
  )
}

function Sig({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div>
      <div className="section-title">{label}</div>
      <div className={`text-[13px] font-semibold mt-0.5 num ${cls}`}>{value}</div>
    </div>
  )
}

function SummaryTab({ summary, loading }: { summary: ReportSummary | null | undefined; loading: boolean }) {
  if (loading) return <p className="text-slate-500 animate-pulse">Loading summary…</p>
  if (!summary) return <p className="text-slate-500 italic">No summary produced for this report yet.</p>
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="section-title mb-1">Thesis</div>
        <p className="text-slate-300 leading-snug">{summary.thesis || '—'}</p>
      </div>
      {summary.keyPoints.length > 0 && (
        <div>
          <div className="section-title mb-1">Key points</div>
          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
            {summary.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {summary.themes.length > 0 && (
        <div>
          <div className="section-title mb-1">Themes</div>
          <div className="flex flex-wrap gap-1">
            {summary.themes.map((t) => <span key={t} className="chip border border-line/10 text-slate-300">{t}</span>)}
          </div>
        </div>
      )}
      {summary.risks.length > 0 && (
        <div>
          <div className="section-title mb-1">Risks</div>
          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
            {summary.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {summary.catalysts.length > 0 && (
        <div>
          <div className="section-title mb-1">Catalysts</div>
          <ul className="space-y-0.5 text-slate-300">
            {summary.catalysts.map((c, i) => (
              <li key={i}>{c.label}{c.expectedOn ? ` · ${c.expectedOn.slice(0, 10)}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EvidenceTab({ evidence, loading }: { evidence: readonly EvidenceSnippet[] | null; loading: boolean }) {
  if (loading) return <p className="text-slate-500 animate-pulse">Loading evidence…</p>
  if (!evidence || evidence.length === 0) return <p className="text-slate-500 italic">No evidence attached to this report.</p>
  return (
    <ul className="flex flex-col gap-3">
      {evidence.map((e) => (
        <li key={e.id as unknown as string} className="border border-line/10 rounded p-2.5 bg-line/[0.02]">
          <div className="flex items-center justify-between text-[10.5px] text-slate-500">
            <span>Page {e.pageNumber} · {e.supportingField}{e.fieldRef ? ` · #${e.fieldRef}` : ''}</span>
          </div>
          <p className="text-slate-200 leading-snug mt-1">{e.textSnippet}</p>
        </li>
      ))}
    </ul>
  )
}

function PriorityTab({ item }: { item: WorklogItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`chip uppercase tracking-wider text-[9px] font-bold border
          ${item.priority.bucket === 'high' ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
          : item.priority.bucket === 'medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
          : 'bg-slate-600/15 border-slate-600/30 text-slate-400'}`}
        >{item.priority.bucket}</span>
        <span className="num text-slate-300 text-[13px] font-semibold">score {item.priority.score}</span>
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-1 font-normal">Rule</th>
            <th className="pb-1 font-normal">Reason</th>
            <th className="pb-1 font-normal text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/5">
          {item.priority.reasons.map((r) => (
            <tr key={r.code} className="align-top">
              <td className="py-1 pr-2 text-slate-500 font-mono">{r.code}</td>
              <td className="py-1 pr-2 text-slate-200">{r.text}</td>
              <td className={`py-1 text-right num ${r.points >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {r.points >= 0 ? `+${r.points}` : r.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-slate-500 text-[10.5px]">Priority is deterministic — every point is justified by a rule. See <code className="text-slate-400">docs/daily-worklog.md</code>.</p>
    </div>
  )
}

function LineageTab({ item }: { item: WorklogItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="section-title mb-1">Origin</div>
        <div className="text-slate-300">{item.origin.replace('_', ' ')}</div>
      </div>
      <div>
        <div className="section-title mb-1">Parent email</div>
        {item.source.parentEmailId ? (
          <div>
            <div className="text-slate-300 font-mono text-[11px]">{item.source.parentEmailId as unknown as string}</div>
            <div className="text-slate-400 mt-1">{item.source.parentSubject ?? '—'}</div>
          </div>
        ) : <div className="text-slate-500 italic">—</div>}
      </div>
      <div>
        <div className="section-title mb-1">Digest split</div>
        <div className="text-slate-300">{item.source.isSplitFromDigest ? 'Yes' : 'No'}</div>
      </div>
      {item.source.duplicateCount > 0 && (
        <div>
          <div className="section-title mb-1">Collapsed duplicates ({item.source.duplicateCount})</div>
          <ul className="text-slate-400 font-mono text-[10.5px] space-y-0.5">
            {item.source.collapsedIds.map((id) => <li key={id}>{id}</li>)}
          </ul>
        </div>
      )}
      <div>
        <div className="section-title mb-1">Timing</div>
        <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11.5px]">
          <div><span className="text-slate-500">Published</span><br/>{item.publishedAt.replace('T', ' ').slice(0, 16)}Z</div>
          <div><span className="text-slate-500">Received</span><br/>{item.receivedAt.replace('T', ' ').slice(0, 16)}Z</div>
        </div>
      </div>
    </div>
  )
}

function prettyTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16) + 'Z'
}
