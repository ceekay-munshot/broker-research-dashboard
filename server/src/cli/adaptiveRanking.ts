// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for the Module-23 calibration-aware ranking layer.
//
//   npm run ops -- adaptive:flags                          # caps + thresholds
//   npm run ops -- adaptive:inspect --broker=<id>          # what we'd nudge per source for this broker
//   npm run ops -- adaptive:preview [--limit=20]           # baseline vs adaptive ordering of recent reports
//   npm run ops -- adaptive:compare [--limit=20]           # rank-delta movers between baseline + adaptive
//
// All commands are read-only. Adjustments are computed on the fly from the
// current calibration snapshot + post-event reviews stored in the org. The
// engine itself is the same one the dashboard runs (see
// `src/engine/adaptiveRanking.ts`).
// ─────────────────────────────────────────────────────────────────────────

import type {
  OrgId, BrokerId, BrokerCalibrationSummary,
} from '../../../src/domain'
import {
  computeRankAdjustment, type RankAdjustment,
} from '../../../src/engine'
import type { HybridCanonicalStore } from '../persistence'

export interface AdaptiveCliFlags {
  readonly orgId: OrgId
  readonly brokerId?: string
  readonly limit?: number
}

export function cmdAdaptiveFlags(_flags: AdaptiveCliFlags): void {
  console.log('Module 23 — calibration-aware ranking flags + bounds')
  console.log('━'.repeat(72))
  console.log('Feature flags (set in .env / Vite env to activate):')
  console.log('  VITE_CALIBRATION_AWARE_RANKING=1   apply adjusted scores to ordering')
  console.log('  VITE_SHOW_RANKING_COMPARE=1        render rank-delta + cal-delta chips')
  console.log('  SERVER_CALIBRATION_AWARE_ALERTS=1  server-side digest re-ranking (placeholder)')
  console.log()
  console.log('Per-source nudge caps (max ± per source):')
  console.log('  broker_calibration              ±10')
  console.log('  alert_kind_effectiveness         ±8')
  console.log('  catalyst_type_performance        ±5')
  console.log('  post_event_broker_correctness    ±5')
  console.log()
  console.log('Hard global cap (sum over all sources, applied last):')
  console.log('  GLOBAL_CAP                      ±15')
  console.log()
  console.log('Confidence gates (sources below the gate are suppressed, not zeroed):')
  console.log('  broker_calibration               medium')
  console.log('  alert_kind_effectiveness         medium')
  console.log('  catalyst_type_performance        n ≥ 4 directional events')
  console.log('  post_event_broker_correctness    n ≥ 3 events for this broker')
  console.log('━'.repeat(72))
  console.log()
  console.log('All adjustments are deterministic functions of:')
  console.log('  baselineScore (per-surface) → adjustedScore = baseline + Σ source contributions, clamped.')
  console.log('Reasons are surfaced verbatim on every chip + tooltip.')
}

export function cmdAdaptiveInspect(flags: AdaptiveCliFlags, store: HybridCanonicalStore): void {
  if (!flags.brokerId) {
    console.error('adaptive:inspect requires --broker=<brokerId>')
    process.exit(2)
  }
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) {
    console.log('no calibration snapshot — run `calibration:recompute` first.')
    return
  }
  const reviews = store.listPostEventReviews(flags.orgId)
  const brokerId = flags.brokerId as unknown as BrokerId
  const summary: BrokerCalibrationSummary | undefined =
    snap.brokerCalibrations.find((b) => b.brokerId === brokerId)
  const broker = summary?.brokerShortName ?? (flags.brokerId as string)

  console.log('━'.repeat(72))
  console.log(`Adaptive-ranking inspection — broker ${broker}`)
  console.log('━'.repeat(72))
  console.log(`broker calibration: ${summary
    ? `score=${summary.score.toFixed(0)}  conf=${summary.confidence}  n=${summary.sampleSize}`
    : '(no calibration data for this broker)'}`)
  console.log(`post-event reviews available: ${reviews.length}`)
  console.log()

  // Show the adjustment that would apply at each baseline anchor (40, 60, 80).
  for (const baselineScore of [40, 60, 80]) {
    const adj = computeRankAdjustment({
      baselineScore,
      brokerId,
      alertKind: null,
      catalystType: null,
      calibration: snap,
      postEventReviews: reviews,
    })
    printAdjustment(`baseline=${baselineScore}`, adj)
  }
}

