// Build a deterministic pre-event brief for one catalyst.
//
// Sections + bullets are derived from the snapshot + delta + canonical
// research feed. Optional LLM prose enrichment runs separately (see
// `prose.ts`) and never participates in section selection.

import type {
  AlertEvent, BrokerStockOpinion, ResearchReport, ReportSummary,
  CatalystEvent, EventExpectationDelta, EventRiskFlag,
  ExpectationSnapshot, OrgId, PreEventBrief, PreEventBriefSection,
  PortfolioSnapshot, AlertId, ReportId,
  CalibrationSnapshot,
} from '../../../src/domain'
import { asPreEventBriefId } from '../../../src/lib/ids'

const DAY_MS = 86400e3

export interface BuildBriefInputs {
  readonly orgId: OrgId
  readonly catalyst: CatalystEvent
  readonly snapshot: ExpectationSnapshot
  readonly delta7d: EventExpectationDelta | null
  readonly delta30d: EventExpectationDelta | null
  readonly portfolio: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly alerts: readonly AlertEvent[]
  readonly calibration: CalibrationSnapshot | null
  readonly riskFlags: readonly EventRiskFlag[]
  readonly now: Date
}

export function buildPreEventBrief(inputs: BuildBriefInputs): PreEventBrief {
  const ticker = inputs.catalyst.ticker
  const tickerStr = ticker as unknown as string
  const tickerReports = inputs.reports
    .filter((r) => r.tickers.some((t) => (t as string) === tickerStr))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const summaryByReport = new Map(inputs.summaries.map((s) => [s.reportId as string, s]))
  const tickerAlerts = inputs.alerts
    .filter((a) => !a.suppressed && a.lineage.ticker === ticker)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))

  const daysUntilEvent = Math.round((Date.parse(inputs.catalyst.expectedAt) - inputs.now.getTime()) / DAY_MS)
  const heldEntry = inputs.portfolio?.positions.find((p) => p.ticker === ticker) ?? null
  const watchEntry = inputs.portfolio?.watchlist.find((w) => w.ticker === ticker) ?? null

  const sections: PreEventBriefSection[] = []

  // 1. Event summary.
  sections.push({
    key: 'event_summary',
    title: 'Event summary',
    subtitle: `${inputs.catalyst.headline} · ${inputs.catalyst.expectedDate}`,
    prose: inputs.catalyst.description,
    proseFromLlm: false,
    reportIds: [],
    alertIds: [],
    bullets: [
      `Type: ${inputs.catalyst.type.replace(/_/g, ' ')}`,
      `Importance: ${inputs.catalyst.importance}`,
      `Source: ${inputs.catalyst.source.label} (confidence ${(inputs.catalyst.source.confidence * 100).toFixed(0)}%)`,
      ...(inputs.catalyst.status === 'estimated' ? ['Date is upstream estimate — confirm before relying on time-of-day.'] : []),
    ],
  })

  // 2. Why it matters.
  const whyBullets: string[] = []
  if (heldEntry) {
    whyBullets.push(`Held ${heldEntry.direction}${heldEntry.weightPct !== null ? ` · ${heldEntry.weightPct.toFixed(1)}% weight` : ''}${heldEntry.conviction === 'high' ? ' · high conviction' : ''}.`)
    if (heldEntry.note) whyBullets.push(`PM note: "${heldEntry.note}"`)
  } else if (watchEntry) {
    whyBullets.push('On watchlist.')
    if (watchEntry.note) whyBullets.push(`PM note: "${watchEntry.note}"`)
  } else {
    whyBullets.push('Not currently in book or watchlist.')
  }
  if (inputs.snapshot.hasDivergence) whyBullets.push('Street is diverging into the event.')
  if (inputs.riskFlags.includes('against_position_pressure')) whyBullets.push('Recent against-position alerts cluster on this name.')
  if (inputs.riskFlags.includes('thin_coverage')) whyBullets.push('Coverage is thin into the event — read carefully.')
  if (inputs.riskFlags.includes('high_calibration_brokers_silent')) whyBullets.push('Top calibrated brokers have not published recently.')
  sections.push({
    key: 'why_it_matters',
    title: 'Why it matters to the book',
    subtitle: 'Position context + immediate risk surface.',
    prose: null,
    proseFromLlm: false,
    reportIds: [],
    alertIds: [],
    bullets: whyBullets,
  })

  // 3. Expectation snapshot — bullets list a few top opinions.
  const snapBullets = [
    inputs.snapshot.tiltSummary,
    inputs.snapshot.avgTargetPrice !== null
      ? `Avg target ${formatPrice(inputs.snapshot.avgTargetPrice)} (median ${formatPrice(inputs.snapshot.medianTargetPrice ?? inputs.snapshot.avgTargetPrice)}, spread ${inputs.snapshot.targetSpreadPct === null ? '—' : `${inputs.snapshot.targetSpreadPct.toFixed(0)}%`}).`
      : 'No active price target on record.',
    inputs.snapshot.avgImpliedUpsidePct !== null
      ? `Avg implied upside ${inputs.snapshot.avgImpliedUpsidePct >= 0 ? '+' : ''}${inputs.snapshot.avgImpliedUpsidePct.toFixed(1)}%.`
      : 'No implied-upside data.',
    `${inputs.snapshot.distinctBrokers} brokers active on the name.`,
  ]
  for (const o of inputs.snapshot.opinions.slice(0, 4)) {
    const calibration = o.calibrationScore !== null && o.calibrationConfidence !== 'very_low' && o.calibrationConfidence !== 'low'
      ? ` · cal ${o.calibrationScore >= 0 ? '+' : ''}${o.calibrationScore.toFixed(0)}`
      : ''
    snapBullets.push(`${o.brokerShortName}: ${o.rating ?? '—'} · ${o.stance}${o.targetPrice !== null ? ` · ${formatPrice(o.targetPrice)}` : ''}${calibration}.`)
  }
  sections.push({
    key: 'expectation_snapshot',
    title: 'Latest broker expectation snapshot',
    subtitle: "What our ingested broker set is currently saying into the event.",
    prose: null,
    proseFromLlm: false,
    reportIds: [],
    alertIds: [],
    bullets: snapBullets,
  })

  // 4. Recent changes — pull from delta + recent target/rating moves.
  const changeBullets: string[] = []
  if (inputs.delta7d) {
    if (inputs.delta7d.stanceShift !== 'flat') changeBullets.push(`7d stance shift: ${inputs.delta7d.stanceShift.replace('_', ' ')}.`)
    for (const r of inputs.delta7d.reasons) changeBullets.push(`7d · ${r.text}`)
  }
  if (inputs.delta30d) {
    if (inputs.delta30d.stanceShift !== 'flat') changeBullets.push(`30d stance shift: ${inputs.delta30d.stanceShift.replace('_', ' ')}.`)
    if (inputs.delta30d.coverageIntensityDelta !== 0) {
      changeBullets.push(`30d · coverage breadth Δ ${inputs.delta30d.coverageIntensityDelta >= 0 ? '+' : ''}${inputs.delta30d.coverageIntensityDelta} brokers.`)
    }
  }
  if (changeBullets.length === 0) changeBullets.push('No material changes vs prior snapshot.')
  sections.push({
    key: 'recent_changes',
    title: 'Recent changes into the event',
    subtitle: '7d and 30d expectation deltas.',
    prose: null,
    proseFromLlm: false,
    reportIds: [],
    alertIds: [],
    bullets: changeBullets,
  })

  // 5. Unresolved questions — driven by closures + against-position alerts.
  const unresolvedBullets: string[] = []
  const recentAgainstAlerts = tickerAlerts.filter((a) => a.kind === 'against_position').slice(0, 3)
  for (const a of recentAgainstAlerts) {
    unresolvedBullets.push(a.headline)
  }
  if (inputs.snapshot.hasDivergence && unresolvedBullets.length === 0) {
    unresolvedBullets.push('Street has unresolved divergence on this name (see Divergence tab).')
  }
  if (unresolvedBullets.length === 0) unresolvedBullets.push('No outstanding divergence or against-position pressure.')
  sections.push({
    key: 'unresolved_questions',
    title: 'Unresolved questions / divergence',
    subtitle: 'What the Street is fighting about right now.',
    prose: null,
    proseFromLlm: false,
    reportIds: [],
    alertIds: recentAgainstAlerts.map((a): AlertId => a.id),
    bullets: unresolvedBullets,
  })

  // 6. Top reads — most recent reports on the ticker, ranked by broker
  //    calibration when available, then recency.
  const topRead: { reportId: ReportId; bullet: string; calScore: number; receivedAt: string }[] = []
  for (const r of tickerReports.slice(0, 12)) {
    const sum = summaryByReport.get(r.id as string)
    const cal = inputs.calibration?.brokerCalibrations.find((b) => b.brokerId === r.brokerId)
    const calScore = cal?.score ?? 0
    const stance = sum?.stance ?? 'neutral'
    const tgt = sum?.targetPrice !== null && sum?.targetPrice !== undefined ? formatPrice(sum.targetPrice) : '—'
    topRead.push({
      reportId: r.id,
      receivedAt: r.receivedAt,
      calScore,
      bullet: `${r.title}  · ${stance}  · target ${tgt}  · ${r.receivedAt.slice(5, 10)}`,
    })
  }
  topRead.sort((a, b) => (b.calScore - a.calScore) || b.receivedAt.localeCompare(a.receivedAt))
  const topReadIds: ReportId[] = topRead.slice(0, 5).map((x) => x.reportId)
  sections.push({
    key: 'top_reads',
    title: 'Top reports to read before the event',
    subtitle: 'Ranked by broker calibration where available, then recency.',
    prose: null,
    proseFromLlm: false,
    reportIds: topReadIds,
    alertIds: [],
    bullets: topRead.slice(0, 5).map((x) => x.bullet),
  })

  // 7. Calibration context — top brokers covering the name.
  const calBullets: string[] = []
  const tickerBrokers = new Set(inputs.snapshot.opinions.map((o) => o.brokerId as string))
  const relevantCalibrations = (inputs.calibration?.brokerCalibrations ?? [])
    .filter((b) => tickerBrokers.has(b.brokerId as string) && b.sampleSize > 0)
    .sort((a, b) => b.score - a.score)
  for (const b of relevantCalibrations.slice(0, 5)) {
    calBullets.push(`${b.brokerShortName}: score ${b.score >= 0 ? '+' : ''}${b.score.toFixed(0)} · n=${b.sampleSize} · ${b.confidence}`)
  }
  if (calBullets.length === 0) calBullets.push('No calibration coverage on this broker set yet — interpret with care.')
  sections.push({
    key: 'calibration_context',
    title: 'Calibration context on covering brokers',
    subtitle: 'How the brokers covering this name have actually performed historically on the org.',
    prose: null,
    proseFromLlm: false,
    reportIds: [],
    alertIds: [],
    bullets: calBullets,
  })

  // 8. Risk flags.
  if (inputs.riskFlags.length > 0) {
    sections.push({
      key: 'risk_flags',
      title: 'Risk flags into the event',
      subtitle: 'Auto-detected concerns from the canonical state.',
      prose: null,
      proseFromLlm: false,
      reportIds: [],
      alertIds: [],
      bullets: inputs.riskFlags.map(prettyRiskFlag),
    })
  }

  return {
    id: asPreEventBriefId(`brief_${inputs.orgId as unknown as string}_${inputs.catalyst.id as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`),
    orgId: inputs.orgId,
    catalystId: inputs.catalyst.id,
    generatedAt: inputs.now.toISOString(),
    daysUntilEvent,
    snapshot: inputs.snapshot,
    delta7d: inputs.delta7d,
    delta30d: inputs.delta30d,
    sections,
    riskFlags: inputs.riskFlags,
    executiveSummary: defaultExecutiveSummary(inputs, daysUntilEvent),
    executiveSummaryFromLlm: false,
  }
}

