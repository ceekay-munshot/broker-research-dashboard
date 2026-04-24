import type {
  WorklogFiltersState, WorklogDateWindow, WorklogGrouping, PriorityBucket, WorklogOrigin,
} from '../../viewModels/worklog'

interface WorklogFiltersProps {
  readonly filters: WorklogFiltersState
  readonly setFilters: (next: WorklogFiltersState) => void
  readonly brokerCount: number
  readonly tickerCount: number
}

const DATE_WINDOWS: readonly { key: WorklogDateWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last3', label: '3d' },
  { key: 'last7', label: '7d' },
  { key: 'all',   label: 'All' },
]
const GROUPINGS: readonly { key: WorklogGrouping; label: string }[] = [
  { key: 'chronological', label: 'Chronological' },
  { key: 'priority',      label: 'Priority' },
  { key: 'broker',        label: 'Broker' },
  { key: 'stock',         label: 'Stock' },
]
const BUCKETS: readonly { key: PriorityBucket; label: string }[] = [
  { key: 'high',   label: 'High' },
  { key: 'medium', label: 'Med' },
  { key: 'low',    label: 'Low' },
]
const ORIGINS: readonly { key: WorklogOrigin; label: string }[] = [
  { key: 'direct_attachment', label: 'PDF' },
  { key: 'direct_body',       label: 'Body' },
  { key: 'digest_split',      label: 'Digest' },
]

export default function WorklogFilters({ filters, setFilters }: WorklogFiltersProps) {
  const togglePriority = (b: PriorityBucket) => {
    const has = filters.priorityBuckets.includes(b)
    setFilters({ ...filters, priorityBuckets: has ? filters.priorityBuckets.filter((x) => x !== b) : [...filters.priorityBuckets, b] })
  }
  const toggleOrigin = (o: WorklogOrigin) => {
    const has = filters.origins.includes(o)
    setFilters({ ...filters, origins: has ? filters.origins.filter((x) => x !== o) : [...filters.origins, o] })
  }
  const toggleFlag = (key: 'hasTargetChange' | 'hasDivergence' | 'hasEvidence') => {
    setFilters({ ...filters, [key]: !filters[key] })
  }

  return (
    <div className="panel p-3 flex flex-wrap items-center gap-2 text-[11.5px]">
      {/* Date window */}
      <FilterSection label="Window">
        {DATE_WINDOWS.map((w) => (
          <Chip key={w.key} active={filters.dateWindow === w.key} onClick={() => setFilters({ ...filters, dateWindow: w.key })}>
            {w.label}
          </Chip>
        ))}
      </FilterSection>

      <Divider/>

      {/* Grouping */}
      <FilterSection label="Group">
        {GROUPINGS.map((g) => (
          <Chip key={g.key} active={filters.grouping === g.key} onClick={() => setFilters({ ...filters, grouping: g.key })}>
            {g.label}
          </Chip>
        ))}
      </FilterSection>

      <Divider/>

      {/* Priority buckets */}
      <FilterSection label="Priority">
        {BUCKETS.map((b) => (
          <Chip key={b.key} active={filters.priorityBuckets.includes(b.key)} onClick={() => togglePriority(b.key)} tone={b.key}>
            {b.label}
          </Chip>
        ))}
      </FilterSection>

      <Divider/>

      {/* Origin */}
      <FilterSection label="Origin">
        {ORIGINS.map((o) => (
          <Chip key={o.key} active={filters.origins.includes(o.key)} onClick={() => toggleOrigin(o.key)}>
            {o.label}
          </Chip>
        ))}
      </FilterSection>

      <Divider/>

      {/* Signal flags */}
      <FilterSection label="Signal">
        <Chip active={filters.hasTargetChange} onClick={() => toggleFlag('hasTargetChange')}>Target Δ</Chip>
        <Chip active={filters.hasDivergence} onClick={() => toggleFlag('hasDivergence')}>Divergence</Chip>
        <Chip active={filters.hasEvidence} onClick={() => toggleFlag('hasEvidence')}>Evidence</Chip>
      </FilterSection>

      <div className="ml-auto">
        <button
          onClick={() => setFilters({
            ...filters,
            brokerIds: [], tickers: [], sectorIds: [], reportTypes: [],
            stances: [], ratings: [], priorityBuckets: [], origins: [],
            hasTargetChange: false, hasDivergence: false, hasEvidence: false,
          })}
          className="text-slate-500 hover:text-slate-300 text-[11px]"
        >
          Reset filters
        </button>
      </div>
    </div>
  )
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="section-title mr-1">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  )
}

function Divider() { return <span className="w-px h-5 bg-line/10 mx-1"/> }

function Chip({
  children, active, onClick, tone,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  tone?: PriorityBucket
}) {
  const base = 'px-2 py-0.5 rounded-sm border text-[11px] transition-colors select-none'
  const activeTone =
    tone === 'high'   ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
    : tone === 'medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
    : tone === 'low'   ? 'bg-slate-500/15 border-slate-500/30 text-slate-200'
    : 'bg-accent/15 border-accent/40 text-accent'
  const cls = active ? activeTone : 'bg-transparent border-line/10 text-slate-400 hover:text-slate-200 hover:border-line/20'
  return <button onClick={onClick} className={`${base} ${cls}`}>{children}</button>
}
