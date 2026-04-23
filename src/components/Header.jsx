import React from 'react'

function formatStamp(iso) {
  const d = new Date(iso)
  const date = d.toUTCString().replace('GMT', 'UTC')
  return date
}

export default function Header({ lastUpdated }) {
  return (
    <header className="border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-accent to-accent-soft flex items-center justify-center shadow-panel">
            <span className="text-ink-950 font-bold text-[13px] leading-none">B</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-200 text-sm font-semibold tracking-wide">Broker Research OS</span>
            <span className="text-slate-500 text-[11px] uppercase tracking-[0.18em]">Research Desk</span>
          </div>
          <span className="mx-2 text-slate-700">/</span>
          <span className="text-slate-300 text-sm">Email Intelligence Dashboard</span>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-2 text-[11px]">
            <span className="flex w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"/>
            <span className="text-slate-400">Ingestion live</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="section-title">Last updated</span>
            <span className="num text-slate-200 text-[12px]">{formatStamp(lastUpdated)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="kbd">⌘</span><span className="kbd">K</span>
            <span className="text-[11px] text-slate-500 ml-1">search</span>
          </div>
        </div>
      </div>
    </header>
  )
}
