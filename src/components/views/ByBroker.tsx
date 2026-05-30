import type { BrokerId, ReportId } from '../../domain'
import type { FiltersState } from '../../app/filters'
import type { BrokerCardViewModel, BrokerCall } from '../../viewModels/byBroker'
import { useByBrokerViewModel } from '../../viewModels/byBroker'
import { RATING_TEXT_COLOR, formatPrice, formatShortDate } from '../../viewModels/shared'
import { BROKER_GLYPH_CLASS } from '../../lib/semanticColor'

interface ByBrokerProps {
  readonly filters: FiltersState
  readonly onSelectReport: (id: ReportId) => void
  readonly onSelectBroker: (id: BrokerId) => void
}

export default function ByBroker({ filters, onSelectBroker }: ByBrokerProps) {
  const { data, loading, error } = useByBrokerViewModel(filters)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading by-broker view…"/>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">By Broker / Research House</h2>
          <p className="text-slate-400 text-[12px]">Each broker's current call on every stock. Open a card for the full history.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {data.brokers.map((b) => (
          <BrokerCard key={b.brokerId} b={b} onOpenBroker={onSelectBroker}/>
        ))}
      </div>
    </div>
  )
}

function BrokerCard({ b, onOpenBroker }: {
  b: BrokerCardViewModel
  onOpenBroker: (id: BrokerId) => void
}) {
  const open = () => onOpenBroker(b.brokerId)
  return (
    <div
      className="panel panel-hover p-4 flex flex-col gap-3 cursor-pointer focus:outline-none focus:border-accent/40"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
    >
      {/* Header — who, and how much they cover */}
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-sm flex items-center justify-center text-[11px] font-bold ${BROKER_GLYPH_CLASS}`}>
          {b.shortName.slice(0, 3).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-slate-100 text-[13px] font-semibold">{b.name}</span>
          <span className="text-[10.5px] uppercase tracking-widest text-slate-500">
            {b.calls.length} {b.calls.length === 1 ? 'call' : 'calls'}
            {b.latestReportAt && <> · latest {formatShortDate(b.latestReportAt)}</>}
          </span>
        </div>
      </div>

      {/* The calls — what's the call, on what stock */}
      <ul className="flex flex-col">
        {b.calls.length === 0 ? (
          <li className="text-[11.5px] text-slate-500 py-1">No calls in the selected range.</li>
        ) : (
          b.calls.map((c) => <CallRow key={c.ticker} call={c}/>)
        )}
      </ul>

      <div className="flex items-center justify-end text-[11px] pt-1 border-t border-line/5">
        <span className="text-accent">View timeline →</span>
      </div>
    </div>
  )
}

/** One row: ticker + the broker's current call (rating), a NEW tag in front of
 *  the call when it's freshly initiated or changed, and the short target. The
 *  whole card opens the broker drawer, so the row itself isn't separately
 *  clickable — the timeline there carries the per-note detail. */
function CallRow({ call }: { call: BrokerCall }) {
  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-line/5 last:border-0">
      <span className="num text-[12px] font-semibold text-slate-100 w-24 shrink-0 truncate" title={call.stockName ?? undefined}>
        {call.ticker}
      </span>
      {call.isNew && (
        <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
          New
        </span>
      )}
      {call.rating ? (
        <span className={`text-[12.5px] font-semibold ${RATING_TEXT_COLOR[call.rating]}`}>{call.rating}</span>
      ) : (
        <span className="text-[12px] text-slate-500">No rating</span>
      )}
      {call.targetPrice != null && (
        <span className="ml-auto num text-[11.5px] text-slate-400 shrink-0">
          TP {formatPrice(call.targetPrice, call.targetCurrency, 0)}
        </span>
      )}
    </li>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
