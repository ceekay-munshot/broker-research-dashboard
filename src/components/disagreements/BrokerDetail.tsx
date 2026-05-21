// Right pane for the "Who's been right" mode — one broker's empirical
// track record: the takeaway, headline hit/return stats, the per-window
// breakdown, and a deeper directional/sector split behind an expander.

import type { BrokerCalibrationSummary } from '../../domain'
import { brokerTier, composeBrokerInsight } from '../../viewModels/disagreementInsight'
import { BrokerTierDot, ScoreBadge, MoreDetail } from './shared'

export default function BrokerDetail({ broker }: { broker: BrokerCalibrationSummary }) {
  const tier = brokerTier(broker.score, broker.confidence, broker.sampleSize)

  const splits: { label: string; value: string }[] = []
  if (broker.longHitRate !== null) {
    splits.push({ label: 'Long calls', value: `${Math.round(broker.longHitRate * 100)}% hit` })
  }
  if (broker.shortHitRate !== null) {
    splits.push({ label: 'Short calls', value: `${Math.round(broker.shortHitRate * 100)}% hit` })
  }
  if (broker.againstPositionSampleSize > 0) {
    splits.push({
      label: 'Against-position alerts',
      value: broker.againstPositionHitRate !== null
        ? `${Math.round(broker.againstPositionHitRate * 100)}% hit · n=${broker.againstPositionSampleSize}`
        : `n=${broker.againstPositionSampleSize}`,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="section-title">Broker track record</div>
          <div className="flex items-center gap-2">
            <BrokerTierDot tier={tier}/>
            <span className="text-slate-100 text-[18px] font-semibold leading-tight">{broker.brokerShortName}</span>
          </div>
          <div className="text-[11.5px] text-slate-400 num">
            {broker.sampleSize} scored event{broker.sampleSize === 1 ? '' : 's'}
            {' · '}{broker.confidence.replace(/_/g, ' ')} confidence
          </div>
        </div>
        <ScoreBadge score={broker.score}/>
      </header>

      <div className="rounded-md bg-line/[0.03] border border-line/8 border-l-2 border-l-accent/70 p-3.5">
        <div className="text-[9.5px] uppercase tracking-[0.16em] text-accent/90 mb-1">The takeaway</div>
        <p className="text-[14px] text-slate-100 leading-relaxed">{composeBrokerInsight(broker)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatPill
          label="Hit rate"
          value={broker.hitRate !== null ? `${Math.round(broker.hitRate * 100)}%` : '—'}
        />
        <StatPill
          label="Mean return"
          value={`${broker.meanReturnPct >= 0 ? '+' : ''}${broker.meanReturnPct.toFixed(2)}%`}
          tone={broker.meanReturnPct >= 0 ? 'pos' : 'neg'}
        />
        <StatPill label="Scored events" value={String(broker.sampleSize)}/>
      </div>

      {broker.byWindow.length > 0 && broker.sampleSize > 0 && (
        <div className="flex flex-col gap-2">
          <span className="section-title">Hit rate &amp; return by window</span>
          <div className="grid grid-cols-5 gap-1.5">
            {broker.byWindow.map((w) => (
              <div key={w.window} className="rounded border border-line/5 bg-line/[0.02] p-2 flex flex-col gap-0.5">
                <div className="text-[9.5px] uppercase tracking-wider text-slate-500">{w.window}</div>
                <div className="num text-[12px] text-slate-200">
                  {w.hitRate !== null ? `${Math.round(w.hitRate * 100)}%` : '—'}
                </div>
                <div className={`num text-[10.5px] ${w.meanReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {w.meanReturnPct >= 0 ? '+' : ''}{w.meanReturnPct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(splits.length > 0 || broker.reasons.length > 0) && (
        <MoreDetail>
          <div className="flex flex-col gap-2">
            <span className="section-title">Directional split</span>
            {splits.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {splits.map((s) => <StatPill key={s.label} label={s.label} value={s.value}/>)}
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">No directional breakdown available yet.</p>
            )}
          </div>

          {broker.reasons.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="section-title">Notes</span>
              <div className="flex flex-wrap gap-1">
                {broker.reasons.map((r) => (
                  <span key={r.code} className="chip text-[10px] border border-line/10 text-slate-300">
                    {r.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </MoreDetail>
      )}
    </div>
  )
}

function StatPill({ label, value, tone = 'plain' }: {
  label: string
  value: string
  tone?: 'plain' | 'pos' | 'neg'
}) {
  const vCls = tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-slate-100'
  return (
    <div className="rounded-md border border-line/5 bg-line/[0.02] px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[9.5px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`num text-[15px] font-semibold ${vCls}`}>{value}</span>
    </div>
  )
}
