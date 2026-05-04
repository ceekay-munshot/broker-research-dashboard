import { TABS, type TabId } from '../app/tabs'

interface TabsProps {
  readonly active: TabId
  readonly setActive: (id: TabId) => void
}

// Customer-facing nav. Only the six core workflows are visible here;
// admin/operator surfaces live in the AdminMenu in the header.
//
// Premium, single-line labels with no hint subtext. The active tab is
// the only colored element; everything else is neutral. The accent
// underline marks the active tab without competing for attention.
export default function Tabs({ active, setActive }: TabsProps) {
  // The "active" tab from the parent may be a hidden admin tab; in that
  // case none of the visible buttons are highlighted. That's fine — the
  // admin menu already shows which admin route is open.
  return (
    <div className="flex items-end border-b border-line/5 bg-ink-950/40">
      <div className="flex">
        {TABS.map((t) => {
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`group relative px-4 py-3 text-left whitespace-nowrap ${isActive ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <div className="text-[13px] font-medium">{t.label}</div>
              <div className={`absolute left-0 right-0 bottom-0 h-[2px] ${isActive ? 'bg-accent' : 'bg-transparent'}`}/>
            </button>
          )
        })}
      </div>
    </div>
  )
}
