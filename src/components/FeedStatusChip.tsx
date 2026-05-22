import { useEffect, useState } from 'react'
import { getServerOutputAdapter } from '../adapters'
import {
  buildFeedStatusViewModel, type FeedStatusTone,
} from '../viewModels/feedStatus'
import { TONE_TEXT_CLASS, getFeedStatusTone } from '../lib/semanticColor'

// Dot fill keeps its own literal map: the glow shadow is intrinsic to the
// "live pulse" affordance and cannot be expressed by the generic tone classes.
// The base hues still mirror the semantic tones (green / amber / red / grey).
const TONE_DOT: Record<FeedStatusTone, string> = {
  live:    'bg-emerald-400 shadow-[0_0_8px_#34d399]',
  idle:    'bg-slate-400',
  delayed: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
  error:   'bg-rose-400 shadow-[0_0_8px_#fb7185]',
  waiting: 'bg-slate-500',
}

// Text colour is projected straight from the central semantic-tone system.
const TONE_TEXT: Record<FeedStatusTone, string> = {
  live:    TONE_TEXT_CLASS[getFeedStatusTone('live')],
  idle:    TONE_TEXT_CLASS[getFeedStatusTone('idle')],
  delayed: TONE_TEXT_CLASS[getFeedStatusTone('delayed')],
  error:   TONE_TEXT_CLASS[getFeedStatusTone('error')],
  waiting: TONE_TEXT_CLASS[getFeedStatusTone('waiting')],
}

function relativeTime(iso: string | null, fromMs: number = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const ms = fromMs - t
  if (ms < 60_000)     return 'just now'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function FeedStatusChip() {
  const adapter = getServerOutputAdapter()
  // Subscribe to payload changes so the chip updates when the server delivers
  // fresh output. `version` is just a re-render trigger.
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!adapter) return
    return adapter.subscribe(() => setVersion((v) => v + 1))
  }, [adapter])

  const payload = adapter?.getFeedStatus() ?? null
  const vm = buildFeedStatusViewModel(payload)

  const tooltipLines = [
    `Status: ${vm.label}`,
    vm.itemsToday != null ? `Items received today: ${vm.itemsToday}` : 'Items received today: —',
    `Last extraction received: ${relativeTime(vm.lastExtractionIso)}`,
    `Last successful server sync: ${relativeTime(vm.lastSyncIso)}`,
    vm.errorNote ? `\n${vm.errorNote}` : '',
  ].filter(Boolean).join('\n')

  return (
    <div
      className="hidden md:flex items-center gap-2 text-[11px]"
      title={tooltipLines}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[vm.tone]}`}/>
      <span className={TONE_TEXT[vm.tone]}>{vm.label}</span>
      {vm.tone === 'live' && vm.itemsToday != null && (
        <>
          <span className="text-slate-700">·</span>
          <span className="text-slate-300 num">{vm.itemsToday} today</span>
        </>
      )}
    </div>
  )
}
