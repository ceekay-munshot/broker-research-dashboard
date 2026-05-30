// The Disagreements tab — a split-view explorer: pick a company on the left,
// read the full breakdown on the right. Calibration data is loaded alongside
// so broker names inside a disagreement carry their track-record dot; the join
// degrades to "unproven" when no calibration snapshot exists yet.

import { useMemo, useState } from 'react'
import type { StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useDivergenceViewModel } from '../../viewModels/divergence'
import { useCalibrationViewModel } from '../../hooks/useCalibrationViewModel'
import { brokerTier, type BrokerTier } from '../../viewModels/disagreementInsight'
import CompanyList from './CompanyList'
import CompanyDetail from './CompanyDetail'
import { ViewMessage, EmptyState } from './shared'

interface Props {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function DisagreementsSplit({ filters, onSelectTicker }: Props) {
  const [selectedTicker, setSelectedTicker] = useState<StockTicker | null>(null)

  const divergence = useDivergenceViewModel(filters)
  const calibration = useCalibrationViewModel()

  // brokerId → track-record tier, joined from the calibration snapshot.
  // Absent snapshot ⇒ empty map ⇒ every broker reads as "unproven".
  const tierFor = useMemo(() => {
    const map = new Map<string, BrokerTier>()
    for (const b of calibration.data?.topBrokers ?? []) {
      map.set(b.brokerId as unknown as string, brokerTier(b.score, b.confidence, b.sampleSize))
    }
    return (brokerId: string): BrokerTier => map.get(brokerId) ?? 'unproven'
  }, [calibration.data])

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-slate-100 font-semibold text-lg">Where they agree &amp; where they disagree</h2>
        <p className="text-slate-400 text-[12px]">
          Where the Street agrees on a stock, and where it splits.
        </p>
      </header>

      {renderCompanies()}
    </div>
  )

  // ── Companies ───────────────────────────────────────────────────────
  function renderCompanies() {
    if (divergence.error) {
      return <ViewMessage tone="error" text={`Could not load disagreements: ${divergence.error.message}`}/>
    }
    if (divergence.loading || !divergence.data) {
      return <ViewMessage tone="loading" text="Loading disagreements…"/>
    }
    const { cases, totalStocks } = divergence.data
    if (cases.length === 0) {
      return (
        <EmptyState
          title="No Street view yet"
          body="No covered name has more than one broker on it in the current filters — nothing to compare or contrast."
        />
      )
    }
    // The most-contested company is selected first; selection self-heals
    // if the filters drop the previously-selected ticker.
    const active = cases.find((c) => c.ticker === selectedTicker) ?? cases[0]!
    return (
      <Split
        meta={`${cases.length} of ${totalStocks} covered name${totalStocks === 1 ? '' : 's'} with a Street view`}
        list={
          <CompanyList cases={cases} activeTicker={active.ticker} onSelect={setSelectedTicker}/>
        }
        detail={
          <CompanyDetail c={active} tierFor={tierFor} onSelectTicker={onSelectTicker}/>
        }
      />
    )
  }
}

// ── Split-view shell ──────────────────────────────────────────────────

function Split({ meta, list, detail }: {
  meta: string
  list: React.ReactNode
  detail: React.ReactNode
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-72 shrink-0 flex flex-col gap-2">
        <div className="text-[10.5px] text-slate-500 num px-1">{meta}</div>
        {list}
      </div>
      <div className="hidden lg:block divider-v self-stretch"/>
      <div className="flex-1 min-w-0">{detail}</div>
    </div>
  )
}
