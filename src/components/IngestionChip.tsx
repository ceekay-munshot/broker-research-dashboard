import { useIngestionChipViewModel } from '../viewModels/ingestion'

export default function IngestionChip() {
  const { data, loading } = useIngestionChipViewModel()

  if (loading || !data) {
    return (
      <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500">
        <span className="flex w-1.5 h-1.5 rounded-full bg-slate-500"/>
        <span>Ingestion …</span>
      </div>
    )
  }

  const dotClass = data.isHealthy
    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
    : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'

  return (
    <div className="hidden md:flex items-center gap-3 text-[11px]">
      <div className="flex items-center gap-2">
        <span className={`flex w-1.5 h-1.5 rounded-full ${dotClass}`}/>
        <span className="text-slate-400">Ingestion</span>
      </div>
      <div className="flex items-center gap-2 num text-slate-300">
        <span><span className="text-slate-500">Q</span> {data.queued}</span>
        <span className="text-slate-700">·</span>
        <span><span className="text-slate-500">P</span> {data.processing}</span>
        <span className="text-slate-700">·</span>
        <span className={data.failedLast24h > 0 ? 'text-rose-400' : ''}>
          <span className="text-slate-500">F</span> {data.failedLast24h}
        </span>
      </div>
    </div>
  )
}