function printAdjustment(label: string, adj: RankAdjustment): void {
  const sign = adj.delta >= 0 ? '+' : ''
  console.log(`  ${label.padEnd(14)} → adjusted=${adj.adjustedScore.toFixed(1).padStart(6)}` +
    `  Δ=${sign}${adj.delta.toFixed(1).padStart(5)}  applied=${adj.applied}`)
  for (const r of adj.reasons) {
    console.log(`        + ${r.text}${r.clamped ? '  [clamped]' : ''}`)
  }
  for (const s of adj.suppressed) {
    console.log(`        · ${s.text}`)
  }
}

export function cmdAdaptivePreview(flags: AdaptiveCliFlags, store: HybridCanonicalStore): void {
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) { console.log('no calibration snapshot — run `calibration:recompute` first.'); return }
  const reviews = store.listPostEventReviews(flags.orgId)

  // Use recent reports as the surface to preview.
  const reports = store.listReports(flags.orgId)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, flags.limit ?? 50)

  if (reports.length === 0) { console.log('no reports'); return }

  const summaries = store.listSummaries(flags.orgId)
  const summaryByReport = new Map<string, typeof summaries[number]>()
  for (const s of summaries) summaryByReport.set(s.reportId as unknown as string, s)

  // Baseline = quick score that prefers Buy/Sell + recent + with target.
  const items = reports.map((r) => {
    const sum = summaryByReport.get(r.id as unknown as string) ?? null
    const stanceScore = sum?.stance === 'bullish' ? 30 : sum?.stance === 'bearish' ? 30 : 10
    const ratingScore = sum?.rating && sum.rating !== 'Hold' && sum.rating !== 'Not Rated' ? 20 : 5
    const tpScore = sum?.targetPrice ? 15 : 0
    const baseline = stanceScore + ratingScore + tpScore
    const adj = computeRankAdjustment({
      baselineScore: baseline,
      brokerId: r.brokerId,
      alertKind: null,
      catalystType: null,
      calibration: snap,
      postEventReviews: reviews,
    })
    return { report: r, baseline, adj }
  })

  const baselineSorted = [...items].sort((a, b) => b.baseline - a.baseline)
  const adaptiveSorted = [...items].sort((a, b) => b.adj.adjustedScore - a.adj.adjustedScore)
  const baseIdx = new Map<string, number>()
  baselineSorted.forEach((it, i) => baseIdx.set(it.report.id as unknown as string, i))
  const adaptIdx = new Map<string, number>()
  adaptiveSorted.forEach((it, i) => adaptIdx.set(it.report.id as unknown as string, i))

  console.log(`adaptive preview — ${items.length} recent reports, org=${flags.orgId as unknown as string}`)
  console.log(`(snapshot generatedAt=${snap.generatedAt}  brokers=${snap.brokerCalibrations.length})`)
  console.log()
  console.log('rank | base | adj  | Δ    | broker          | report')
  console.log('-----+------+------+------+-----------------+'.padEnd(120, '-'))
  for (const it of adaptiveSorted) {
    const id = it.report.id as unknown as string
    const baseRank = baseIdx.get(id) ?? -1
    const adaptRank = adaptIdx.get(id) ?? -1
    const move = baseRank - adaptRank
    const moveStr = move > 0 ? `▲${move}` : move < 0 ? `▼${Math.abs(move)}` : '▬'
    console.log(
      `${String(adaptRank + 1).padStart(3)}  | ${String(it.baseline).padStart(4)} | ${
        it.adj.adjustedScore.toFixed(1).padStart(4)} | ${
        (it.adj.delta >= 0 ? '+' : '') + it.adj.delta.toFixed(1).padStart(4)} | ${
        moveStr.padEnd(15)} | ${(it.report.title as string).slice(0, 64)}`,
    )
  }
}

