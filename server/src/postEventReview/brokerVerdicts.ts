// Deterministic broker right/wrong attribution.
//
// For each broker who held a stance going into the event, compare the
// pre-event stance (or directional rating change, when relevant) to the
// realized headline direction. Verdicts:
//
//   right         — broker had a directional view + realized matched it.
//   wrong         — broker had a directional view + realized opposed it.
//   inconclusive  — realized was 'flat' or 'mixed' or coverage missing.
//   no_view       — broker was neutral / no rating; not penalized.
//
// Pure transform.

import type {
  BrokerVerdict, ExpectationBrokerOpinion,
  RealizedOutcome,
} from '../../../src/domain'

export function computeBrokerVerdicts(
  preEventOpinions: readonly ExpectationBrokerOpinion[],
  realized: RealizedOutcome,
): readonly BrokerVerdict[] {
  const out: BrokerVerdict[] = []
  for (const o of preEventOpinions) {
    const hadDirectional = o.stance === 'bullish' || o.stance === 'bearish'
    const verdict = decideVerdict(o.stance, realized.headlineDirection, hadDirectional)
    out.push({
      brokerId: o.brokerId,
      brokerShortName: o.brokerShortName,
      preStance: o.stance,
      preRating: o.rating,
      preTargetPrice: o.targetPrice,
      realizedDirection: realized.headlineDirection,
      verdict,
      calibrationScore: o.calibrationScore,
      hadDirectionalView: hadDirectional,
      reason: explainVerdict(o.stance, realized.headlineDirection, verdict, realized.hasCoverage),
    })
  }
  return out
}

function decideVerdict(
  stance: 'bullish' | 'neutral' | 'bearish',
  realized: RealizedOutcome['headlineDirection'],
  hadDirectional: boolean,
): BrokerVerdict['verdict'] {
  if (!hadDirectional) return 'no_view'
  if (realized === 'unknown') return 'inconclusive'
  if (realized === 'flat' || realized === 'mixed') return 'inconclusive'
  if (stance === 'bullish' && realized === 'up') return 'right'
  if (stance === 'bearish' && realized === 'down') return 'right'
  if (stance === 'bullish' && realized === 'down') return 'wrong'
  if (stance === 'bearish' && realized === 'up') return 'wrong'
  return 'inconclusive'
}

function explainVerdict(
  stance: 'bullish' | 'neutral' | 'bearish',
  realized: RealizedOutcome['headlineDirection'],
  verdict: BrokerVerdict['verdict'],
  hasCoverage: boolean,
): string {
  if (!hasCoverage) return 'No market coverage on this name — verdict undecidable.'
  switch (verdict) {
    case 'right':       return `${stance} pre-event matched realized ${realized}.`
    case 'wrong':       return `${stance} pre-event opposed realized ${realized}.`
    case 'no_view':     return 'Held no directional view going into the event.'
    case 'inconclusive': return `Realized ${realized} — outcome too small or contradictory to credit either way.`
  }
}
