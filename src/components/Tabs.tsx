import { TABS, type TabId } from '../app/tabs'

interface TabsProps {
  readonly active: TabId
  readonly setActive: (id: TabId) => void
}

export default function Tabs({ active, setActive }: TabsProps) {
  return (
    <div className="flex items-end border-b border-white/5 bg-ink-950/40">
      <div className="flex">
        {TABS.map((t) => {
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
