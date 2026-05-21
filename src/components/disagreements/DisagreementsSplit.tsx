// The Disagreements tab — a split-view explorer with two modes:
//   "Where they disagree" — flagged companies, list ↦ detail.
//   "Who's been right"     — brokers ranked by track record, list ↦ detail.
// Calibration data is loaded alongside divergence so broker names inside
// a disagreement carry their track-record dot; the join degrades to
// "unproven" when no calibration snapshot exists yet.

import { useMemo, useState } from 'react'
import type { StockTicker } from '../../domain'
import type { FiltersState } from '../../app/filters'
import { useDivergenceViewModel } from '../../viewModels/divergence'
import { useCalibrationViewModel } from '../../hooks/useCalibrationViewModel'
import { brokerTier, type BrokerTier } from '../../viewModels/disagreementInsight'
import AlertEffectivenessCard from '../calibration/AlertEffectivenessCard'
import CompanyList from './CompanyList'
import CompanyDetail from './CompanyDetail'
import BrokerList from './BrokerList'
import BrokerDetail from './BrokerDetail'
import { ViewMessage, EmptyState } from './shared'

type Mode = 'companies' | 'brokers'

interface Props {
  readonly filters: FiltersState
  readonly onSelectTicker: (t: StockTicker) => void
}

export default function DisagreementsSplit({ filters, onSelectTicker }: Props) {
  const [mode, setMode] = useState<Mode>('companies')
  const [selectedTicker, setSelectedTicker] = useState<StockTicker | null>(null)
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null)

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
        <h2 className="text-slate-100 font-semibold text-lg">Disagreements</h2>
        <p className="text-slate-400 text-[12px]">
          Where the Street disagrees on a stock — and which brokers have earned the right to be believed.
        </p>
      </header>

      <div className="inline-flex self-start rounded-lg border border-line/10 bg-line/[0.02] p-0.5">
        {([['companies', 'Where they disagree'], ['brokers', "Who's been right"]] as const).map(
          ([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                mode === id ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {mode === 'companies'
        ? renderCompanies()
        : renderBrokers()}
    </div>
  )

  // ── Companies mode ──────────────────────────────────────────────────
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
          title="No material disagreements"
          body="Every covered name has an aligned Street view, tightly clustered targets, and no outlier brokers for the current filters."
        />
      )
    }
    // Most-disagreed company is selected first; selection self-heals if
    // the filters drop the previously-selected ticker.
    const active = cases.find((c) => c.ticker === selectedTicker) ?? cases[0]!
    return (
      <Split
        meta={`${cases.length} of ${totalStocks} covered name${totalStocks === 1 ? '' : 's'} flagged`}
        list={
          <CompanyList cases={cases} activeTicker={active.ticker} onSelect={setSelectedTicker}/>
        }
        detail={
          <CompanyDetail c={active} tierFor={tierFor} onSelectTicker={onSelectTicker}/>
        }
      />
    )
  }

  // ── Brokers mode ────────────────────────────────────────────────────
  function renderBrokers() {
    if (calibration.error) {
      return <ViewMessage tone="error" text={`Could not load broker track records: ${calibration.error.message}`}/>
    }
    if (calibration.loading || !calibration.data) {
      return <ViewMessage tone="loading" text="Loading broker track records…"/>
    }
    const data = calibration.data
    if (!data.hasSnapshot || data.topBrokers.length === 0) {
      return (
        <EmptyState
          title="No broker track record yet"
          body="Calibration needs research matched to market outcomes. Once the server has scored some calls, brokers will be ranked here by how reliable their views have been."
        />
      )
    }
    const active = data.topBrokers.find(
      (b) => (b.brokerId as unknown as string) === selectedBrokerId,
    ) ?? data.topBrokers[0]!
    return (
      <div className="flex flex-col gap-5">
        <Split
          meta={`${data.topBrokers.length} broker${data.topBrokers.length === 1 ? '' : 's'} scored`}
          list={
            <BrokerList
              brokers={data.topBrokers}
              activeBrokerId={active.brokerId as unknown as string}
              onSelect={setSelectedBrokerId}
            />
          }
          detail={<BrokerDetail broker={active}/>}
        />
        {data.alertKinds.length > 0 && (
          <div className="flex flex-col gap-2.5 border-t border-line/5 pt-5">
            <div className="flex flex-col gap-0.5">
              <span className="section-title">Which signals to trust</span>
              <p className="text-[11.5px] text-slate-500">
                How reliable each kind of alert has been across all brokers.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {data.alertKinds.map((a) => (
                <AlertEffectivenessCard key={a.kind} summary={a}/>
              ))}
            </div>
          </div>
        )}
      </div>
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
