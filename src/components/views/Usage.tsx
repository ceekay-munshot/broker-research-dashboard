// Read-only Pilot Analytics tab — operator/founder/pilot-review surface.
//
// Three sections:
//   1. Adoption + surface usage
//   2. Delivery + channel engagement
//   3. Ranking experiment + read depth + ROI summary
//
// All metrics are hedged where sample size is small. No write actions.

import { useOrgUsageSnapshot } from '../../hooks/useOrgUsageSnapshot'
import { usePilotRoiSnapshot } from '../../hooks/usePilotRoiSnapshot'
import {
  buildUsageTabViewModel, buildRoiTabViewModel,
  formatPercent, formatDuration,
} from '../../viewModels/usage'

export default function Usage() {
  const usageQ = useOrgUsageSnapshot({ windowDays: 7 })
  const roiQ = usePilotRoiSnapshot({ windowDays: 30 })

  if (usageQ.error)             return <ViewMessage tone="error"   text={`Error: ${usageQ.error.message}`}/>
  if (usageQ.loading)           return <ViewMessage tone="loading" text="Loading pilot analytics…"/>

  const vm = buildUsageTabViewModel(usageQ.data ?? null)
  const roi = buildRoiTabViewModel(roiQ.data ?? null)

  if (!vm.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <Header generatedAt={null} windowDays={0}/>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No usage data yet</div>
          <p className="max-w-md mx-auto">Awaiting server output.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Header generatedAt={vm.generatedAt} windowDays={vm.windowDays}/>

      {/* Adoption KPIs + source-health mix */}
      <section className="panel p-3 flex flex-col gap-2">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-slate-100 text-[13px] font-semibold">Adoption · last {vm.windowDays}d</h3>
            <p className="text-slate-500 text-[11px]">Lightweight, deterministic instrumentation. No PII.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <Stat label="Events"   value={vm.headline.events}        tone="slate"/>
          <Stat label="Sessions" value={vm.headline.sessions}      tone="slate"/>
          <Stat label="Users"    value={vm.headline.distinctUsers} tone="slate"/>
          <Stat label="Opens"    value={vm.headline.opens}         tone="emerald"/>
          <Stat label="DAU"      value={vm.headline.dau}           tone="emerald"/>
          <Stat label="WAU"      value={vm.headline.wau}           tone="emerald"/>
        </div>
        <div className="text-[11px] text-slate-400">
          Source-health mix during recorded events:&nbsp;
          <span className="text-emerald-300">healthy {vm.sourceHealthMix.healthy}</span> ·
          <span className="text-amber-300"> stale {vm.sourceHealthMix.stale}</span> ·
          <span className="text-rose-300"> failing {vm.sourceHealthMix.failing}</span> ·
          <span className="text-slate-300"> degraded {vm.sourceHealthMix.degraded}</span> ·
          <span className="text-slate-500"> unknown {vm.sourceHealthMix.unknown}</span>
          {vm.degradedShare > 0.5 && (
            <span className="ml-2 chip border border-amber-500/40 text-amber-300 text-[10px]">{Math.round(vm.degradedShare * 100)}% under degraded sources — interpret with care</span>
          )}
        </div>
      </section>

      {/* Surface usage */}
      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Surface usage</h3>
        <p className="text-slate-500 text-[11px]">Where users spend time, what they open from.</p>
        <table className="w-full text-[11.5px]">
          <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
            <tr><th className="text-left py-1">Surface</th><th className="text-right">Views</th><th className="text-right">Opens from here</th><th className="text-right">Distinct users</th></tr>
          </thead>
          <tbody>
            {vm.surfaces.map((s) => (
              <tr key={s.surface} className="border-t border-line/5">
                <td className={`py-1 ${s.toneClass}`}>{s.surface}</td>
                <td className="text-right num">{s.views}</td>
                <td className="text-right num">{s.opensFromSurface}</td>
                <td className="text-right num">{s.distinctUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Delivery engagement */}
      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Delivery engagement</h3>
        <p className="text-slate-500 text-[11px]">By content kind × channel. Open rate + median time-to-first-open.</p>
        {vm.deliveryEngagement.length === 0 ? (
          <div className="text-[11.5px] text-slate-500 py-2">No deliveries in window.</div>
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
              <tr>
                <th className="text-left py-1">Content</th>
                <th className="text-left">Channel</th>
                <th className="text-right">Delivered</th>
                <th className="text-right">Open rate</th>
                <th className="text-right">Median t-to-open</th>
              </tr>
            </thead>
            <tbody>
              {vm.deliveryEngagement.map((d) => (
                <tr key={`${d.contentKind}::${d.channel}`} className="border-t border-line/5">
                  <td className="py-1">{d.contentKind}</td>
                  <td>{d.channel}</td>
                  <td className="text-right num">{d.delivered}</td>
                  <td className="text-right num">{d.delivered > 0 ? formatPercent(d.opened / d.delivered) : '—'}</td>
                  <td className="text-right num">{formatDuration(d.medianTimeToFirstOpenSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Ranking experiment */}
      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Ranking experiment · adaptive vs baseline</h3>
        <p className="text-slate-500 text-[11px]">{vm.rankingExperiment.note}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <Stat label="Baseline opens"  value={vm.rankingExperiment.baselineOpens}     tone="slate"/>
          <Stat label="Adaptive opens"  value={vm.rankingExperiment.adaptiveOpens}     tone="emerald"/>
          <Stat label="Compare opens"   value={vm.rankingExperiment.compareModeOpens}  tone="slate"/>
          <Stat label="Top-5 base"      value={vm.rankingExperiment.top5Opens.baseline} tone="slate"/>
          <Stat label="Top-5 adaptive"  value={vm.rankingExperiment.top5Opens.adaptive} tone="emerald"/>
          <Stat label="Median TTFO base" value={formatDuration(vm.rankingExperiment.medianTimeToFirstOpenSeconds.baseline)} tone="slate"/>
          <Stat label="Median TTFO adapt" value={formatDuration(vm.rankingExperiment.medianTimeToFirstOpenSeconds.adaptive)} tone="emerald"/>
        </div>
      </section>

      {/* Top engaged content kinds */}
      {vm.contentEngagement.length > 0 && (
        <section className="panel p-3 flex flex-col gap-2">
          <h3 className="text-slate-100 text-[13px] font-semibold">Top engaged content kinds</h3>
          <table className="w-full text-[11.5px]">
            <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
              <tr><th className="text-left py-1">Kind</th><th className="text-right">Opens</th><th className="text-right">Distinct entities</th><th className="text-right">Distinct users</th></tr>
            </thead>
            <tbody>
              {vm.contentEngagement.slice(0, 10).map((c) => (
                <tr key={String(c.contentKind)} className="border-t border-line/5">
                  <td className="py-1">{String(c.contentKind)}</td>
                  <td className="text-right num">{c.opens}</td>
                  <td className="text-right num">{c.distinctEntities}</td>
                  <td className="text-right num">{c.distinctUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ROI summary */}
      {roi.hasData && roi.metrics && (
        <section className="panel p-3 flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-slate-100 text-[13px] font-semibold">Pilot ROI · last {roi.windowDays}d</h3>
              <p className="text-slate-500 text-[11px]">{roi.headlines[0] ?? ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <Stat label="Morning brief"   value={formatPercent(roi.metrics.morningBriefOpenRate)}      tone="emerald"/>
            <Stat label="Intraday open"    value={formatPercent(roi.metrics.intradayCriticalOpenRate)} tone="emerald"/>
            <Stat label="CTR"              value={formatPercent(roi.metrics.clickThroughRate)}         tone="slate"/>
            <Stat label="Opens / day"      value={String(roi.metrics.avgOpensPerActiveDay)}            tone="slate"/>
            <Stat label="t-to-1st-open"    value={formatDuration(roi.metrics.medianTimeToFirstImportantOpenSeconds)} tone="slate"/>
            <Stat label="Held-name crit"   value={formatPercent(roi.metrics.heldNameCriticalAlertOpenRate)} tone="amber"/>
            <Stat label="Pre-event review" value={formatPercent(roi.metrics.heldNameReviewedBeforeCatalystRate)} tone="amber"/>
            <Stat label="Post-event use"   value={formatPercent(roi.metrics.postEventReviewUsageRate)} tone="slate"/>
          </div>
          {roi.headlines.length > 0 && (
            <ul className="text-[11.5px] text-slate-300 list-disc list-inside space-y-0.5">
              {roi.headlines.slice(1).map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
          {roi.caveats.length > 0 && (
            <div className="text-[10.5px] text-amber-300 mt-1">
              <span className="uppercase tracking-widest text-[9.5px] mr-2">Caveats</span>
              {roi.caveats.join('  ·  ')}
            </div>
          )}
          {roi.channelEngagement.length > 0 && (
            <div className="mt-2">
              <h4 className="text-slate-200 text-[12px] font-semibold mb-1">Channel effectiveness</h4>
              <table className="w-full text-[11.5px]">
                <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
                  <tr><th className="text-left py-1">Channel</th><th className="text-right">Delivered</th><th className="text-right">Open rate</th><th className="text-right">CTR</th></tr>
                </thead>
                <tbody>
                  {roi.channelEngagement.map((c) => (
                    <tr key={c.channel} className="border-t border-line/5">
                      <td className="py-1">{c.channel}</td>
                      <td className="text-right num">{c.delivered}</td>
                      <td className="text-right num">{formatPercent(c.openRate)}</td>
                      <td className="text-right num">{formatPercent(c.clickThroughRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {roi.readDepth.length > 0 && (
            <div className="mt-2">
              <h4 className="text-slate-200 text-[12px] font-semibold mb-1">Read depth</h4>
              <table className="w-full text-[11.5px]">
                <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
                  <tr><th className="text-left py-1">Source</th><th className="text-right">Sessions w/ opens</th><th className="text-right">Median opens/session</th><th className="text-right">P90 opens/session</th></tr>
                </thead>
                <tbody>
                  {roi.readDepth.map((r) => (
                    <tr key={r.source} className="border-t border-line/5">
                      <td className="py-1">{r.source}</td>
                      <td className="text-right num">{r.sessionsWithOpens}</td>
                      <td className="text-right num">{r.medianOpensPerSession}</td>
                      <td className="text-right num">{r.p90OpensPerSession}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Header({ generatedAt, windowDays }: { generatedAt: string | null; windowDays: number }) {
  return (
    <header className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Pilot Analytics</h2>
        <p className="text-slate-400 text-[12px]">
          Module 26 — adoption + delivery engagement + ROI.
          {windowDays > 0 && ` Snapshot ${generatedAt ? `as of ${generatedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}.`}
        </p>
      </div>
    </header>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
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
