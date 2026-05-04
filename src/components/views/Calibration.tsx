import { useState } from 'react'
import type { StockTicker } from '../../domain'
import { useCalibrationViewModel } from '../../hooks/useCalibrationViewModel'
import BrokerCalibrationCard from '../calibration/BrokerCalibrationCard'
import AlertEffectivenessCard from '../calibration/AlertEffectivenessCard'

interface CalibrationProps {
  readonly onSelectTicker: (t: StockTicker) => void
}

const SECTIONS = [
  { id: 'brokers',  label: 'Brokers' },
  { id: 'alerts',   label: 'Alert kinds' },
  { id: 'coverage', label: 'Per-ticker coverage' },
] as const
type SectionId = typeof SECTIONS[number]['id']

export default function Calibration({ onSelectTicker }: CalibrationProps) {
  const [section, setSection] = useState<SectionId>('brokers')
  const [showWeakest, setShowWeakest] = useState(false)
  const { data, loading, error } = useCalibrationViewModel()

  if (loading || !data) return <ViewMessage tone="loading" text="Loading calibration…"/>
  if (error)            return <ViewMessage tone="error" text={`Error: ${error.message}`}/>

  if (!data.hasSnapshot) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-slate-100 font-semibold text-base">Calibration</h2>
          <p className="text-slate-400 text-[12px]">Broker calibration · alert-kind effectiveness · per-ticker coverage signal.</p>
        </header>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No calibration data yet</div>
          <p className="max-w-md mx-auto">Awaiting server output.</p>
        </div>
      </div>
    )
  }

  const c = data.counters!

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-slate-100 font-semibold text-base">Calibration &amp; signal effectiveness</h2>
          <p className="text-slate-400 text-[12px]">
            Empirical scorecards for brokers, alert kinds, and per-ticker coverage.
            Methodology <code className="kbd">{data.methodologyVersion}</code>.
            Snapshot {data.generatedAt?.slice(0, 16).replace('T', ' ')} UTC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <Stat label="Events" value={c.events}/>
          <Stat label="Outcomes" value={c.outcomes}/>
          <Stat label="Directional" value={c.directionalEvents}/>
          <Stat label="Tickers w/ price" value={c.priceCoveredTickers}/>
          <Stat label="Skipped" value={c.skippedNoPrice}/>
        </div>
      </header>

      {data.degradations.length > 0 && (
        <div className="panel p-2.5 text-[11px] text-amber-300 border-amber-500/20">
          <span className="uppercase tracking-widest text-[9.5px] text-amber-400 mr-2">Degraded</span>
          {data.degradations.join('  ·  ')}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`chip text-[11px] border ${
              section === s.id
                ? 'border-accent/40 text-accent bg-accent/10'
                : 'border-line/10 text-slate-400 hover:text-slate-200 hover:border-line/20'
            }`}
          >{s.label}</button>
        ))}
        <span className="w-px h-4 bg-line/10 mx-1"/>
        <span className="text-[11px] text-slate-500 italic">
          Calibration metadata is exposed but does not change existing ranking unless
          <code className="kbd ml-1">VITE_CALIBRATION_AWARE_RANKING=1</code> is set.
        </span>
      </div>

      {section === 'brokers' && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-slate-100 text-[13px] font-semibold">{showWeakest ? 'Weakest brokers' : 'Top brokers by usefulness'}</h3>
            <button
              onClick={() => setShowWeakest((v) => !v)}
              className="chip text-[10.5px] border border-line/10 text-slate-300 hover:text-accent"
            >
              {showWeakest ? '↑ Show top' : '↓ Show weakest'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {(showWeakest ? data.weakestBrokers : data.topBrokers).slice(0, 9).map((b) => (
              <BrokerCalibrationCard key={b.brokerId as unknown as string} summary={b}/>
            ))}
          </div>
        </section>
      )}

      {section === 'alerts' && (
        <section className="flex flex-col gap-3">
          <h3 className="text-slate-100 text-[13px] font-semibold">Alert-kind effectiveness</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {data.alertKinds.map((a) => (
              <AlertEffectivenessCard key={a.kind} summary={a}/>
            ))}
          </div>
        </section>
      )}

      {section === 'coverage' && (
        <section className="flex flex-col gap-3">
          <h3 className="text-slate-100 text-[13px] font-semibold">Per-ticker coverage signal</h3>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead className="bg-line/[0.02] border-b border-line/5">
                <tr className="text-left text-slate-400">
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 font-medium text-right">Score</th>
                  <th className="px-3 py-2 font-medium text-right">Hit</th>
                  <th className="px-3 py-2 font-medium text-right">Mean</th>
                  <th className="px-3 py-2 font-medium text-right">N</th>
                  <th className="px-3 py-2 font-medium">Top brokers</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.coverage.map((r, i) => (
                  <tr key={r.ticker as unknown as string} className={`border-b border-line/5 ${i % 2 ? 'bg-line/[0.01]' : ''}`}>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onSelectTicker(r.ticker)}
                        className="text-slate-100 font-semibold hover:text-accent"
                      >{r.ticker as unknown as string}</button>
                      <div className="text-[10.5px] text-slate-500">{r.confidence}</div>
                    </td>
                    <td className="px-3 py-2 text-right num text-slate-200">
                      {r.score === null ? '—' : `${r.score >= 0 ? '+' : ''}${r.score.toFixed(0)}`}
                    </td>
                    <td className="px-3 py-2 text-right num">
                      {r.hitRate === null ? '—' : `${(r.hitRate * 100).toFixed(0)}%`}
                    </td>
                    <td className={`px-3 py-2 text-right num ${r.meanReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.meanReturnPct >= 0 ? '+' : ''}{r.meanReturnPct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right num text-slate-400">{r.sampleSize}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.topBrokers.map((b) => (
                          <span key={b.brokerId as unknown as string} className="chip border border-line/10 text-[10.5px] text-slate-300">
                            {b.brokerShortName}
                            <span className={`num ml-1 ${b.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{b.score >= 0 ? '+' : ''}{b.score.toFixed(0)}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-400 max-w-[280px]">
                      <div>{r.recentAlertEffectivenessNote ?? r.reasons[0]?.text ?? ''}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="num text-[12px] font-semibold text-slate-100">{value.toLocaleString()}</span>
    </div>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
