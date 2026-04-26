// Operator CLI subcommands for the calibration layer.
//
//   npm run ops -- calibration:snapshot   --org=org_aranya
//   npm run ops -- calibration:recompute  --org=org_aranya
//   npm run ops -- calibration:brokers    --org=org_aranya [--limit=10] [--bottom]
//   npm run ops -- calibration:alerts     --org=org_aranya
//   npm run ops -- calibration:coverage   --org=org_aranya --ticker=TCS
//   npm run ops -- calibration:compare    --org=org_aranya --before=<snapshotId> --after=<snapshotId>
//   npm run ops -- calibration:low-sample --org=org_aranya
//
// All commands run against the persistent store + Repo. `recompute`
// re-runs the engine against the canonical store + market provider and
// upserts a fresh snapshot.

import type {
  OrgId, BrokerCalibrationSummary, AlertEffectivenessSummary,
  CalibrationSnapshotId, StockTicker,
} from '../../../src/domain'
import { asCalibrationSnapshotId, asTicker } from '../../../src/lib/ids'
import type { HybridCanonicalStore } from '../persistence'
import { runCalibrationForStore } from '../calibration/bootstrap'

export interface CalibrationCliFlags {
  readonly orgId: OrgId
  readonly limit?: number
  readonly bottom?: boolean
  readonly ticker?: string
  readonly before?: string
  readonly after?: string
}

export async function cmdCalibrationSnapshot(flags: CalibrationCliFlags, store: HybridCanonicalStore): Promise<void> {
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) {
    console.log(`[calibration] no snapshot for ${flags.orgId as unknown as string}; run "calibration:recompute" first.`)
    return
  }
  console.log('━'.repeat(72))
  console.log(`Calibration snapshot   id=${snap.id as unknown as string}`)
  console.log(`org=${snap.orgId as unknown as string}   methodology=${snap.methodologyVersion}   source=${snap.source}`)
  console.log(`generatedAt=${snap.generatedAt}`)
  console.log()
  console.log(`events=${snap.counters.events}  outcomes=${snap.counters.outcomes}  directional=${snap.counters.directionalEvents}`)
  console.log(`priceCovered=${snap.counters.priceCoveredTickers}  benchmarkCovered=${snap.counters.benchmarkCoveredTickers}  skippedNoPrice=${snap.counters.skippedNoPrice}`)
  console.log(`brokers=${snap.brokerCalibrations.length}  alertKinds=${snap.alertEffectiveness.length}  tickers=${snap.coverageByTicker.length}`)
  console.log('━'.repeat(72))
}

export async function cmdCalibrationRecompute(flags: CalibrationCliFlags, store: HybridCanonicalStore): Promise<void> {
  const summary = await runCalibrationForStore(store, [flags.orgId], 'cli')
  for (const s of summary) {
    console.log(`[calibration:recompute] org=${s.orgId as unknown as string}  events=${s.events}  outcomes=${s.outcomes}  brokers=${s.brokers}  alertKinds=${s.alertKinds}`)
  }
}

export function cmdCalibrationBrokers(flags: CalibrationCliFlags, store: HybridCanonicalStore): void {
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) { console.log('no snapshot'); return }
  const sorted = [...snap.brokerCalibrations].filter((b) => b.sampleSize > 0)
  if (flags.bottom) sorted.reverse()
  const limit = flags.limit ?? 10
  console.log('broker'.padEnd(28) + 'n'.padStart(5) + 'hit'.padStart(6) + 'mean'.padStart(8) + 'score'.padStart(8) + '  conf')
  for (const b of sorted.slice(0, limit)) {
    const hit = b.hitRate === null ? '—' : `${(b.hitRate * 100).toFixed(0)}%`
    console.log(
      `${b.brokerShortName.padEnd(28)}${String(b.sampleSize).padStart(5)}${hit.padStart(6)}${
        (b.meanReturnPct >= 0 ? '+' : '') + b.meanReturnPct.toFixed(2) + '%'}`.padStart(8) +
      `${b.score.toFixed(0)}`.padStart(8) + `  ${b.confidence}`,
    )
  }
}

export function cmdCalibrationAlerts(_flags: CalibrationCliFlags, store: HybridCanonicalStore): void {
  const snap = store.latestCalibrationSnapshot(_flags.orgId)
  if (!snap) { console.log('no snapshot'); return }
  console.log('alert kind'.padEnd(36) + 'n'.padStart(5) + 'hit'.padStart(6) + 'mean'.padStart(8) + 'score'.padStart(8) + '  conf')
  for (const a of snap.alertEffectiveness) {
    if (a.sampleSize === 0) continue
    const hit = a.hitRate === null ? '—' : `${(a.hitRate * 100).toFixed(0)}%`
    console.log(
      `${a.kind.padEnd(36)}${String(a.sampleSize).padStart(5)}${hit.padStart(6)}${
        (a.meanReturnPct >= 0 ? '+' : '') + a.meanReturnPct.toFixed(2) + '%'}`.padStart(8) +
      `${a.score.toFixed(0)}`.padStart(8) + `  ${a.confidence}`,
    )
  }
}

