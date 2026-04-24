import type { DailyWorklogSummary } from '../../viewModels/worklog'

interface WorklogHeaderProps {
  readonly summary: DailyWorklogSummary
}

export default function WorklogHeader({ summary }: WorklogHeaderProps) {
  return (
    <div className="panel p-5 flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">Daily Worklog</h2>
          <p className="text-slate-400 text-[12px]">
            {prettyDate(summary.utcDate)} · triage surface for today's inbound research.
          </p>
        </div>
        <span className="text-[11px] text-slate-500 num">
          {summary.totalItems} canonical items
          {summary.totalItemsRaw !== summary.totalItems && (
            <span className="text-slate-600"> · {summary.totalItemsRaw - summary.totalItems} collapsed</span>
          )}
        </span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat label="Items"          value={summary.totalItems}           tone="slate"/>
        <Stat label="High priority"  value={summary.highPriority}         tone={summary.highPriority > 0 ? 'rose' : 'slate'}/>
        <Stat label="Active brokers" value={summary.activeBrokers}        tone="slate"/>
        <Stat label="Stocks touched" value={summary.mentionedStocks}      tone="slate"/>
        <Stat label="Rating notes"   value={summary.ratingChangeItems}    tone="slate"/>
        <Stat label="Target changes" value={summary.targetChangeItems}    tone={summary.targetChangeItems > 0 ? 'emerald' : 'slate'}/>
        <Stat label="Divergence"     value={summary.divergenceItems}      tone={summary.divergenceItems > 0 ? 'amber' : 'slate'}/>
      </dl>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'rose' | 'amber' | 'emerald' }) {
  const toneCls =
    tone === 'rose'    ? 'text-rose-400'
    : tone === 'amber' ? 'text-amber-400'
    : tone === 'emerald' ? 'text-emerald-400'
    : 'text-slate-100'
  return (
    <div className="flex flex-col">
      <dt className="section-title">{label}</dt>
      <dd className={`num text-[22px] font-semibold leading-none mt-1 ${toneCls}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

function prettyDate(utcDate: string): string {
  const d = new Date(`${utcDate}T00:00:00Z`)
  const wday = d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })
  const day  = d.toLocaleDateString('en', { day: '2-digit', timeZone: 'UTC' })
  const mon  = d.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
  const yr   = d.getUTCFullYear()
  return `${wday} ${day} ${mon} ${yr}`
}
