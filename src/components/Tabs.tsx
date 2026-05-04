import { TABS, type TabId } from '../app/tabs'
import { useCurrentUserRole } from '../hooks/useCurrentUserRole'

interface TabsProps {
  readonly active: TabId
  readonly setActive: (id: TabId) => void
}

const OPERATOR_TABS = new Set<TabId>(['usage', 'controlPlane'])

export default function Tabs({ active, setActive }: TabsProps) {
  const role = useCurrentUserRole()
  const canSeeOperator = role === 'operator' || role === 'admin'
  const visibleTabs = TABS.filter((t) => !OPERATOR_TABS.has(t.id) || canSeeOperator)
  return (
    <div className="flex items-end border-b border-line/5 bg-ink-950/40">
      <div className="flex">
        {visibleTabs.map((t) => {
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`group relative px-4 py-3 text-left ${isActive ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <div className="text-[13px] font-medium">{t.label}</div>
              <div className={`text-[10.5px] uppercase tracking-widest ${isActive ? 'text-accent/80' : 'text-slate-500'}`}>{t.hint}</div>
              <div className={`absolute left-0 right-0 bottom-0 h-[2px] ${isActive ? 'bg-accent' : 'bg-transparent'}`}/>
            </button>
          )
        })}
      </div>
      <div className="ml-auto px-4 py-3 text-[11px] text-slate-500 flex items-center gap-3">
        <span>Density</span>
        <div className="flex gap-1">
          <button className="kbd">▭</button>
          <button className="kbd">▤</button>
        </div>
      </div>
    </div>
  )
}
