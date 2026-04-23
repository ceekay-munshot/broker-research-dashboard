import React, { useMemo, useState } from 'react'
import { ratingColor } from '../../data/sampleData.js'

function mean(nums) { return nums.reduce((a, b) => a + b, 0) / (nums.length || 1) }
function stdev(nums) {
  if (nums.length < 2) return 0
  const m = mean(nums)
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)))
}

function buildStockRow(stock, ratings, brokers) {
  const rows = ratings.filter((r) => r.ticker === stock.ticker)
  const targets = rows.map((r) => r.targetPrice)
  const avgTarget = mean(targets)
  const sd = stdev(targets)
  const byBroker = Object.fromEntries(rows.map((r) => [r.broker, r]))
  // Flag outlier brokers (> 1.25 sigma from mean).
  const outliers = new Set(
    rows
      .filter((r) => sd > 0 && Math.abs(r.targetPrice - avgTarget) / sd > 1.25)
      .map((r) => r.broker),
  )
  return { stock, rows, avgTarget, sd, byBroker, outliers, brokersCovering: brokers.filter((b) => byBroker[b.id]) }
}

function TargetCell({ r, outlier, refPrice }) {
  if (!r) return <td className="px-2 py-2 text-[11.5px] text-slate-600">—</td>
  const delta = r.targetPrice - r.priorTarget
  const upside = ((r.targetPrice / refPrice) - 1) * 100
  return (
    <td className={`px-2 py-2 align-top ${outlier ? 'bg-amber-500/[0.06]' : ''}`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`num text-[12.5px] font-semibold ${outlier ? 'text-amber-300' : 'text-slate-100'}`}>${r.targetPrice.toLocaleString()}</span>
          {delta !== 0 && (
            <span className={`num text-[10px] ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
          {outlier && <span className="chip text-[9px] border border-amber-500/40 text-amber-300">OUT</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10.5px] ${ratingColor[r.rating] || 'text-slate-300'}`}>{r.rating}</span>
          <span className={`num text-[10px] ${upside > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
          </span>
        </div>
        <span className="num text-[9.5px] text-slate-500">{r.updated.slice(5)}</span>
      </div>
    </td>
  )
}

export default function ByStock({ stocks, brokers, brokerRatings, sectors }) {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    return stocks
      .filter((s) => !query
        || s.ticker.toLowerCase().includes(query.toLowerCase())
        || s.name.toLowerCase().includes(query.toLowerCase()))
      .map((s) => buildStockRow(s, brokerRatings, brokers))
  }, [stocks, brokers, brokerRatings, query])

  // Use every broker that appears in any of the filtered stock rows as columns.
  const shownBrokers = useMemo(() => {
    const ids = new Set()
    rows.forEach((r) => r.rows.forEach((row) => ids.add(row.broker)))
    return brokers.filter((b) => ids.has(b.id))
  }, [rows, brokers])

  const sectorName = (id) => sectors.find((s) => s.id === id)?.name || ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Stock</h2>
          <p className="text-slate-400 text-[12px]">Opinions matrix — target prices, ratings and implied upside across the Street. Outliers {`>1.25σ`} highlighted.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tickers…"
            className="bg-white/[0.04] border border-white/5 rounded px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent/40 w-48"
          />
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium sticky left-0 bg-ink-900/70 z-10">Ticker</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium text-right">Spot</th>
              <th className="px-3 py-2 font-medium text-right">Avg target</th>
              <th className="px-3 py-2 font-medium text-right">Spread σ</th>
              {shownBrokers.map((b) => (
                <th key={b.id} className="px-2 py-2 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }}/>
                    <span className="uppercase tracking-wider text-[10.5px]">{b.shortName}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stock, avgTarget, sd, byBroker, outliers }, idx) => {
              const impliedUpside = ((avgTarget / stock.price) - 1) * 100
              return (
                <tr key={stock.ticker} className={`border-b border-white/5 ${idx % 2 ? 'bg-white/[0.01]' : ''}`}>
                  <td className="px-3 py-2 sticky left-0 bg-ink-900/70 z-10">
                    <div className="flex flex-col">
                      <span className="text-slate-100 font-semibold">{stock.ticker}</span>
                      <span className="text-[10.5px] text-slate-500 truncate max-w-[140px]">{stock.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-300 text-[11.5px]">{sectorName(stock.sector)}</td>
                  <td className="px-3 py-2 num text-right text-slate-200">${stock.price.toFixed(2)}</td>
                  <td className="px-3 py-2 num text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-slate-100">${avgTarget.toFixed(0)}</span>
                      <span className={`text-[10px] ${impliedUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{impliedUpside >= 0 ? '+' : ''}{impliedUpside.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 num text-right text-slate-300">±{sd.toFixed(0)}</td>
                  {shownBrokers.map((b) => (
                    <TargetCell key={b.id} r={byBroker[b.id]} outlier={outliers.has(b.id)} refPrice={stock.price}/>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/40"/> Outlier target (&gt;1.25σ from Street average)</div>
        <div className="flex items-center gap-1.5"><span className="text-emerald-400">+Δ</span> target upgrade vs prior</div>
        <div className="flex items-center gap-1.5"><span className="text-rose-400">-Δ</span> target downgrade</div>
      </div>
    </div>
  )
}
