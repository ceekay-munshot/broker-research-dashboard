// Read-only Inbox tab — surfaces what the system has delivered.
// Click-through opens the relevant tab (briefing, my book, catalysts, sources).

import { useInboxViewModel } from '../../hooks/useInboxViewModel'
import { STATUS_CLASS, type InboxRowViewModel } from '../../viewModels/inbox'
import type { TabId } from '../../app/tabs'
import { emitUsage } from '../../usage/UsageClient'

interface InboxProps {
  readonly setActiveTab: (id: TabId) => void
}

export default function Inbox({ setActiveTab }: InboxProps) {
  const { data, loading, error } = useInboxViewModel()
  if (error)             return <ViewMessage tone="error"   text={`Error: ${error.message}`}/>
  if (loading || !data)  return <ViewMessage tone="loading" text="Loading inbox…"/>

  if (!data.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <Header counts={data.counts}/>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">Nothing delivered yet</div>
          <p className="max-w-md mx-auto">Awaiting server output.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Header counts={data.counts}/>
      {data.groups.map((g) => (
        <section key={g.key} className="panel p-3 flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <h3 className="text-slate-100 text-[13px] font-semibold">{g.label}</h3>
            <span className="text-slate-500 text-[11px] num">{g.rows.length}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {g.rows.map((r) => (
              <li key={r.attempt.id as unknown as string}>
                <InboxRow row={r} setActiveTab={setActiveTab}/>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Header({ counts }: { counts: { total: number; sent: number; failed: number; suppressed: number; queued: number } }) {
  return (
    <header className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Inbox</h2>
        <p className="text-slate-400 text-[12px]">Delivered briefs, alerts, and incidents — read-only audit of what the system has sent.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <Stat label="Total"      value={counts.total}      tone="slate"/>
        <Stat label="Sent"       value={counts.sent}       tone="emerald"/>
        <Stat label="Failed"     value={counts.failed}     tone="rose"/>
        <Stat label="Suppressed" value={counts.suppressed} tone="slate"/>
        <Stat label="Queued"     value={counts.queued}     tone="amber"/>
      </div>
    </header>
  )
}

function InboxRow({
  row, setActiveTab,
}: {
  row: InboxRowViewModel
  setActiveTab: (id: TabId) => void
}) {
  const a = row.attempt
  const onClick = () => {
    // Always emit open_delivery — the user clicked the inbox row.
    emitUsage({
      eventType: 'open_delivery',
      surface: 'inbox',
      contentKind: a.contentKind,
      entityId: a.id as unknown as string,
      fromSurface: 'inbox',
      meta: { channel: a.channel },
    })
    if (!a.clickThrough) return
    const tab = a.clickThrough.tab
    if (tab === 'briefing' || tab === 'mybook' || tab === 'catalysts' || tab === 'sources' || tab === 'worklog') {
      // Click-through emits a separate event so we can compute CTR.
      emitUsage({
        eventType: 'click_through_delivery',
        surface: 'inbox',
        contentKind: a.contentKind,
        entityId: a.id as unknown as string,
        fromSurface: 'inbox',
        meta: { channel: a.channel, tab },
      })
      setActiveTab(tab as TabId)
    }
  }
  const clickable = !!a.clickThrough
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`px-3 py-2 rounded border border-line/10 bg-line/[0.02] ${clickable ? 'hover:bg-line/[0.04] cursor-pointer' : ''} flex flex-col gap-1`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className={`chip border text-[10px] uppercase tracking-wider ${STATUS_CLASS[row.statusTone]}`}>
          {a.status}
        </span>
        <span className="chip border border-line/10 text-slate-300 text-[10px]">{row.channelLabel}</span>
        <span className="chip border border-line/10 text-slate-300 text-[10px]">{row.contentKindLabel}</span>
        {row.badges.map((b) => (
          <span key={b} className="chip border border-amber-500/40 text-amber-300 bg-amber-500/[0.06] text-[10px] uppercase tracking-wider">{b}</span>
        ))}
        <span className="ml-auto text-[10.5px] text-slate-500 num" title={row.when}>{row.relativeWhen}</span>
      </div>
      <div className="text-[12.5px] text-slate-100 font-medium truncate" title={a.payloadSummary.title}>
        {a.payloadSummary.title}
      </div>
      <div className="text-[11px] text-slate-400 truncate" title={a.payloadSummary.subtitle}>
        {a.payloadSummary.subtitle}
      </div>
      {a.payloadSummary.bullets.length > 0 && (
        <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-0.5">
          {a.payloadSummary.bullets.slice(0, 3).map((b, i) => <li key={i} className="truncate">{b}</li>)}
        </ul>
      )}
      {a.errorMessage && (
        <div className="text-[10.5px] text-rose-300">[{a.errorCategory}] {a.errorMessage}</div>
      )}
      <div className="text-[10px] text-slate-500 mt-0.5">
        to <code className="text-slate-400">{a.target.label}</code> · run {(a.runId as unknown as string).slice(0, 16)}…
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-300'
    : tone === 'amber'   ? 'text-amber-300'
    : tone === 'rose'    ? 'text-rose-300'
    :                       'text-slate-200'
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`num text-[12px] font-semibold ${toneClass}`}>{value}</span>
    </div>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
