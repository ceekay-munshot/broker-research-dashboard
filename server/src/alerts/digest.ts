// Deterministic digest builder.
//
// Given the alert feed for an org + a digest kind + a window, produces:
//   - Morning Book Brief: top items on the book today + significant
//     changes (7d) + unresolved divergence + watchlist fresh + stale.
//   - Intraday Critical: critical/high alerts in the last 4h.
//   - Coverage Hygiene: stale-coverage and outlier alerts only.
//
// Sections are ordered by importance. Each section has a deterministic
// fallback prose; the optional LLM enrichment (see `prose.ts`) can
// replace section.prose without changing alertId selection.

import type {
  AlertEvent, AlertDigest, DigestKind, DigestSection, AlertSeverity,
  AlertId, OrgId, DigestRunId,
} from '../../../src/domain'
import { asDigestId } from '../../../src/lib/ids'
import { severityRank } from './severity'

const HOUR_MS = 3600e3
const DAY_MS = 86400e3

const KIND_LABEL: Record<DigestKind, { title: string; subtitle: string }> = {
  morning_brief: {
    title: 'Morning Book Brief',
    subtitle: "Today's portfolio-aware reading list, ranked deterministically.",
  },
  intraday_critical: {
    title: 'Intraday Critical Feed',
    subtitle: 'Critical and high-severity alerts on the book in the last few hours.',
  },
  coverage_hygiene: {
    title: 'Coverage Hygiene Digest',
    subtitle: 'Stale, thin, or outlier coverage on the book. Risk surface.',
  },
}

export interface BuildDigestInputs {
  readonly orgId: OrgId
  readonly kind: DigestKind
  readonly runId: DigestRunId
  readonly alerts: readonly AlertEvent[]
  readonly now: Date
  readonly windowStart: Date
  readonly windowEnd: Date
}

export function buildDigest(inputs: BuildDigestInputs): AlertDigest {
  const visible = inputs.alerts.filter((a) => !a.suppressed)
  const sections =
    inputs.kind === 'morning_brief'    ? buildMorningSections(visible, inputs.now)
    : inputs.kind === 'intraday_critical' ? buildIntradaySections(visible, inputs.now)
    :                                        buildCoverageSections(visible)

  const allAlertIds = sections.flatMap((s) => s.alertIds)
  const topSeverity = pickTopSeverity(visible.filter((a) => allAlertIds.includes(a.id)))

  const id = asDigestId(`digest_${inputs.kind}_${inputs.orgId as unknown as string}_${inputs.now.toISOString().replace(/[:.]/g, '-')}`)

  return {
    id,
    runId: inputs.runId,
    orgId: inputs.orgId,
    kind: inputs.kind,
    title: KIND_LABEL[inputs.kind].title,
    subtitle: KIND_LABEL[inputs.kind].subtitle,
    generatedAt: inputs.now.toISOString(),
    windowStart: inputs.windowStart.toISOString(),
    windowEnd: inputs.windowEnd.toISOString(),
    sections,
    alertCount: allAlertIds.length,
    topSeverity,
    executiveSummary: defaultExecutiveSummary(inputs.kind, allAlertIds.length, topSeverity),
    executiveSummaryFromLlm: false,
  }
}

// ── Section composition ──────────────────────────────────────────────────

function buildMorningSections(alerts: readonly AlertEvent[], now: Date): readonly DigestSection[] {
  const recent = alerts.filter((a) => Date.parse(a.generatedAt) >= now.getTime() - 1.5 * DAY_MS)

  const todayOnBook = filterAndRank(recent, (a) =>
    (a.kind === 'new_research_held' || a.kind === 'new_research_watchlist')
    && (now.getTime() - Date.parse(a.generatedAt)) <= 36 * HOUR_MS,
  )

  const significant = filterAndRank(recent, (a) =>
    a.kind === 'significant_change_held' || a.kind === 'against_position',
  )

  const divergent = filterAndRank(alerts, (a) =>
    a.kind === 'unresolved_divergence_held' || a.kind === 'broker_outlier_held',
  )

  const watchlist = filterAndRank(recent, (a) =>
    a.kind === 'new_research_watchlist' || a.kind === 'watchlist_fresh_candidate',
  )

  const stale = filterAndRank(alerts, (a) =>
    a.kind === 'stale_coverage_high_conviction'
    || a.kind === 'stale_coverage_held'
    || a.kind === 'stale_coverage_watchlist',
  )

  const out: DigestSection[] = []
  pushSection(out, 'today_on_book', "Today on the book", "Held / watchlist names with new research in the last 36h.", todayOnBook, 'No new research on the book in the last 36h.')
  pushSection(out, 'significant_changes', 'Significant broker changes', 'Material rating or target moves on held names — including views opposing your position.', significant, 'No significant changes on the book this window.')
  pushSection(out, 'unresolved_divergence', 'Unresolved divergence on the book', 'Held names where the Street disagrees or an outlier is active.', divergent, 'Street is aligned across the book.')
  pushSection(out, 'watchlist_fresh', 'Watchlist with fresh research', 'Watchlist names with broker activity worth a look.', watchlist, 'No fresh broker research on the watchlist.')
  pushSection(out, 'stale_coverage', 'Stale or thin coverage', 'Held / watchlist names without recent broker notes.', stale, 'Coverage looks healthy across the book.')
  return out
}

