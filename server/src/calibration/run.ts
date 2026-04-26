// Orchestrator: derive events, compute outcomes, build broker calibration
// + alert effectiveness + per-ticker coverage signals, materialize a
// snapshot, and persist.

import type {
  CalibrationSnapshot, CoverageSignalResult, SignalOutcome,
  StockTicker, BrokerCalibrationSummary,
  CalibrationReason,
} from '../../../src/domain'
import { asCalibrationSnapshotId } from '../../../src/lib/ids'
import { deriveSignalEvents } from './events'
import { computeOutcomes } from './outcomes'
import { buildBrokerCalibrations } from './brokerCalibration'
import { buildAlertEffectiveness } from './alertEffectiveness'
import { aggregateByWindow, bandFor, calibrationScore } from './eventStudy'
import type { CalibrationInputs, CalibrationPersistence, CalibrationRunResult } from './types'

export const METHODOLOGY_VERSION = 'v1.0'

export async function runCalibration(
  inputs: CalibrationInputs,
  persistence: CalibrationPersistence,
  source: CalibrationSnapshot['source'] = 'cli',
): Promise<CalibrationRunResult> {
  const events = deriveSignalEvents({
    orgId: inputs.orgId,
    snapshot: inputs.snapshot,
    reports: inputs.reports,
    summaries: inputs.summaries,
    opinions: inputs.opinions,
    alerts: inputs.alerts,
    stocks: inputs.stocks,
  })
  const outcomes = computeOutcomes(events, inputs.market)

  const brokers = buildBrokerCalibrations({
    orgId: inputs.orgId,
    events,
    outcomes,
    brokers: inputs.brokers,
    sectors: [], // sectors fetched lazily — broker calibration only uses sectorId labels
    now: inputs.now,
  })

  const alerts = buildAlertEffectiveness(inputs.orgId, events, outcomes, inputs.now)

  const coverage = buildCoverageResults({
    events, outcomes, brokers,
    now: inputs.now,
    orgId: inputs.orgId,
  })

  const directionalEvents = events.filter((e) => e.expectedDirection !== null).length
  const priceCoveredTickers = new Set(events
    .filter((e) => outcomes.some((o) => (o.eventId as unknown as string) === (e.id as unknown as string)))
    .map((e) => e.ticker as unknown as string)).size
  const benchmarkCoveredTickers = new Set(outcomes
    .filter((o) => o.benchmarkId !== null)
    .map((o) => {
      const ev = events.find((e) => e.id === o.eventId)
      return ev?.ticker as unknown as string
    })
    .filter((x): x is string => typeof x === 'string')).size
  const skippedNoPrice = events.filter((e) => !outcomes.some((o) => (o.eventId as unknown as string) === (e.id as unknown as string))).length

  const snapshot: CalibrationSnapshot = {
    id: asCalibrationSnapshotId(`calsnap_${inputs.orgId as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`),
    orgId: inputs.orgId,
    generatedAt: inputs.now.toISOString(),
    methodologyVersion: METHODOLOGY_VERSION,
    source,
    brokerCalibrations: brokers,
    alertEffectiveness: alerts,
    coverageByTicker: coverage,
    counters: {
      events: events.length,
      outcomes: outcomes.length,
      directionalEvents,
      priceCoveredTickers,
      benchmarkCoveredTickers,
      skippedNoPrice,
    },
  }
  persistence.upsertSnapshot(snapshot)

  return { events, outcomes, brokers, alerts, coverage, snapshot }
}

// ── Per-ticker coverage signal ──────────────────────────────────────────

interface BuildCoverageInputs {
  readonly orgId: CalibrationSnapshot['orgId']
  readonly events: ReturnType<typeof deriveSignalEvents>
  readonly outcomes: readonly SignalOutcome[]
  readonly brokers: readonly BrokerCalibrationSummary[]
  readonly now: Date
}

function buildCoverageResults(inputs: BuildCoverageInputs): readonly CoverageSignalResult[] {
  const tickerSet = new Set<string>()
  for (const e of inputs.events) tickerSet.add(e.ticker as unknown as string)

  const outcomesByEvent = new Map<string, SignalOutcome[]>()
  for (const o of inputs.outcomes) {
    const k = o.eventId as unknown as string
    const arr = outcomesByEvent.get(k) ?? []
    arr.push(o)
    outcomesByEvent.set(k, arr)
  }

  const out: CoverageSignalResult[] = []
  for (const t of tickerSet) {
    const tickerEvents = inputs.events.filter((e) => (e.ticker as unknown as string) === t)
    const tickerOutcomes = tickerEvents.flatMap((e) => outcomesByEvent.get(e.id as unknown as string) ?? [])
    const agg = aggregateByWindow(tickerOutcomes).find((w) => w.window === '5d')!
    const sample = agg.sampleSize
    const reasons: CalibrationReason[] = []
    if (sample < 5) reasons.push({ code: 'small_sample', text: `Only ${sample} events at 5d — low confidence.` })

    // Top brokers on this ticker.
    const brokerBuckets = new Map<string, { events: ReturnType<typeof deriveSignalEvents>[number][]; outcomes: SignalOutcome[] }>()
    for (const e of tickerEvents) {
      if (!e.brokerId) continue
      const k = e.brokerId as unknown as string
      const bucket = brokerBuckets.get(k) ?? { events: [], outcomes: [] }
      bucket.events.push(e)
      bucket.outcomes.push(...(outcomesByEvent.get(e.id as unknown as string) ?? []))
      brokerBuckets.set(k, bucket)
    }
    const topBrokers: Array<CoverageSignalResult['topBrokers'][number]> = []
    for (const [bid, bucket] of brokerBuckets) {
      const bAgg = aggregateByWindow(bucket.outcomes).find((w) => w.window === '5d')!
      if (bAgg.sampleSize < 3) continue
      const score = calibrationScore({
        hitRate: bAgg.hitRate,
        meanRelOrRaw: bAgg.meanRelReturnPct ?? bAgg.meanReturnPct,
        sampleSize: bAgg.sampleSize,
      })
      const broker = inputs.brokers.find((br) => (br.brokerId as unknown as string) === bid)
      topBrokers.push({
        brokerId: bid as unknown as CoverageSignalResult['topBrokers'][number]['brokerId'],
        brokerShortName: broker?.brokerShortName ?? bid,
        sampleSize: bAgg.sampleSize,
        score,
        hitRate: bAgg.hitRate,
      })
    }
    topBrokers.sort((a, b) => b.score - a.score)

    out.push({
      orgId: inputs.orgId,
      ticker: t as StockTicker,
      sampleSize: sample,
      score: sample === 0 ? null : calibrationScore({
        hitRate: agg.hitRate,
        meanRelOrRaw: agg.meanRelReturnPct ?? agg.meanReturnPct,
        sampleSize: sample,
      }),
      confidence: bandFor(sample),
      hitRate: agg.hitRate,
      meanReturnPct: agg.meanReturnPct,
      topBrokers: topBrokers.slice(0, 5),
      recentAlertEffectivenessNote: null,
      reasons,
      generatedAt: inputs.now.toISOString(),
    })
  }
  out.sort((a, b) => (b.sampleSize - a.sampleSize))
  return out
}