export function cmdCalibrationCoverage(flags: CalibrationCliFlags, store: HybridCanonicalStore): void {
  if (!flags.ticker) { console.error('calibration:coverage requires --ticker=<ticker>'); process.exit(2) }
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) { console.log('no snapshot'); return }
  const t: StockTicker = asTicker(flags.ticker)
  const c = snap.coverageByTicker.find((x) => x.ticker === t)
  if (!c) { console.log(`no coverage for ${flags.ticker}`); return }
  console.log(`${c.ticker as unknown as string}  n=${c.sampleSize}  hit=${c.hitRate === null ? '—' : (c.hitRate * 100).toFixed(0) + '%'}  mean=${c.meanReturnPct.toFixed(2)}%  score=${c.score === null ? '—' : c.score.toFixed(0)}  conf=${c.confidence}`)
  console.log('top brokers on this ticker:')
  for (const b of c.topBrokers) {
    console.log(`  ${b.brokerShortName.padEnd(24)} n=${b.sampleSize}  hit=${b.hitRate === null ? '—' : (b.hitRate * 100).toFixed(0) + '%'}  score=${b.score.toFixed(0)}`)
  }
  for (const r of c.reasons) console.log(`  · ${r.text}`)
}

export function cmdCalibrationCompare(flags: CalibrationCliFlags, store: HybridCanonicalStore): void {
  if (!flags.before || !flags.after) {
    console.error('calibration:compare requires --before=<snapshotId> --after=<snapshotId>')
    process.exit(2)
  }
  const a = store.getCalibrationSnapshot(flags.orgId, asCalibrationSnapshotId(flags.before))
  const b = store.getCalibrationSnapshot(flags.orgId, asCalibrationSnapshotId(flags.after))
  if (!a || !b) { console.error('one or both snapshots not found'); process.exit(2) }
  console.log(`A  ${a.id as unknown as string}  ${a.generatedAt}  events=${a.counters.events}  brokers=${a.brokerCalibrations.length}`)
  console.log(`B  ${b.id as unknown as string}  ${b.generatedAt}  events=${b.counters.events}  brokers=${b.brokerCalibrations.length}`)
  console.log()
  console.log('per-broker score Δ:')
  for (const after of b.brokerCalibrations) {
    const before: BrokerCalibrationSummary | undefined = a.brokerCalibrations.find((x) => x.brokerId === after.brokerId)
    if (!before) continue
    const delta = after.score - before.score
    if (Math.abs(delta) < 1) continue
    console.log(`  ${after.brokerShortName.padEnd(28)} ${before.score.toFixed(0).padStart(5)} → ${after.score.toFixed(0).padStart(5)}  (${delta >= 0 ? '+' : ''}${delta.toFixed(0)})`)
  }
  console.log()
  console.log('per-alert-kind score Δ:')
  for (const after of b.alertEffectiveness) {
    const before: AlertEffectivenessSummary | undefined = a.alertEffectiveness.find((x) => x.kind === after.kind)
    if (!before) continue
    const delta = after.score - before.score
    if (Math.abs(delta) < 1) continue
    console.log(`  ${after.kind.padEnd(36)} ${before.score.toFixed(0).padStart(5)} → ${after.score.toFixed(0).padStart(5)}  (${delta >= 0 ? '+' : ''}${delta.toFixed(0)})`)
  }
}

export function cmdCalibrationLowSample(flags: CalibrationCliFlags, store: HybridCanonicalStore): void {
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) { console.log('no snapshot'); return }
  const lowBrokers = snap.brokerCalibrations.filter((b) => b.confidence === 'very_low' || b.confidence === 'low')
  const lowAlerts = snap.alertEffectiveness.filter((a) => a.sampleSize > 0 && (a.confidence === 'very_low' || a.confidence === 'low'))
  console.log(`${lowBrokers.length} low-confidence brokers:`)
  for (const b of lowBrokers) {
    console.log(`  ${b.brokerShortName.padEnd(28)} n=${b.sampleSize} score=${b.score.toFixed(0)} (${b.confidence})`)
  }
  console.log()
  console.log(`${lowAlerts.length} low-confidence alert kinds:`)
  for (const a of lowAlerts) {
    console.log(`  ${a.kind.padEnd(36)} n=${a.sampleSize} score=${a.score.toFixed(0)} (${a.confidence})`)
  }
}

// Reserved exports
export type { CalibrationSnapshotId }
