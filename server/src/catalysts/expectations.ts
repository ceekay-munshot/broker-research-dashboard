// Build a deterministic `ExpectationSnapshot` from canonical research +
// the calibration layer. Nothing invented — only what the org's
// ingested broker set is currently saying.

import type {
  Broker, BrokerStockOpinion, ResearchReport, Stock,
  ExpectationBrokerOpinion, ExpectationSnapshot, ExpectationStanceMix,
  CatalystEvent, OrgId, CalibrationSnapshot,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

export interface BuildSnapshotInputs {
  readonly orgId: OrgId
  readonly catalyst: CatalystEvent
  readonly opinions: readonly BrokerStockOpinion[]
  readonly reports: readonly ResearchReport[]
  readonly stocks: readonly Stock[]
  readonly brokers: readonly Broker[]
  readonly closures: readonly ConflictClosure[]
  readonly calibration: CalibrationSnapshot | null
  readonly now: Date
}

export function buildExpectationSnapshot(inputs: BuildSnapshotInputs): ExpectationSnapshot {
  const ticker = inputs.catalyst.ticker
  const stk = inputs.stocks.find((s) => s.ticker === ticker) ?? null
  const tickerOpinions = inputs.opinions.filter((o) => o.ticker === ticker)
  const closure = inputs.closures.find((c) => c.ticker === ticker) ?? null

  const calibrationByBroker = new Map<string, { score: number; confidence: 'very_low' | 'low' | 'medium' | 'high' }>()
  for (const b of inputs.calibration?.brokerCalibrations ?? []) {
    calibrationByBroker.set(b.brokerId as string, { score: b.score, confidence: b.confidence })
  }

  const opinions: ExpectationBrokerOpinion[] = []
  for (const o of tickerOpinions) {
    const broker = inputs.brokers.find((b) => b.id === o.brokerId)
    const cal = calibrationByBroker.get(o.brokerId as string) ?? null
    opinions.push({
      brokerId: o.brokerId,
      brokerShortName: broker?.shortName ?? (o.brokerId as unknown as string),
      rating: o.rating,
      stance: o.stance,
      targetPrice: o.targetPrice,
      priorTargetPrice: o.priorTargetPrice,
      targetCurrency: o.targetCurrency,
      impliedUpsidePct: o.impliedUpsidePct,
      lastReportId: o.lastReportId,
      lastUpdatedAt: o.lastUpdatedAt,
      calibrationScore: cal?.score ?? null,
      calibrationConfidence: cal?.confidence ?? null,
    })
  }
  opinions.sort((a, b) => {
    const scoreA = a.calibrationScore ?? -1000
    const scoreB = b.calibrationScore ?? -1000
    if (scoreA !== scoreB) return scoreB - scoreA
    return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
  })

  const stanceMix: ExpectationStanceMix = {
    bullish: opinions.filter((o) => o.stance === 'bullish').length,
    neutral: opinions.filter((o) => o.stance === 'neutral').length,
    bearish: opinions.filter((o) => o.stance === 'bearish').length,
  }

  const targets = opinions.map((o) => o.targetPrice).filter((t): t is number => t !== null)
  const avgTarget = targets.length ? targets.reduce((s, x) => s + x, 0) / targets.length : null
  const sortedTargets = [...targets].sort((a, b) => a - b)
  const medianTarget = sortedTargets.length === 0
    ? null
    : sortedTargets.length % 2
      ? sortedTargets[(sortedTargets.length - 1) / 2]!
      : (sortedTargets[sortedTargets.length / 2 - 1]! + sortedTargets[sortedTargets.length / 2]!) / 2
  const targetSpreadPct = sortedTargets.length >= 2 && sortedTargets[0]! > 0
    ? ((sortedTargets[sortedTargets.length - 1]! - sortedTargets[0]!) / sortedTargets[0]!) * 100
    : null

  const upsides = opinions.map((o) => o.impliedUpsidePct).filter((u): u is number => u !== null)
  const avgImpliedUpsidePct = upsides.length ? upsides.reduce((s, x) => s + x, 0) / upsides.length : null

  const hasDivergence = !!closure && (
    closure.disagreements.length > 0 ||
    closure.resultant.state === 'unresolved' ||
    closure.resultant.state === 'mixed_constructive' ||
    closure.resultant.state === 'mixed_cautious' ||
    closure.resultant.state === 'outlier_driven'
  )

  // Tilt summary line.
  const totalStance = stanceMix.bullish + stanceMix.neutral + stanceMix.bearish
  const tiltSummary = (() => {
    if (totalStance === 0) return 'No active broker opinions on the name.'
    const bullPct = (stanceMix.bullish / totalStance) * 100
    const bearPct = (stanceMix.bearish / totalStance) * 100
    if (bullPct >= 60) return `${stanceMix.bullish}/${totalStance} brokers bullish into the event.`
    if (bearPct >= 60) return `${stanceMix.bearish}/${totalStance} brokers bearish into the event.`
    if (Math.abs(bullPct - bearPct) <= 15 && hasDivergence) {
      return `Street is split — ${stanceMix.bullish} bull / ${stanceMix.neutral} neutral / ${stanceMix.bearish} bear.`
    }
    return `${stanceMix.bullish} bull / ${stanceMix.neutral} neutral / ${stanceMix.bearish} bear.`
  })()

  return {
    orgId: inputs.orgId,
    ticker,
    catalystId: inputs.catalyst.id,
    asOf: inputs.now.toISOString(),
    distinctBrokers: opinions.length,
    stanceMix,
    avgTargetPrice: avgTarget === null ? null : Math.round(avgTarget * 100) / 100,
    medianTargetPrice: medianTarget === null ? null : Math.round(medianTarget * 100) / 100,
    targetSpreadPct: targetSpreadPct === null ? null : Math.round(targetSpreadPct * 10) / 10,
    avgImpliedUpsidePct: avgImpliedUpsidePct === null ? null : Math.round(avgImpliedUpsidePct * 10) / 10,
    hasDivergence,
    opinions,
    tiltSummary,
  }
  // Touch stk to silence unused-binding warnings; reserved for future
  // spot-vs-target enrichment.
  void stk
}
