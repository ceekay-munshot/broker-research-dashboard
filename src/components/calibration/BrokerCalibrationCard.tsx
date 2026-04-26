import type { BrokerCalibrationSummary } from '../../domain'
import SampleSizeBadge from './SampleSizeBadge'

interface BrokerCalibrationCardProps {
  readonly summary: BrokerCalibrationSummary
}

export default function BrokerCalibrationCard({ summary }: BrokerCalibrationCardProps) {
  const tone =
    summary.score >= 30  ? 'border-emerald-500/30 bg-emerald-500/5'
    : summary.score >= 10  ? 'border-line/10'
    : summary.score >= -10 ? 'border-line/5 bg-line/[0.02]'
    :                         'border-rose-500/30 bg-rose-500/[0.04]'

  const fiveDay = summary.byWindow.find((w) => w.window === '5d')

  return (
    <div className={`panel p-3 flex flex-col gap-2 border ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-100 font-semibold text-[13px] truncate">{summary.brokerShortName}</span>
          <SampleSizeBadge band={summary.confidence} sampleSize={summary.sampleSize} compact/>
        </div>
        <ScoreBadge score={summary.score}/>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <Stat label="hit"  value={summary.hitRate === null ? '—' : `${(summary.hitRate * 100).toFixed(0)}%`}/>
        <Stat label="mean" value={`${summary.meanReturnPct >= 0 ? '+' : ''}${summary.meanReturnPct.toFixed(2)}%`}/>
        {fiveDay?.meanRelReturnPct !== null && fiveDay !== undefined && (
          <Stat label="rel" value={`${fiveDay.meanRelReturnPct! >= 0 ? '+' : ''}${fiveDay.meanRelReturnPct!.toFixed(2)}%`}/>
        )}
        {summary.longHitRate !== null && (
          <Stat label="long" value={`${(summary.longHitRate * 100).toFixed(0)}%`}/>
        )}
        {summary.shortHitRate !== null && (
          <Stat label="short" value={`${(summary.shortHitRate * 100).toFixed(0)}%`}/>
        )}
        {summary.againstPositionSampleSize > 0 && (
          <Stat label="against" value={summary.againstPositionHitRate === null ? '—' : `${(summary.againstPositionHitRate * 100).toFixed(0)}% (n=${summary.againstPositionSampleSize})`}/>
        )}
      </div>

      {summary.byWindow.length > 0 && summary.sampleSize > 0 && (
        <div className="grid grid-cols-5 gap-1 text-[10.5px] text-slate-400 mt-1">
          {summary.byWindow.map((w) => (
            <div key={w.window} className="border-l border-line/10 pl-2">
              <div className="uppercase tracking-wider text-[9.5px] text-slate-500">{w.window}</div>
              <div className="num text-slate-200">
                {w.hitRate === null ? '—' : `${(w.hitRate * 100).toFixed(0)}%`}
              </div>
              <div className={`num ${w.meanReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {w.meanReturnPct >= 0 ? '+' : ''}{w.meanReturnPct.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {summary.reasons.slice(0, 4).map((r) => (
            <span key={r.code} className="chip text-[10px] border border-line/10 text-slate-300">
              {r.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 30  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
    : score >= 10  ? 'border-slate-400/30 text-slate-200 bg-line/[0.04]'
    : score >= -10 ? 'border-line/10 text-slate-400'
    :                 'border-rose-500/40 text-rose-300 bg-rose-500/10'
  return (
    <span className={`chip border ${tone} text-[11px] font-semibold num`}
      title="Calibration score: hit-rate (vs 50%) + benchmark-relative magnitude, sample-size discounted">
      {score >= 0 ? '+' : ''}{score.toFixed(0)}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-500 uppercase tracking-wider text-[9.5px] mr-1">{label}</span>
      <span className="num text-slate-200">{value}</span>
    </span>
  )
}
