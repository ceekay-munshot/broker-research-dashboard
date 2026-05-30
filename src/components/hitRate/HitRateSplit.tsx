// Hit Rate — a leaderboard-first split view. Left: analysts ranked by how
// often their calls are right (real data, works on the live feed). Right:
// the selected analyst's calls in a simple table — date, call, target, the
// gain since the call, and whether the target has been met.
//
// The accuracy figures come from the calibration snapshot. "Target met" uses
// the current price vs the call's target (live-capable); the gain-since-call
// column needs price history, so it's populated from the sample series in demo
// mode and shows "—" on a live feed until a price-history source is connected.

import { useEffect, useMemo, useState } from 'react'
import type { BrokerId, ReportId, StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useHitRateLeaderboard } from '../../hooks/useHitRateLeaderboard'
import AnalystLeaderboard from './AnalystLeaderboard'
import AnalystDetail from './AnalystDetail'

interface Props {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
  readonly onSelectReport: (id: ReportId) => void
}

export default function HitRateSplit({ filters, onSelectTicker, onSelectReport }: Props) {
  const { data, loading, error } = useHitRateLeaderboard()
  const [selectedBrokerId, setSelectedBrokerId] = useState<BrokerId | null>(null)

  // Respect a sidebar broker filter, but never blank the board: if the filter
  // excludes everyone, fall back to the full ranking.
  const rows = useMemo(() => {
    const all = data?.rows ?? []
    if (filters.brokerIds.length === 0) return all
    const keep = new Set(filters.brokerIds.map((b) => b as unknown as string))
    const narrowed = all.filter((r) => keep.has(r.brokerId as unknown as string))
    return narrowed.length > 0 ? narrowed : all
  }, [data, filters.brokerIds])

  // Top-ranked analyst selected first; selection self-heals if filters drop it.
  useEffect(() => {
    if (selectedBrokerId && rows.some((r) => r.brokerId === selectedBrokerId)) return
    setSelectedBrokerId(rows[0]?.brokerId ?? null)
  }, [rows, selectedBrokerId])

  const selectedRow = rows.find((r) => r.brokerId === selectedBrokerId) ?? null

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-lg">Who calls it right</h2>
        <p className="text-slate-400 text-[12px]">
          How often each analyst's rated calls have actually played out — and how each call has done since.
        </p>
      </header>

      {renderBody()}
    </div>
  )

  function renderBody() {
    if (error) return <Message tone="error" text={`Could not load hit rates: ${error.message}`}/>
    if (loading || !data) return <Message tone="loading" text="Loading hit rates…"/>
    if (!data.hasData || rows.length === 0) {
      return <Empty title="No track record yet" body={data.emptyMessage ?? ''}/>
    }

    return (
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[340px] shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 text-[10.5px] text-slate-500">
            <span>{rows.length} analyst{rows.length === 1 ? '' : 's'} ranked</span>
            {data.generatedAt && <span className="num">as of {data.generatedAt.slice(0, 10)}</span>}
          </div>
          <AnalystLeaderboard rows={rows} selectedBrokerId={selectedBrokerId} onSelect={setSelectedBrokerId}/>
        </div>
        <div className="hidden lg:block divider-v self-stretch"/>
        <div className="flex-1 min-w-0">
          {selectedRow && (
            <AnalystDetail
              key={selectedRow.brokerId as unknown as string}
              row={selectedRow}
              filters={filters}
              onSelectReport={onSelectReport}
              onSelectTicker={onSelectTicker}
            />
          )}
        </div>
      </div>
    )
  }
}

function Message({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-6 text-center">
      <div className="text-slate-200 font-medium text-[14px] mb-1">{title}</div>
      <p className="text-[12px] text-slate-400 max-w-md mx-auto">{body}</p>
    </div>
  )
}
