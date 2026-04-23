import React from 'react'

const DATE_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'Custom']

function FilterSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        <button className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">reset</button>
      </div>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded border transition-colors
        ${active
          ? 'bg-accent/15 border-accent/40 text-accent'
          : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05] hover:border-white/10'}`}
    >
      {children}
    </button>
  )
}

function Checkbox({ label, count, checked, onChange, swatch }) {
  return (
    <label className="flex items-center gap-2 group cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3 w-3 rounded-sm accent-accent bg-transparent border border-white/20"
      />
      {swatch && <span className="w-1.5 h-1.5 rounded-full" style={{ background: swatch }}/>}
      <span className="text-[12px] text-slate-300 group-hover:text-slate-100 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="num text-[10px] text-slate-500">{count}</span>}
    </label>
  )
}

export default function Sidebar({
  brokers, sectors, stocks,
  filters, setFilters,
}) {
  const toggle = (key, value) => {
    setFilters((prev) => {
      const set = new Set(prev[key])
      if (set.has(value)) set.delete(value); else set.add(value)
      return { ...prev, [key]: Array.from(set) }
    })
  }

  return (
    <aside className="w-60 shrink-0 border-r border-white/5 bg-ink-950/40 h-full overflow-y-auto">
      <div className="p-4 flex flex-col gap-6">
        <div>
          <div className="section-title mb-2">Filters</div>
          <div className="text-[11px] text-slate-500">Narrow the research feed to the setups you care about.</div>
        </div>

        <FilterSection title="Date range">
          <div className="flex flex-wrap gap-1.5">
            {DATE_RANGES.map((r) => (
              <Pill key={r} active={filters.dateRange === r} onClick={() => setFilters({ ...filters, dateRange: r })}>{r}</Pill>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Broker">
          <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
            {brokers.map((b) => (
              <Checkbox
                key={b.id}
                label={b.name}
                swatch={b.color}
                checked={filters.brokers.includes(b.id)}
                onChange={() => toggle('brokers', b.id)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Stock">
          <input
            placeholder="Ticker or name…"
            className="w-full bg-white/[0.03] border border-white/5 rounded px-2 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent/40"
          />
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
            {stocks.slice(0, 8).map((s) => (
              <Checkbox
                key={s.ticker}
                label={`${s.ticker} · ${s.name}`}
                checked={filters.tickers.includes(s.ticker)}
                onChange={() => toggle('tickers', s.ticker)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Sector">
          <div className="flex flex-col gap-1.5">
            {sectors.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                count={s.reports}
                checked={filters.sectors.includes(s.id)}
                onChange={() => toggle('sectors', s.id)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Rating / stance">
          <div className="flex flex-wrap gap-1.5">
            {['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'].map((r) => (
              <Pill
                key={r}
                active={filters.ratings.includes(r)}
                onClick={() => toggle('ratings', r)}
              >{r}</Pill>
            ))}
          </div>
        </FilterSection>

        <div className="pt-2 mt-auto border-t border-white/5 text-[11px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>Saved views</span>
            <button className="text-accent hover:text-accent-soft transition-colors">＋</button>
          </div>
          <ul className="mt-2 space-y-1">
            <li className="truncate text-slate-400">AI supply chain — bull/bear</li>
            <li className="truncate text-slate-400">Energy commodity deck shifts</li>
            <li className="truncate text-slate-400">Earnings week — target changes</li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
