// Per-broker calibration scorecard.

import type {
  Broker, BrokerCalibrationSummary, BrokerSectorBreakdown,
  CalibrationReason, OrgId, Sector,
  SignalEvent, SignalOutcome,
} from '../../../src/domain'
import { aggregateByWindow, bandFor, calibrationScore } from './eventStudy'

const PRIMARY_WINDOW = '5d' as const

export interface BuildBrokerCalibrationsInputs {
  readonly orgId: OrgId
  readonly events: readonly SignalEvent[]
  readonly outcomes: readonly SignalOutcome[]
  readonly brokers: readonly Broker[]
  readonly sectors: readonly Sector[]
  readonly now: Date
}

export function buildBrokerCalibrations(inputs: BuildBrokerCalibrationsInputs): readonly BrokerCalibrationSummary[] {
  const outcomesByEvent = groupBy(inputs.outcomes, (o) => o.eventId as unknown as string)
  const sectorById = new Map(inputs.sectors.map((s) => [s.id as unknown as string, s]))

  const out: BrokerCalibrationSummary[] = []
  for (const broker of inputs.brokers) {
    const brokerEvents = inputs.events.filter((e) => e.brokerId === broker.id)
    if (brokerEvents.length === 0) {
      out.push(emptyBrokerSummary(inputs.orgId, broker, inputs.now))
      continue
    }
    const allOutcomes = brokerEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const heldEvents = brokerEvents.filter((e) => e.bookContext === 'held_long' || e.bookContext === 'held_short')
    const heldOutcomes = heldEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])

    const byWindow = aggregateByWindow(allOutcomes)
    const heldByWindow = aggregateByWindow(heldOutcomes)
    const primary = byWindow.find((w) => w.window === PRIMARY_WINDOW)!
    const sample = primary.sampleSize

    // Per-sector breakdown.
    const sectorMap = new Map<string, { events: SignalEvent[]; outcomes: SignalOutcome[] }>()
    for (const e of brokerEvents) {
      if (!e.sectorId) continue
      const k = e.sectorId as unknown as string
      const bucket = sectorMap.get(k) ?? { events: [], outcomes: [] }
      bucket.events.push(e)
      bucket.outcomes.push(...(outcomesByEvent.get(e.id as unknown as string) ?? []))
      sectorMap.set(k, bucket)
    }
    const bySector: BrokerSectorBreakdown[] = []
    for (const [sid, bucket] of sectorMap) {
      const sectorAgg = aggregateByWindow(bucket.outcomes).find((w) => w.window === PRIMARY_WINDOW)!
      if (sectorAgg.sampleSize === 0) continue
      bySector.push({
        sectorId: sid as Broker['id'] as unknown as BrokerSectorBreakdown['sectorId'],
        sectorName: sectorById.get(sid)?.name ?? null,
        sampleSize: sectorAgg.sampleSize,
        hitRate: sectorAgg.hitRate,
        meanReturnPct: sectorAgg.meanReturnPct,
      })
    }
    bySector.sort((a, b) => b.sampleSize - a.sampleSize)

    // Long vs short hit-rate split.
    const longOutcomes = heldEvents.filter((e) => e.bookContext === 'held_long')
      .flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const shortOutcomes = heldEvents.filter((e) => e.bookContext === 'held_short')
      .flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const longAgg = aggregateByWindow(longOutcomes).find((w) => w.window === PRIMARY_WINDOW)!
    const shortAgg = aggregateByWindow(shortOutcomes).find((w) => w.window === PRIMARY_WINDOW)!

    // Against-position track record.
    const againstEvents = brokerEvents.filter((e) => e.kind === 'against_position_alert')
    const againstOutcomes = againstEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const againstAgg = aggregateByWindow(againstOutcomes).find((w) => w.window === PRIMARY_WINDOW)!

    const score = calibrationScore({
      hitRate: primary.hitRate,
      meanRelOrRaw: primary.meanRelReturnPct ?? primary.meanReturnPct,
      sampleSize: sample,
    })
    const confidence = bandFor(sample)
    const reasons = buildBrokerReasons({ score, confidence, sample, primary, bySector, againstAgg })

    out.push({
      orgId: inputs.orgId,
      brokerId: broker.id,
      brokerShortName: broker.shortName,
      sampleSize: sample,
      score,
      confidence,
      hitRate: primary.hitRate,
      meanReturnPct: primary.meanReturnPct,
      byWindow,
      heldByWindow,
      bySector,
      longHitRate: longAgg.directionalSampleSize >= 3 ? longAgg.hitRate : null,
      shortHitRate: shortAgg.directionalSampleSize >= 3 ? shortAgg.hitRate : null,
      againstPositionHitRate: againstAgg.hitRate,
      againstPositionSampleSize: againstAgg.sampleSize,
      reasons,
      generatedAt: inputs.now.toISOString(),
    })
  }

  // Sort by score desc; ties broken by sample size.
  out.sort((a, b) => (b.score - a.score) || (b.sampleSize - a.sampleSize))
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────