export function cmdAdaptiveCompare(flags: AdaptiveCliFlags, store: HybridCanonicalStore): void {
  const snap = store.latestCalibrationSnapshot(flags.orgId)
  if (!snap) { console.log('no calibration snapshot — run `calibration:recompute` first.'); return }
  const reviews = store.listPostEventReviews(flags.orgId)

  const reports = store.listReports(flags.orgId)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, flags.limit ?? 100)
  const summaries = store.listSummaries(flags.orgId)
  const summaryByReport = new Map<string, typeof summaries[number]>()
  for (const s of summaries) summaryByReport.set(s.reportId as unknown as string, s)

  type Row = {
    reportId: string
    brokerId: BrokerId
    title: string
    baseline: number
    adjusted: number
    delta: number
    reasonChips: readonly string[]
  }

  const rows: Row[] = []
  for (const r of reports) {
    const sum = summaryByReport.get(r.id as unknown as string) ?? null
    const stanceScore = sum?.stance === 'bullish' ? 30 : sum?.stance === 'bearish' ? 30 : 10
    const ratingScore = sum?.rating && sum.rating !== 'Hold' && sum.rating !== 'Not Rated' ? 20 : 5
    const tpScore = sum?.targetPrice ? 15 : 0
    const baseline = stanceScore + ratingScore + tpScore
    const adj = computeRankAdjustment({
      baselineScore: baseline,
      brokerId: r.brokerId,
      alertKind: null,
      catalystType: null,
      calibration: snap,
      postEventReviews: reviews,
    })
    rows.push({
      reportId: r.id as unknown as string,
      brokerId: r.brokerId,
      title: r.title,
      baseline,
      adjusted: adj.adjustedScore,
      delta: adj.delta,
      reasonChips: adj.reasons.map((rr) => rr.text),
    })
  }

  const baselineSorted = [...rows].sort((a, b) => b.baseline - a.baseline)
  const adaptiveSorted = [...rows].sort((a, b) => b.adjusted - a.adjusted)
  const baseIdx = new Map<string, number>()
  baselineSorted.forEach((it, i) => baseIdx.set(it.reportId, i))
  const adaptIdx = new Map<string, number>()
  adaptiveSorted.forEach((it, i) => adaptIdx.set(it.reportId, i))

  let topMoversUp = 0, topMoversDown = 0, top10Changed = 0, top5Changed = 0
  const top5Adapt = new Set(adaptiveSorted.slice(0, 5).map((it) => it.reportId))
  const top5Base = new Set(baselineSorted.slice(0, 5).map((it) => it.reportId))
  const top10Adapt = new Set(adaptiveSorted.slice(0, 10).map((it) => it.reportId))
  const top10Base = new Set(baselineSorted.slice(0, 10).map((it) => it.reportId))
  for (const id of top5Adapt) if (!top5Base.has(id)) top5Changed++
  for (const id of top10Adapt) if (!top10Base.has(id)) top10Changed++

  const movers = rows
    .map((it) => ({
      ...it,
      rankDelta: (baseIdx.get(it.reportId) ?? 0) - (adaptIdx.get(it.reportId) ?? 0),
    }))
    .filter((it) => Math.abs(it.rankDelta) > 0)
    .sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta))

  for (const m of movers) {
    if (m.rankDelta > 0) topMoversUp++
    else topMoversDown++
  }

  console.log('━'.repeat(72))
  console.log(`adaptive compare — org=${flags.orgId as unknown as string}  reports=${rows.length}`)
  console.log(`top-5 changes:  ${top5Changed}/5    top-10 changes: ${top10Changed}/10`)
  console.log(`movers up:      ${topMoversUp}    movers down: ${topMoversDown}    unchanged: ${rows.length - movers.length}`)
  console.log('━'.repeat(72))
  console.log()
  console.log('biggest movers (top 20 by |rank Δ|):')
  for (const m of movers.slice(0, 20)) {
    const arrow = m.rankDelta > 0 ? '▲' : '▼'
    console.log(
      `  ${arrow}${String(Math.abs(m.rankDelta)).padStart(3)}` +
      `  base#${String((baseIdx.get(m.reportId) ?? 0) + 1).padStart(3)}` +
      ` → adj#${String((adaptIdx.get(m.reportId) ?? 0) + 1).padStart(3)}` +
      `  Δ${(m.delta >= 0 ? '+' : '') + m.delta.toFixed(1).padStart(4)}` +
      `  ${m.title.slice(0, 60)}`,
    )
    for (const r of m.reasonChips.slice(0, 2)) {
      console.log(`        · ${r}`)
    }
  }
}
