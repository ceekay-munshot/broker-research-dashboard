import React from 'react'
import { stanceColor } from '../../data/sampleData.js'

function stanceDistribution(brokerId, reports) {
  const theirs = reports.filter((r) => r.broker === brokerId)
  const total = theirs.length || 1
  const count = { bullish: 0, neutral: 0, bearish: 0 }
  theirs.forEach((r) => { count[r.stance] = (count[r.stance] || 0) + 1 })
  return { count, total, reports: theirs }
}

function topThemes(brokerReports) {
  const tally = {}
  brokerReports.forEach((r) => r.themes.forEach((t) => { tally[t] = (tally[t] || 0) + 1 }))
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([theme, n]) => ({ theme, n }))
}

function StanceBar({ count, total }) {
  const pct = (v) => (100 * v / total).toFixed(0)
  return (
    <div className="flex w-full h-1.5 rounded overflow-hidden bg-white/5">
      <div className="bg-emerald-500/80" style={{ width: `${pct(count.bullish || 0)}%` }} title={`Bullish ${count.bullish || 0}`}/>
      <div className="bg-slate-500/60"   style={{ width: `${pct(count.neutral || 0)}%` }} title={`Neutral ${count.neutral || 0}`}/>
      <div className="bg-rose-500/80"    style={{ width: `${pct(count.bearish || 0)}%` }} title={`Bearish ${count.bearish || 0}`}/>
    </div>
  )
}

function BrokerCard({ broker, reports }) {
  const { count, total, reports: theirs } = stanceDistribution(broker.id, reports)
  const themes = topThemes(theirs)
  const latest = theirs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)

  return (
    <div className="panel panel-hover p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm flex items-center justify-center text-[11px] font-bold text-ink-950" style={{ background: broker.color }}>
            {broker.shortName.slice(0, 3).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-slate-100 text-[13px] font-semibold">{broker.name}</span>
            <span className="text-[10.5px] uppercase tracking-widest text-slate-500">{total} active notes · {themes.length} themes</span>
          </div>
        </div>
        <button className="chip bg-white/5 border border-white/5 text-slate-300 hover:text-slate-100">Open desk</button>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-slate-500 w-14">Stance</span>
        <StanceBar count={count} total={total}/>
        <div className="flex gap-2 num w-28 justify-end">
          <span className="text-emerald-400">{count.bullish || 0}</span>
          <span className="text-slate-400">{count.neutral || 0}</span>
          <span className="text-rose-400">{count.bearish || 0}</span>
        </div>
      </div>

      <div>
        <div className="section-title mb-1.5">Latest notes</div>
        <ul className="flex flex-col gap-1.5">
          {latest.length === 0 && <li className="text-[11.5px] text-slate-500">No recent notes in the selected range.</li>}
          {latest.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-[12px] leading-tight">
              <span className="num text-[10.5px] text-slate-500 w-16 pt-0.5">{r.date.slice(5)}</span>
              <span className={`chip border ${r.stance === 'bullish' ? 'border-emerald-500/30 text-emerald-400' : r.stance === 'bearish' ? 'border-rose-500/30 text-rose-400' : 'border-slate-500/30 text-slate-300'}`}>{r.ticker}</span>
              <span className="text-slate-200 flex-1 truncate" title={r.headline}>{r.headline}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="section-title mb-1.5">Top themes</div>
        <div className="flex flex-wrap gap-1.5">
          {themes.length === 0 && <span className="text-[11.5px] text-slate-500">No themes identified.</span>}
          {themes.map((t) => (
            <span key={t.theme} className="chip bg-white/[0.04] border border-white/5 text-slate-300">
              {t.theme}<span className="text-slate-500 num">·{t.n}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ByBroker({ brokers, reports }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Broker</h2>
          <p className="text-slate-400 text-[12px]">Stance mix, latest notes and top themes per research house.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="section-title">Sort</span>
          <select className="bg-white/[0.04] border border-white/5 rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-accent/40">
            <option>Recency</option>
            <option>Note volume</option>
            <option>Bullish tilt</option>
            <option>Divergence from Street</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {brokers.map((b) => <BrokerCard key={b.id} broker={b} reports={reports}/>)}
      </div>
    </div>
  )
}
