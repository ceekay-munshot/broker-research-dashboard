import React from 'react'
import type { Broker, Sector, Stock, BrokerId, StockTicker, Rating } from '../domain'
import type { FiltersState, DateRangeKey } from '../app/filters'
import { DATE_RANGE_KEYS } from '../app/filters'

interface SidebarProps {
  readonly brokers: readonly Broker[]
  readonly sectors: readonly Sector[]
  readonly stocks: readonly Stock[]
  readonly filters: FiltersState
  readonly setFilters: React.Dispatch<React.SetStateAction<FiltersState>>
}

const RATINGS: readonly Rating[] = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell']

function FilterSection({ title, onReset, children }: { title: string; onReset?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {onReset && (
          <button
            onClick={onReset}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >reset</button>
        )}
      </div>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded border transition-colors
        ${active
          ? 'bg-accent/15 border-accent/40 text-accent'
          : 'bg-line/[0.02] border-line/5 text-slate-300 hover:bg-line/[0.05] hover:border-line/10'}`}
    >
      {children}
    </button>
  )
}

function Checkbox({ label, checked, onChange, swatch }: {
  label: string; checked: boolean; onChange: () => void; swatch?: string | null;
}) {
  return (
    <label className="flex items-center gap-2 group cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3 w-3 rounded-sm accent-accent bg-transparent border border-line/20"
      />
      {swatch && <span className="w-1.5 h-1.5 rounded-full" style={{ background: swatch }}/>}
      <span className="text-[12px] text-slate-300 group-hover:text-slate-100 flex-1 truncate">{label}</span>
    </label>
  )
}

function toggle<K extends keyof FiltersState>(
  setFilters: SidebarProps['setFilters'],
  key: K,
  value: FiltersState[K] extends readonly (infer U)[] ? U : never,
) {
  setFilters((prev) => {
    const arr = prev[key] as readonly unknown[]
    const next = arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value]
    return { ...prev, [key]: next } as FiltersState
  })
}

export default function Sidebar({ brokers, stocks, filters, setFilters }: SidebarProps) {
  const [brokerQuery, setBrokerQuery] = React.useState('')
  const brokerSearch = brokerQuery.trim().toLowerCase()
  const visibleBrokers = brokerSearch
    ? brokers.filter((b) => b.name.toLowerCase().includes(brokerSearch))
    : brokers
  return (
    <aside className="w-60 shrink-0 border-r border-line/5 bg-ink-950/40 h-full overflow-y-auto">
      <div className="p-4 flex flex-col gap-6">
        <div>
          <div className="section-title mb-2">Filters</div>
          <div className="text-[11px] text-slate-500">Narrow the research feed to the setups you care about.</div>
        </div>

        <FilterSection title="Date range">
          <div className="flex flex-wrap gap-1.5">
            {DATE_RANGE_KEYS.map((r) => (
              <Pill
                key={r}
                active={filters.dateRange === r}
                onClick={() => setFilters((prev) => ({ ...prev, dateRange: r as DateRangeKey }))}
              >{r}</Pill>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Broker" onReset={() => setFilters((p) => ({ ...p, brokerIds: [] }))}>
          <input
            value={brokerQuery}
            onChange={(e) => setBrokerQuery(e.target.value)}
            placeholder="Broker name…"
            className="w-full bg-line/[0.03] border border-line/5 rounded px-2 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent/40"
          />
          <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
            {visibleBrokers.map((b) => (
              <Checkbox
                key={b.id}
                label={b.name}
                swatch={b.brandColor}
                checked={filters.brokerIds.includes(b.id)}
                onChange={() => toggle<'brokerIds'>(setFilters, 'brokerIds', b.id as BrokerId)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Stock" onReset={() => setFilters((p) => ({ ...p, tickers: [] }))}>
          <input
            placeholder="Ticker or name…"
            className="w-full bg-line/[0.03] border border-line/5 rounded px-2 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent/40"
          />
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
            {stocks.slice(0, 10).map((s) => (
              <Checkbox
                key={s.ticker}
                label={`${s.ticker} · ${s.name}`}
                checked={filters.tickers.includes(s.ticker)}
                onChange={() => toggle<'tickers'>(setFilters, 'tickers', s.ticker as StockTicker)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Rating / stance" onReset={() => setFilters((p) => ({ ...p, ratings: [] }))}>
          <div className="flex flex-wrap gap-1.5">
            {RATINGS.map((r) => (
              <Pill
                key={r}
                active={filters.ratings.includes(r)}
                onClick={() => toggle<'ratings'>(setFilters, 'ratings', r)}
              >{r}</Pill>
            ))}
          </div>
        </FilterSection>
      </div>
    </aside>
  )
}
