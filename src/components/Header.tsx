import FeedStatusChip from './FeedStatusChip'
import ThemeToggle from './ThemeToggle'
import DataSourceToggle from './DataSourceToggle'
import AdminMenu from './AdminMenu'
import munshotLogo from '../assets/munshot-logo.png'
import type { TabId } from '../app/tabs'

interface HeaderProps {
  readonly lastUpdated: string | null
  readonly orgShortName: string | null
  readonly activeTab: TabId
  readonly setActiveTab: (id: TabId) => void
}

function formatStamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toUTCString().replace('GMT', 'UTC')
}

export default function Header({ lastUpdated, orgShortName, activeTab, setActiveTab }: HeaderProps) {
  return (
    <header className="border-b border-line/5 bg-ink-950/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-sm overflow-hidden shadow-panel">
            <img src={munshotLogo} alt="Munshot" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-200 text-sm font-semibold tracking-wide">Munshot Broker Research OS</span>
            <span className="text-slate-500 text-[11px] uppercase tracking-[0.18em]">Research Desk</span>
          </div>
          {orgShortName && (
            <span className="chip ml-3 border border-line/10 text-slate-400 bg-line/[0.02]">
              Org · <span className="text-slate-200 ml-1">{orgShortName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          <FeedStatusChip />
          <div className="flex flex-col items-end">
            <span className="section-title">Last updated</span>
            <span className="num text-slate-200 text-[12px]">{formatStamp(lastUpdated)}</span>
          </div>
          <DataSourceToggle/>
          <AdminMenu active={activeTab} setActive={setActiveTab}/>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
