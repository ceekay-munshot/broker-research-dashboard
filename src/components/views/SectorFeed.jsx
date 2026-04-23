import React from 'react'
import { stanceColor } from '../../data/sampleData.js'

function SectorTile({ sector, reports, brokers, stocks }) {
  const sectorStocks = new Set(stocks.filter((s) => s.sector === sector.id).map((s) => s.ticker))
  const relevant = reports
    .filter((r) => sectorStocks.has(r.ticker))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
  const sentimentPct = Math.round((sector.sentiment + 1) * 50)
  const positive = sector.sentiment >= 0
  const brokerName = (id) => brokers.find((b) => b.id === id)?.shortName || id.toUpperCase()

  return (
    <article className="panel p-4 flex flex-col gap-3">
      <header className="flex items-start justify-between">
        <div>
          <div className="section-title">Sector</div>
          <h3 className="text-slate-100 text-[14px] font-semibold">{sector.name}</h3>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10.5px] uppercase tracking-widest text-slate-500">Sentiment</span>
          <span className={`num text-[13px] font-semibold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {positive ? '+' : ''}{(sector.sentiment * 100).toFixed(0)}
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3 text-[11px]">
        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full ${positive ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`}
            style={{ width: `${sentimentPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Reports</span>
        <span className="num text-slate-200">{sector.reports.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Flagged divergences</span>
        <span className="num text-amber-400">{sector.flagged}</span>
      </div>

      <div>
        <div className="section-title mb-1.5">Broker intelligence flow</div>
        <ul className="flex flex-col gap-1.5">
          {relevant.length === 0 && <li className="text-[11.5px] text-slate-500">No recent notes.</li>}
          {relevant.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-[11.5px] leading-tight">
              <span className="num text-[10px] text-slate-500 w-12 pt-0.5">{r.date.slice(5)}</span>
              <span className="chip border border-white/10 text-slate-200 shrink-0">{r.ticker}</span>
              <span className="text-slate-400 shrink-0">{brokerName(r.broker)}</span>
              <span className={`flex-1 truncate ${stanceColor[r.stance]}`} title={r.headline}>{r.headline}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export default function SectorFeed({ sectors, reports, brokers, stocks }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">Sector Feed</h2>
          <p className="text-slate-400 text-[12px]">Rolling broker intelligence aggregated into sectors. Sentiment score is volume-weighted stance across all notes in the range.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="section-title">View</span>
          <div className="flex gap-1">
            <button className="chip border border-accent/40 text-accent bg-accent/10">Tiles</button>
            <button className="chip border border-white/5 text-slate-300">Timeline</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sectors.map((s) => (
          <SectorTile
            key={s.id}
            sector={s}
            reports={reports}
            brokers={brokers}
            stocks={stocks}
          />
        ))}
      </div>
    </div>
  )
}
