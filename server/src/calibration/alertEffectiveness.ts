// Per-alert-kind effectiveness scorecard.

import type {
  AlertEffectivenessByMembership, AlertEffectivenessSummary,
  AlertTriggerKind, CalibrationReason, OrgId,
  SignalEvent, SignalOutcome,
} from '../../../src/domain'
import { ALERT_TRIGGER_KINDS } from '../../../src/domain'
import { aggregateByWindow, bandFor, calibrationScore } from './eventStudy'

const PRIMARY_WINDOW = '5d' as const

export function buildAlertEffectiveness(
  orgId: OrgId,
  events: readonly SignalEvent[],
  outcomes: readonly SignalOutcome[],
  now: Date,
): readonly AlertEffectivenessSummary[] {
  const outcomesByEvent = new Map<string, SignalOutcome[]>()
  for (const o of outcomes) {
    const k = o.eventId as unknown as string
    const arr = outcomesByEvent.get(k) ?? []
    arr.push(o)
    outcomesByEvent.set(k, arr)
  }

  const out: AlertEffectivenessSummary[] = []
  for (const kind of ALERT_TRIGGER_KINDS) {
    const kindEvents = events.filter((e) => e.alertKind === kind)
    const kindOutcomes = kindEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const byWindow = aggregateByWindow(kindOutcomes)
    const primary = byWindow.find((w) => w.window === PRIMARY_WINDOW)!

    const heldEvents = kindEvents.filter((e) => e.bookContext === 'held_long' || e.bookContext === 'held_short')
    const heldOutcomes = heldEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const heldAgg = aggregateByWindow(heldOutcomes).find((w) => w.window === PRIMARY_WINDOW)!

    const watchEvents = kindEvents.filter((e) => e.bookContext === 'watchlist')
    const watchOutcomes = watchEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const watchAgg = aggregateByWindow(watchOutcomes).find((w) => w.window === PRIMARY_WINDOW)!

    const byMembership: AlertEffectivenessByMembership[] = [
      { membership: 'all',       sampleSize: primary.sampleSize, hitRate: primary.hitRate, meanReturnPct: primary.meanReturnPct },
      { membership: 'held',      sampleSize: heldAgg.sampleSize,  hitRate: heldAgg.hitRate,  meanReturnPct: heldAgg.meanReturnPct },
      { membership: 'watchlist', sampleSize: watchAgg.sampleSize, hitRate: watchAgg.hitRate, meanReturnPct: watchAgg.meanReturnPct },
    ]

    const score = calibrationScore({
      hitRate: primary.hitRate,
      meanRelOrRaw: primary.meanRelReturnPct ?? primary.meanReturnPct,
      sampleSize: primary.sampleSize,
    })
    const confidence = bandFor(primary.sampleSize)
    const reasons = buildAlertReasons({ kind, primary, heldAgg, score, confidence })

    out.push({
      orgId,
      kind,
      sampleSize: primary.sampleSize,
      score,
      confidence,
      hitRate: primary.hitRate,
      meanReturnPct: primary.meanReturnPct,
      byWindow,
      byMembership,
      reasons,
      generatedAt: now.toISOString(),
    })
  }

  out.sort((a, b) => (b.score - a.score) || (b.sampleSize - a.sampleSize))
  return out
}

function buildAlertReasons(opts: {
  kind: AlertTriggerKind
  primary: ReturnType<typeof aggregateByWindow>[number]
  heldAgg: ReturnType<typeof aggregateByWindow>[number]
  score: number
  confidence: 'very_low' | 'low' | 'medium' | 'high'
}): readonly CalibrationReason[] {
  const out: CalibrationReason[] = []
  if (opts.confidence === 'very_low' || opts.confidence === 'low') {
    out.push({ code: 'small_sample', text: `Only ${opts.primary.sampleSize} events at 5d — low confidence.` })
  }
  if (opts.primary.hitRate !== null) {
    if (opts.primary.hitRate >= 0.6) {
      out.push({ code: 'strong', text: `Hit rate ${(opts.primary.hitRate * 100).toFixed(0)}% — predictive.` })
    } else if (opts.primary.hitRate <= 0.4) {
      out.push({ code: 'weak', text: `Hit rate ${(opts.primary.hitRate * 100).toFixed(0)}% — noisy / fade.` })
    }
  }
  if (opts.heldAgg.sampleSize >= 5 && opts.heldAgg.hitRate !== null) {
    out.push({
      code: 'held_focus',
      text: `On held names: ${(opts.heldAgg.hitRate * 100).toFixed(0)}% hit rate over n=${opts.heldAgg.sampleSize}.`,
    })
  }
  if (opts.primary.meanRelReturnPct !== null && Math.abs(opts.primary.meanRelReturnPct) >= 0.5) {
    out.push({
      code: 'rel_return',
      text: `Mean benchmark-relative ${opts.primary.meanRelReturnPct > 0 ? '+' : ''}${opts.primary.meanRelReturnPct.toFixed(2)}% at 5d.`,
    })
  }
  return out
}
