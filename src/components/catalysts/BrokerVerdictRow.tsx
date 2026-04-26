import type { BrokerVerdictRowViewModel } from '../../viewModels/postEventReview'

const VERDICT_TONE: Readonly<Record<BrokerVerdictRowViewModel['verdict'], string>> = {
  right:        'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  wrong:        'border-rose-500/40 text-rose-300 bg-rose-500/10',
  inconclusive: 'border-slate-400/30 text-slate-300 bg-line/[0.04]',
  no_view:      'border-line/10 text-slate-500 bg-transparent',
}

const STANCE_TONE: Readonly<Record<BrokerVerdictRowViewModel['preStance'], string>> = {
  bullish: 'text-emerald-300',
  neutral: 'text-slate-300',
  bearish: 'text-rose-300',
}

export default function BrokerVerdictRow({ row }: { row: BrokerVerdictRowViewModel }) {
  return (
    <div className="grid grid-cols-[120px_72px_88px_72px_1fr] items-center gap-2 px-2 py-1.5 text-[11.5px] border border-line/5 rounded">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-slate-100 truncate">{row.brokerShortName}</span>
        {row.calibrationScore !== null && (
          <span
            title={`Calibration score ${row.calibrationScore}`}
            className={`num text-[10px] ${row.calibrationScore >= 25 ? 'text-emerald-400' : row.calibrationScore >= 0 ? 'text-slate-400' : 'text-rose-400'}`}
          >{row.calibrationScore >= 0 ? '+' : ''}{row.calibrationScore.toFixed(0)}</span>
        )}
      </div>
      <span className={`text-[11px] ${STANCE_TONE[row.preStance]}`}>{row.preStance}</span>
      <span className="text-slate-300 text-[11px] num">{row.preTargetPrice === null ? '—' : row.preTargetPrice.toLocaleString('en-IN')}</span>
      <span className={`chip border ${VERDICT_TONE[row.verdict]} text-[10px] uppercase tracking-wider font-semibold text-center`}>
        {row.verdict.replace('_', ' ')}
      </span>
      <span className="text-slate-400 text-[11px] truncate" title={row.reason}>{row.reason}</span>
    </div>
  )
}
