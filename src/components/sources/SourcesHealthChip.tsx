// Compact header chip showing the overall source-health rollup.
// Click → switch to the Sources tab. Hover → full per-source tooltip.

import { useSourcesHealth } from '../../hooks/useSourcesHealth'
import {
  buildSourcesChipViewModel, SOURCE_STATUS_DOT,
} from '../../viewModels/sources'

interface SourcesHealthChipProps {
  readonly onOpen: () => void
}

export default function SourcesHealthChip({ onOpen }: SourcesHealthChipProps) {
  const { data } = useSourcesHealth()
  const vm = buildSourcesChipViewModel(data ?? null)
  if (!vm) return null
  const dot = SOURCE_STATUS_DOT[vm.overall]
  return (
    <button
      onClick={onOpen}
      title={vm.tooltip}
      className="chip border border-line/10 text-[11px] text-slate-300 hover:text-accent inline-flex items-center gap-1.5 cursor-pointer"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>
      <span>{vm.label}</span>
      <span className="text-slate-500 num">
        {vm.counts.healthy}/{vm.counts.total}
      </span>
    </button>
  )
}
