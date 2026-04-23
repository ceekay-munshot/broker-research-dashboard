import React from 'react'

function formatNumber(n) {
  return n.toLocaleString('en-US')
}

function Delta({ value, window }) {
  if (value === 0) return <span className="text-slate-500 text-[11px]">flat</span>
  const positive = value > 0
  return (
    <span className={`flex items-center gap-1 text-[11px] num ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
      <span>{positive ? '▲' : '▼'}</span>
      <span>{positive ? '+' : ''}{value}</span>
      <span className="text-slate-500 ml-1">{window}</span>
    </span>
  )
}

function Sparkline({ trend = 'up' }) {
  // Hand-tuned SVG paths for look-and-feel, not data-driven yet.
  const paths = {
    up:   'M0 22 L10 18 L20 20 L30 14 L40 16 L50 10 L60 12 L70 6 L80 8',
    flat: 'M0 14 L10 15 L20 13 L30 14 L40 15 L50 13 L60 14 L70 13 L80 14',
    down: 'M0 6 L10 10 L20 9 L30 14 L40 13 L50 17 L60 16 L70 20 L80 22',
    mix:  'M0 18 L10 14 L20 16 L30 11 L40 15 L50 9  L60 14 L70 7  L80 12',
  }
  const color = trend === 'down' ? '#f87171' : trend === 'flat' ? '#94a3b8' : '#d4af37'
  return (
    <svg viewBox="0 0 80 28" className="w-20 h-7 opacity-80">
      <path d={paths[trend]} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Card({ label, value, delta, trend, hint }) {
  return (
    <div className="panel panel-hover p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <div className="section-title">{label}</div>
        <Sparkline trend={trend}/>
      </div>
      <div className="flex items-end justify-between">
        <div className="num text-[28px] leading-none font-semibold text-slate-100 tracking-tight">
          {formatNumber(value)}
        </div>
        <Delta value={delta.value} window={delta.window}/>
      </div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  )
}

export default function KpiCards({ kpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card label="Brokers tracked"   value={kpis.brokersTracked}   delta={kpis.deltas.brokersTracked}   trend="up"  hint="Sell-side + independent research"/>
      <Card label="Reports ingested"  value={kpis.reportsIngested}  delta={kpis.deltas.reportsIngested}  trend="up"  hint="From monitored inboxes & terminals"/>
      <Card label="Stocks covered"    value={kpis.stocksCovered}    delta={kpis.deltas.stocksCovered}    trend="mix" hint="Unique tickers with ≥1 active rating"/>
      <Card label="Divergence flags"  value={kpis.divergenceFlags}  delta={kpis.deltas.divergenceFlags}  trend="up"  hint="Spread ≥ 25% between Street highs/lows"/>
    </div>
  )
}
