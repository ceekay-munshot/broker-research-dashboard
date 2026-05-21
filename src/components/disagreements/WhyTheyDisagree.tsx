// The crux of a disagreement: each contested topic framed as Bulls-say
// versus Bears-say, with the brokers on each side carrying their
// track-record dot so the reader can weigh who's behind which view.

import type { DisagreementPointVM, BrokerRef } from '../../viewModels/divergence'
import type { BrokerTier } from '../../viewModels/disagreementInsight'
import { BrokerChip } from './shared'

interface Props {
  readonly points: readonly DisagreementPointVM[]
  readonly tierFor: (brokerId: string) => BrokerTier
}

export default function WhyTheyDisagree({ points, tierFor }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="section-title">Why they disagree</span>
      {points.length === 0 ? (
        <p className="text-[12px] text-slate-500 leading-snug">
          No single thematic split stands out — the disagreement here is about valuation,
          shown on the target-price scale above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {points.map((p, i) => (
            <DisagreementBlock key={`${p.dimension}-${i}`} point={p} tierFor={tierFor}/>
          ))}
        </div>
      )}
    </div>
  )
}

function DisagreementBlock({ point, tierFor }: {
  point: DisagreementPointVM
  tierFor: (brokerId: string) => BrokerTier
}) {
  // The `stance` dimension carries the brokers' actual theses — frame it
  // as the headline bull-vs-bear case rather than the generic topic name.
  const heading = point.dimension === 'stance' ? 'Bull case vs bear case' : point.topic
  return (
    <div className="rounded-md border border-line/5 bg-line/[0.02] p-3 flex flex-col gap-2.5">
      <div className="text-[12px] font-semibold text-slate-100">{heading}</div>
      <Side
        kind="bull"
        claims={point.bullClaims}
        brokers={point.bullBrokers}
        citations={point.bullCitationCount}
        tierFor={tierFor}
      />
      <div className="border-t border-line/5"/>
      <Side
        kind="bear"
        claims={point.bearClaims}
        brokers={point.bearBrokers}
        citations={point.bearCitationCount}
        tierFor={tierFor}
      />
    </div>
  )
}

function Side({ kind, claims, brokers, citations, tierFor }: {
  kind: 'bull' | 'bear'
  claims: readonly string[]
  brokers: readonly BrokerRef[]
  citations: number
  tierFor: (brokerId: string) => BrokerTier
}) {
  const isBull = kind === 'bull'
  const chipCls = isBull
    ? 'border-emerald-500/30 text-emerald-400'
    : 'border-rose-500/30 text-rose-400'
  // Drop empty claim strings — a broker may carry a stance with no
  // extracted thesis text, which would otherwise render as a blank line.
  const cleanClaims = claims.filter((c) => c.trim().length > 0)
  const shownClaims = cleanClaims.slice(0, 2)
  const moreClaims = cleanClaims.length - shownClaims.length
  const shownBrokers = brokers.slice(0, 4)
  const moreBrokers = brokers.length - shownBrokers.length

  return (
    <div className="flex gap-2.5">
      <span className={`chip border ${chipCls} shrink-0 self-start text-[9.5px]`}>
        {isBull ? 'Bulls' : 'Bears'}
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        {shownClaims.map((c, i) => (
          <span key={i} className="text-[12px] text-slate-200 leading-snug">{c}</span>
        ))}
        {moreClaims > 0 && (
          <span className="text-[10.5px] text-slate-500">
            +{moreClaims} more point{moreClaims === 1 ? '' : 's'}
          </span>
        )}
        {(shownBrokers.length > 0 || citations > 0) && (
          <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap pt-0.5">
            {shownBrokers.map((b) => (
              <BrokerChip key={b.id} name={b.name} tier={tierFor(b.id)}/>
            ))}
            {moreBrokers > 0 && <span className="text-[10.5px] text-slate-500">+{moreBrokers}</span>}
            {citations > 0 && (
              <span className="text-[10px] text-slate-500 num">
                · {citations} citation{citations === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
