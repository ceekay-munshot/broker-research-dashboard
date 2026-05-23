// The agreement counterpart to `WhyTheyDisagree`. Each consensus point
// is one card: topic + polarity chip (Bullish / Bearish / Neutral),
// the agreed claim, the brokers backing it (with track-record dots),
// and the citation count. Sort + filter logic is owned by this
// component — `CompanyDetail` hands in the raw `c.consensus` array.

import type { ConsensusPointVM, BrokerRef } from '../../viewModels/divergence'
import type { BrokerTier } from '../../viewModels/disagreementInsight'
import { BrokerChip } from './shared'

interface Props {
  readonly points: readonly ConsensusPointVM[]
  readonly tierFor: (brokerId: string) => BrokerTier
}

export default function WhereTheyAgree({ points, tierFor }: Props) {
  // Drop dimensions already carried by the verdict badge / target scale.
  // Keep `stance` consensus points — when several brokers all agree it's
  // a Buy, that headline belongs in this section. Sort by debate volume
  // so the most-backed topic comes first.
  const ranked = points
    .filter((p) => p.dimension !== 'rating' && p.dimension !== 'target_price')
    .slice()
    .sort((a, b) =>
      (b.evidenceCount + b.brokers.length)
      - (a.evidenceCount + a.brokers.length))

  return (
    <div className="flex flex-col gap-2.5">
      <span className="section-title">Where they agree</span>
      {ranked.length === 0 ? (
        <p className="text-[12px] text-slate-500 leading-snug">
          No agreement points extracted yet — the Street view here is captured in the verdict
          badge and the target-price scale above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {ranked.map((p, i) => (
            <ConsensusBlock key={`${p.dimension}-${i}`} point={p} tierFor={tierFor}/>
          ))}
        </div>
      )}
    </div>
  )
}

function ConsensusBlock({ point, tierFor }: {
  point: ConsensusPointVM
  tierFor: (brokerId: string) => BrokerTier
}) {
  // The `stance` dimension means "the Street agrees on the overall call" —
  // give it a clearer heading rather than the generic topic label.
  const heading = point.dimension === 'stance' ? 'Overall stance' : point.topic
  // Polarity reuses the colour vocabulary already used by WhyTheyDisagree.Side
  // (emerald for bullish, rose for bearish, slate for neutral) so the
  // reader's eye carries the same meaning across both sections.
  const polarityCls = point.polarity === 'bullish'
    ? 'border-emerald-500/30 text-emerald-400'
    : point.polarity === 'bearish'
    ? 'border-rose-500/30 text-rose-400'
    : 'border-slate-500/30 text-slate-300'
  const polarityLabel = point.polarity === 'bullish' ? 'Bullish'
    : point.polarity === 'bearish' ? 'Bearish'
    : 'Neutral'

  const cleanClaim = point.claim.trim()
  const shownSupporting = point.supportingClaims
    .filter((c) => c.trim().length > 0)
    .slice(0, 2)
  const moreSupporting = point.supportingClaims.filter((c) => c.trim().length > 0).length - shownSupporting.length
  const shownBrokers = point.brokers.slice(0, 5)
  const moreBrokers = point.brokers.length - shownBrokers.length

  return (
    <div className="rounded-md border border-line/5 bg-line/[0.02] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-100">{heading}</span>
        <span className={`chip border ${polarityCls} text-[9.5px] shrink-0`}>{polarityLabel}</span>
      </div>
      {cleanClaim.length > 0 && (
        <span className="text-[12px] text-slate-200 leading-snug">{cleanClaim}</span>
      )}
      {shownSupporting.length > 0 && (
        <ul className="flex flex-col gap-1">
          {shownSupporting.map((s, i) => (
            <li key={i} className="text-[11.5px] text-slate-400 leading-snug flex gap-1.5">
              <span className="text-slate-600 shrink-0">·</span>
              <span>{s}</span>
            </li>
          ))}
          {moreSupporting > 0 && (
            <li className="text-[10.5px] text-slate-500 pl-3">
              +{moreSupporting} more point{moreSupporting === 1 ? '' : 's'}
            </li>
          )}
        </ul>
      )}
      {(shownBrokers.length > 0 || point.evidenceCount > 0) && (
        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap pt-0.5">
          {shownBrokers.map((b: BrokerRef) => (
            <BrokerChip key={b.id} name={b.name} tier={tierFor(b.id)}/>
          ))}
          {moreBrokers > 0 && <span className="text-[10.5px] text-slate-500">+{moreBrokers}</span>}
          {point.evidenceCount > 0 && (
            <span className="text-[10px] text-slate-500 num">
              · {point.evidenceCount} citation{point.evidenceCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