function formatPrice(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function prettyRiskFlag(f: EventRiskFlag): string {
  switch (f) {
    case 'thin_coverage':                     return 'Thin coverage on the name into the event.'
    case 'widening_divergence':               return 'Street view dispersing as the event approaches.'
    case 'against_position_pressure':         return 'Recent against-position alerts cluster on this name.'
    case 'stale_coverage':                    return 'No recent broker note on the name in the staleness window.'
    case 'high_calibration_brokers_silent':   return 'Top-calibrated brokers haven’t published recently.'
    case 'outlier_active':                    return 'A high-calibration broker is currently an outlier.'
  }
}

function defaultExecutiveSummary(inputs: BuildBriefInputs, daysUntil: number): string {
  const tk = inputs.catalyst.ticker as unknown as string
  const days = daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` :
               daysUntil === 0 ? 'today' :
               daysUntil === 1 ? 'tomorrow' :
               `in ${daysUntil}d`
  const heldNote = inputs.portfolio?.positions.find((p) => p.ticker === inputs.catalyst.ticker)
    ? 'on the book'
    : inputs.portfolio?.watchlist.find((w) => w.ticker === inputs.catalyst.ticker)
      ? 'on the watchlist'
      : null
  const tilt = inputs.snapshot.tiltSummary
  const flagsText = inputs.riskFlags.length > 0 ? ` Flags: ${inputs.riskFlags.length}.` : ''
  return `${tk} ${inputs.catalyst.headline.replace(`${tk} — `, '').toLowerCase()} ${days}${heldNote ? `, ${heldNote}` : ''}. ${tilt}${flagsText}`
}