function buildIntradaySections(alerts: readonly AlertEvent[], now: Date): readonly DigestSection[] {
  const cutoff = now.getTime() - 4 * HOUR_MS
  const recent = alerts.filter((a) => Date.parse(a.generatedAt) >= cutoff)
  const critical = filterAndRank(recent, (a) => a.severity === 'critical')
  const high     = filterAndRank(recent, (a) => a.severity === 'high')
  const out: DigestSection[] = []
  pushSection(out, 'critical_4h', 'Critical (last 4h)', 'Critical-severity alerts in the past 4 hours.', critical, 'No critical alerts in the past 4h.')
  pushSection(out, 'high_4h', 'High priority (last 4h)', 'High-severity alerts to scan next.', high, 'No high-severity alerts in the past 4h.')
  return out
}

function buildCoverageSections(alerts: readonly AlertEvent[]): readonly DigestSection[] {
  const high = filterAndRank(alerts, (a) => a.kind === 'stale_coverage_high_conviction')
  const held = filterAndRank(alerts, (a) => a.kind === 'stale_coverage_held')
  const watch = filterAndRank(alerts, (a) => a.kind === 'stale_coverage_watchlist')
  const outlier = filterAndRank(alerts, (a) => a.kind === 'broker_outlier_held')
  const out: DigestSection[] = []
  pushSection(out, 'stale_high_conviction', 'High-conviction stale coverage', 'High-conviction held names without a recent broker note.', high, 'High-conviction holdings have fresh coverage.')
  pushSection(out, 'stale_held', 'Held stale coverage', 'Other held names with stale broker coverage.', held, 'No stale held-name coverage.')
  pushSection(out, 'stale_watchlist', 'Watchlist stale coverage', 'Watchlist names with stale broker coverage.', watch, 'Watchlist coverage is fresh.')
  pushSection(out, 'broker_outliers', 'Broker outliers', 'Brokers acting as outliers on held names.', outlier, 'No broker outliers on the book.')
  return out
}

function pushSection(
  acc: DigestSection[],
  key: string,
  title: string,
  subtitle: string,
  ids: readonly AlertId[],
  emptyText: string,
): void {
  acc.push({
    key,
    title,
    subtitle,
    alertIds: ids,
    prose: ids.length === 0
      ? emptyText
      : defaultSectionProse(title, ids.length),
    proseFromLlm: false,
  })
}

function filterAndRank(
  alerts: readonly AlertEvent[],
  pred: (a: AlertEvent) => boolean,
): readonly AlertId[] {
  const matched = alerts.filter(pred)
  matched.sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity)
    if (r !== 0) return r
    return b.generatedAt.localeCompare(a.generatedAt)
  })
  return matched.map((a) => a.id)
}

function pickTopSeverity(alerts: readonly AlertEvent[]): AlertSeverity | null {
  let best: AlertSeverity | null = null
  for (const a of alerts) {
    if (!best || severityRank(a.severity) < severityRank(best)) best = a.severity
  }
  return best
}

// ── Deterministic fallback prose ────────────────────────────────────────

function defaultSectionProse(title: string, count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'} in “${title}”.`
}

function defaultExecutiveSummary(
  kind: DigestKind,
  count: number,
  topSeverity: AlertSeverity | null,
): string | null {
  if (count === 0) {
    if (kind === 'morning_brief') return 'Quiet morning on the book. Nothing material in the window.'
    if (kind === 'intraday_critical') return 'No critical or high-severity alerts in the past 4 hours.'
    return 'Coverage hygiene looks healthy.'
  }
  const lead =
    kind === 'morning_brief'    ? 'Morning brief'
    : kind === 'intraday_critical' ? 'Intraday critical feed'
    : 'Coverage hygiene'
  const sev = topSeverity ? `top severity ${topSeverity}` : 'no severity'
  return `${lead}: ${count} ${count === 1 ? 'alert' : 'alerts'}, ${sev}.`
}