function emptyBrokerSummary(
  orgId: OrgId, broker: Broker, now: Date,
): BrokerCalibrationSummary {
  return {
    orgId,
    brokerId: broker.id,
    brokerShortName: broker.shortName,
    sampleSize: 0,
    score: 0,
    confidence: 'very_low',
    hitRate: null,
    meanReturnPct: 0,
    byWindow: aggregateByWindow([]),
    heldByWindow: aggregateByWindow([]),
    bySector: [],
    longHitRate: null,
    shortHitRate: null,
    againstPositionHitRate: null,
    againstPositionSampleSize: 0,
    reasons: [{ code: 'no_data', text: 'No events for this broker on the org yet.' }],
    generatedAt: now.toISOString(),
  }
}

function buildBrokerReasons(opts: {
  score: number
  confidence: 'very_low' | 'low' | 'medium' | 'high'
  sample: number
  primary: ReturnType<typeof aggregateByWindow>[number]
  bySector: readonly BrokerSectorBreakdown[]
  againstAgg: ReturnType<typeof aggregateByWindow>[number]
}): readonly CalibrationReason[] {
  const out: CalibrationReason[] = []
  if (opts.confidence === 'very_low' || opts.confidence === 'low') {
    out.push({ code: 'small_sample', text: `Only ${opts.sample} events at 5d — low confidence.` })
  }
  if (opts.primary.hitRate !== null) {
    if (opts.primary.hitRate >= 0.6) out.push({ code: 'strong_hit_rate', text: `Hit rate ${(opts.primary.hitRate * 100).toFixed(0)}% at 5d.` })
    else if (opts.primary.hitRate <= 0.4) out.push({ code: 'weak_hit_rate', text: `Hit rate only ${(opts.primary.hitRate * 100).toFixed(0)}% at 5d — fade signal.` })
  }
  if (opts.primary.meanRelReturnPct !== null) {
    const m = opts.primary.meanRelReturnPct
    if (Math.abs(m) >= 0.5) {
      out.push({
        code: 'mean_rel',
        text: `Mean benchmark-relative ${m > 0 ? '+' : ''}${m.toFixed(2)}% over 5d.`,
      })
    }
  }
  if (opts.bySector[0]?.sampleSize !== undefined && opts.bySector[0].sampleSize >= 5) {
    out.push({ code: 'sector_top', text: `Strongest sector: ${opts.bySector[0].sectorName ?? opts.bySector[0].sectorId} (n=${opts.bySector[0].sampleSize}).` })
  }
  if (opts.againstAgg.sampleSize >= 3 && opts.againstAgg.hitRate !== null) {
    out.push({
      code: 'against_position_track_record',
      text: `Against-position calls: ${(opts.againstAgg.hitRate * 100).toFixed(0)}% hit rate over n=${opts.againstAgg.sampleSize}.`,
    })
  }
  return out
}

function groupBy<T, K extends string>(items: readonly T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of items) {
    const k = keyFn(it)
    const arr = m.get(k) ?? []
    arr.push(it)
    m.set(k, arr)
  }
  return m
}
