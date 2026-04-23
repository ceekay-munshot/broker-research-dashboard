import IngestionChip from './IngestionChip'

interface HeaderProps {
  readonly lastUpdated: string | null
  readonly orgShortName: string | null
}

function formatStamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toUTCString().replace('GMT', 'UTC')
}

export default function Header({ lastUpdated, orgShortName }: HeaderProps) {
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
          {orgShortName && (
            <span className="chip ml-3 border border-white/10 text-slate-400 bg-white/[0.02]">
              Org · <span className="text-slate-200 ml-1">{orgShortName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          <IngestionChip />
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
