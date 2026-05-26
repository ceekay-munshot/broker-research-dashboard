import { useEffect, useMemo, useState } from 'react'
import type { BrokerId, ReportId } from '../domain'
import type { BrokerDetailStockRow, BrokerDetailViewModel } from '../viewModels/brokerDetail'
import { useBrokerDetailViewModel } from '../viewModels/brokerDetail'
import { formatShortDate } from '../viewModels/shared'
import BrokerStockTimeline from './broker/BrokerStockTimeline'

interface Props {
  readonly brokerId: BrokerId | null
  readonly onClose: () => void
  readonly onSelectReport: (id: ReportId) => void
}

export default function BrokerDetailDrawer({ brokerId, onClose, onSelectReport }: Props) {
  useEffect(() => {
    if (!brokerId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Layered-drawer behavior: if a higher overlay (e.g. ReportDrawer
      // opened from a timeline entry) is on top of us, Escape should close
      // it first and leave us open.
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs.length > 1) return
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [brokerId, onClose])

  if (!brokerId) return null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute top-0 right-0 h-full w-full md:w-[760px] lg:w-[880px] bg-ink-950 border-l border-line/5 shadow-2xl flex flex-col">
        <Body brokerId={brokerId} onClose={onClose} onSelectReport={onSelectReport}/>
      </aside>
    </div>
  )
}

function Body({ brokerId, onClose, onSelectReport }: { brokerId: BrokerId; onClose: () => void; onSelectReport: (id: ReportId) => void }) {
  const { data, loading, error } = useBrokerDetailViewModel(brokerId)

  if (loading) return <Message onClose={onClose} tone="loading" text="Loading broker timeline…"/>
  if (error)   return <Message onClose={onClose} tone="error" text={`Error: ${error.message}`}/>
  if (!data)   return <Message onClose={onClose} tone="loading" text="Loading broker timeline…"/>

  return <Content vm={data} onClose={onClose} onSelectReport={onSelectReport}/>
}

function Header({ vm, onClose }: { vm: BrokerDetailViewModel | null; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-line/5">
      <div className="flex items-center gap-2.5 min-w-0">
        {vm && (
          <span
            className="w-7 h-7 rounded-sm flex items-center justify-center text-[10px] font-bold text-ink-950 shrink-0"
            style={{ background: vm.brokerColor ?? '#94a3b8' }}
          >{vm.brokerShortName.slice(0, 3).toUpperCase()}</span>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-slate-100 font-semibold text-[13.5px] truncate">{vm?.brokerName ?? 'Broker'}</span>
          {vm && (
            <span className="text-[10.5px] text-slate-500">
              {vm.stocksCovered} stock{vm.stocksCovered === 1 ? '' : 's'} covered · {vm.noteCount} note{vm.noteCount === 1 ? '' : 's'}
              {vm.coverageSince && <> · since {formatShortDate(vm.coverageSince)} {vm.coverageSince.slice(0, 4)}</>}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-100 w-7 h-7 flex items-center justify-center rounded border border-line/5 hover:border-line/20 transition-colors shrink-0"
        aria-label="Close"
      >✕</button>
    </div>
  )
}

function Message({ onClose, tone, text }: { onClose: () => void; tone: 'loading' | 'error'; text: string }) {
  return (
    <>
      <Header vm={null} onClose={onClose}/>
      <div className="flex-1 flex items-center justify-center text-sm">
        <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
      </div>
    </>
  )
}

function Content({ vm, onClose, onSelectReport }: {
  vm: BrokerDetailViewModel
  onClose: () => void
  onSelectReport: (id: ReportId) => void
}) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(
    vm.stocks[0]?.ticker as unknown as string ?? null,
  )

  // If the broker swaps and the previous selection no longer applies, reset.
  useEffect(() => {
    if (selectedTicker && vm.timelineByTicker.has(selectedTicker)) return
    setSelectedTicker(vm.stocks[0]?.ticker as unknown as string ?? null)
  }, [vm, selectedTicker])

  const entries = useMemo(
    () => selectedTicker ? (vm.timelineByTicker.get(selectedTicker) ?? []) : [],
    [vm, selectedTicker],
  )
  const selectedRow = selectedTicker
    ? vm.stocks.find((s) => (s.ticker as unknown as string) === selectedTicker) ?? null
    : null

  if (vm.stocks.length === 0) {
    return (
      <>
        <Header vm={vm} onClose={onClose}/>
        <div className="flex-1 flex items-center justify-center text-[12.5px] text-slate-500 p-6 text-center">
          No notes from this broker in the loaded window yet.
        </div>
      </>
    )
  }

  return (
    <>
      <Header vm={vm} onClose={onClose}/>
      <div className="flex-1 flex min-h-0">
        <StockList
          stocks={vm.stocks}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
        />
        <div className="flex-1 min-w-0 border-l border-line/5">
          {selectedTicker && (
            <BrokerStockTimeline
              ticker={selectedTicker}
              stockName={selectedRow?.stockName ?? null}
              entries={entries}
              onSelectReport={onSelectReport}
            />
          )}
        </div>
      </div>
    </>
  )
}

function StockList({ stocks, selectedTicker, onSelect }: {
  stocks: readonly BrokerDetailStockRow[]
  selectedTicker: string | null
  onSelect: (ticker: string) => void
}) {
  return (
    <div className="w-[220px] md:w-[260px] shrink-0 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-line/5">
        <span className="section-title">Stocks ({stocks.length})</span>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {stocks.map((s) => {
          const tickerKey = s.ticker as unknown as string
          const selected = tickerKey === selectedTicker
          return (
            <li key={tickerKey}>
              <button
                onClick={() => onSelect(tickerKey)}
                className={`w-full text-left px-4 py-2 flex flex-col gap-0.5 border-l-2 transition-colors ${
                  selected
                    ? 'border-accent bg-line/[0.04]'
                    : 'border-transparent hover:bg-line/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[12px] font-semibold ${selected ? 'text-slate-100' : 'text-slate-200'} truncate`}>
                    {tickerKey}
                  </span>
                  {s.hasRecentMove && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Recent view change"/>
                  )}
                  <span className="ml-auto text-[10px] text-slate-500 num shrink-0">
                    {formatShortDate(s.lastPublishedAt)}
                  </span>
                </div>
                {s.stockName && (
                  <span className="text-[10.5px] text-slate-500 truncate">{s.stockName}</span>
                )}
                <span className="text-[10px] text-slate-600 num">
                  {s.noteCount} note{s.noteCount === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
