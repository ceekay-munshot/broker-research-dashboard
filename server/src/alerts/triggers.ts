// Deterministic trigger registry.
//
// One TriggerFn per AlertTriggerKind. Each is pure: same inputs ↦ same
// candidate alerts. Triggers consult the canonical research slice + the
// portfolio overlay (held / watchlist / direction / weight / conviction)
// to decide whether an event should fire. They never call the LLM.
//
// The set is intentionally small and explicit. Adding a new trigger =
// appending one entry to RULES + the corresponding TriggerFn here.

import type {
  ResearchReport,
  BrokerId, StockTicker, ReportId, OrgId, PortfolioSnapshot,
  PortfolioPosition, WatchlistEntry,
  AlertReason, AlertTriggerKind, AlertSeverity,
  AlertRule,
} from '../../../src/domain'
import { buildFingerprint } from './suppression'
import { computeSeverity } from './severity'
import { asAlertRuleId } from '../../../src/lib/ids'
import type { CandidateAlert, RuleRegistryEntry, TriggerInputs } from './types'

const HOUR_MS = 3600e3
const DAY_MS = 86400e3
const FRESH_HOURS = 36
const PILE_IN_DAYS = 7
const PILE_IN_MIN_BROKERS = 3
const SIGNIFICANT_TARGET_PCT_MIN = 7
const MAJOR_TARGET_PCT_MIN = 15
const STALE_DAYS_HIGH_CONVICTION = 7
const STALE_DAYS_HELD = 14
const STALE_DAYS_WATCH = 30

// ── Helpers ──────────────────────────────────────────────────────────────

function indexBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>()
  for (const it of items) m.set(key(it), it)
  return m
}

function ageHours(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / HOUR_MS
}

function ageDays(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / DAY_MS
}

function membershipFor(snapshot: PortfolioSnapshot | null, ticker: StockTicker | null) {
  if (!snapshot || !ticker) return { membership: 'none' as const, position: null as PortfolioPosition | null, watch: null as WatchlistEntry | null }
  const t = ticker as string
  const position = snapshot.positions.find((p) => (p.ticker as string) === t) ?? null
  if (position) return { membership: 'held' as const, position, watch: null }
  const watch = snapshot.watchlist.find((w) => (w.ticker as string) === t) ?? null
  if (watch) return { membership: 'watchlist' as const, position: null, watch }
  return { membership: 'none' as const, position: null, watch: null }
}

// ── Trigger: new research on a held name ─────────────────────────────────

const newResearchHeld = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  for (const r of inputs.reports) {
    if (Date.parse(r.receivedAt) < inputs.windowStart.getTime()) continue
    for (const t of r.tickers) {
      const m = membershipFor(inputs.snapshot, t)
      if (m.membership !== 'held') continue
      const broker = inputs.brokers.find((b) => b.id === r.brokerId)
      const reasons: AlertReason[] = []
      if (ageHours(r.receivedAt, inputs.now) <= FRESH_HOURS) {
        reasons.push({ code: 'fresh_today', text: 'fresh today', severityDelta: 6 })
      }
      reasons.push({ code: 'held', text: 'in current book', severityDelta: 0 })
      if (m.position?.conviction === 'high') {
        reasons.push({ code: 'high_conviction', text: 'high-conviction holding', severityDelta: 4 })
      }
      const headline = `${(t as string)} — new research from ${broker?.shortName ?? 'broker'}`
      const body = `${r.title}`
      const severity = computeSeverity(
        'new_research_held', reasons,
        m.position?.weightPct ?? null, m.position?.conviction ?? null,
      )
      out.push(makeCandidate({
        kind: 'new_research_held', severity, headline, body, reasons,
        ticker: t, brokerId: r.brokerId, reportId: r.id,
        membership: 'held',
        direction: m.position?.direction ?? null,
        conviction: m.position?.conviction ?? null,
        weightPct: m.position?.weightPct ?? null,
        orgId: inputs.orgId,
        bucket: r.id as unknown as string,
        expiresInHours: 36,
      }))
    }
  }
  return out
}

// ── Trigger: new research on a watchlist name ────────────────────────────

const newResearchWatchlist = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  for (const r of inputs.reports) {
    if (Date.parse(r.receivedAt) < inputs.windowStart.getTime()) continue
    for (const t of r.tickers) {
      const m = membershipFor(inputs.snapshot, t)
      if (m.membership !== 'watchlist') continue
      const broker = inputs.brokers.find((b) => b.id === r.brokerId)
      const reasons: AlertReason[] = [
        { code: 'watchlist', text: 'on watchlist', severityDelta: 0 },
      ]
      const headline = `${(t as string)} — fresh research (watchlist)`
      const body = `${broker?.shortName ?? 'broker'} · ${r.title}`
      const severity = computeSeverity('new_research_watchlist', reasons)
      out.push(makeCandidate({
        kind: 'new_research_watchlist', severity, headline, body, reasons,
        ticker: t, brokerId: r.brokerId, reportId: r.id,
        membership: 'watchlist',
        direction: null, conviction: null, weightPct: null,
        orgId: inputs.orgId,
        bucket: r.id as unknown as string,
        expiresInHours: 48,
      }))
    }
  }
  return out
}

// ── Trigger: significant change (target Δ) on a held name ────────────────

const significantChangeHeld = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as unknown as string)
  const out: CandidateAlert[] = []
  for (const r of inputs.reports) {
    if (Date.parse(r.receivedAt) < inputs.windowStart.getTime()) continue
    const summary = summaryByReport.get(r.id as unknown as string) ?? null
    if (!summary) continue
    if (summary.targetPrice === null || summary.priorTargetPrice === null) continue
    if (summary.priorTargetPrice === 0) continue
    const pct = ((summary.targetPrice - summary.priorTargetPrice) / summary.priorTargetPrice) * 100
    const absPct = Math.abs(pct)
    if (absPct < SIGNIFICANT_TARGET_PCT_MIN) continue

    for (const t of r.tickers) {
      const m = membershipFor(inputs.snapshot, t)
      if (m.membership !== 'held') continue
      const broker = inputs.brokers.find((b) => b.id === r.brokerId)
      const reasons: AlertReason[] = [
        { code: 'held', text: 'held position', severityDelta: 0 },
        {
          code: absPct >= MAJOR_TARGET_PCT_MIN ? 'target_major' : 'target_significant',
          text: `target ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
          severityDelta: absPct >= MAJOR_TARGET_PCT_MIN ? 12 : 4,
        },
      ]
      const headline = `${(t as string)} — ${broker?.shortName ?? 'broker'} target ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
      const body = r.title
      const severity = computeSeverity(
        'significant_change_held', reasons,
        m.position?.weightPct ?? null, m.position?.conviction ?? null,
      )
      out.push(makeCandidate({
        kind: 'significant_change_held', severity, headline, body, reasons,
        ticker: t, brokerId: r.brokerId, reportId: r.id,
        membership: 'held',
        direction: m.position?.direction ?? null,
        conviction: m.position?.conviction ?? null,
        weightPct: m.position?.weightPct ?? null,
        orgId: inputs.orgId,
        bucket: `${r.id}:${pct >= MAJOR_TARGET_PCT_MIN ? 'major' : 'sig'}`,
        expiresInHours: 36,
      }))
    }
  }
  return out
}

// ── Trigger: broker view against position direction ──────────────────────

const againstPosition = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const summaryByReport = indexBy(inputs.summaries, (s) => s.reportId as unknown as string)
  const out: CandidateAlert[] = []
  for (const r of inputs.reports) {
    if (Date.parse(r.receivedAt) < inputs.windowStart.getTime()) continue
    const summary = summaryByReport.get(r.id as unknown as string) ?? null
    if (!summary) continue
    for (const t of r.tickers) {
      const m = membershipFor(inputs.snapshot, t)
      if (m.membership !== 'held' || !m.position) continue
      const dir = m.position.direction
      const stance = summary.stance
      const opposes =
        (dir === 'long' && stance === 'bearish') ||
        (dir === 'short' && stance === 'bullish')
      if (!opposes) continue
      const broker = inputs.brokers.find((b) => b.id === r.brokerId)
      const reasons: AlertReason[] = [
        { code: 'held', text: 'held position', severityDelta: 0 },
        { code: 'against_position', text: `${broker?.shortName ?? 'broker'} ${stance} on your ${dir}`, severityDelta: 10 },
      ]
      const headline = `${(t as string)} — ${broker?.shortName ?? 'broker'} ${stance} against your ${dir} position`
      const body = r.title
      const severity = computeSeverity(
        'against_position', reasons,
        m.position.weightPct ?? null, m.position.conviction ?? null,
      )
      out.push(makeCandidate({
        kind: 'against_position', severity, headline, body, reasons,
        ticker: t, brokerId: r.brokerId, reportId: r.id,
        membership: 'held',
        direction: dir, conviction: m.position.conviction, weightPct: m.position.weightPct,
        orgId: inputs.orgId,
        bucket: `${r.id}:${stance}`,
        expiresInHours: 48,
      }))
    }
  }
  return out
}

// ── Trigger: unresolved divergence on held names ─────────────────────────

const unresolvedDivergenceHeld = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  for (const c of inputs.closures) {
    const m = membershipFor(inputs.snapshot, c.ticker)
    if (m.membership !== 'held') continue
    const state = c.resultant.state
    const isDivergent =
      state === 'unresolved' || state === 'mixed_constructive' ||
      state === 'mixed_cautious' || state === 'outlier_driven' ||
      c.disagreements.length > 0
    if (!isDivergent) continue
    const reasons: AlertReason[] = [
      { code: 'held', text: 'held position', severityDelta: 0 },
      { code: 'divergence', text: `Street: ${state.replace('_', ' ')}`, severityDelta: 6 },
    ]
    if (c.outliers.length > 0) {
      reasons.push({ code: 'outliers_present', text: `${c.outliers.length} outlier${c.outliers.length === 1 ? '' : 's'}`, severityDelta: 4 })
    }
    const headline = `${(c.ticker as string)} — unresolved divergence on the book`
    const body = `Street is ${state.replace('_', ' ')}; ${c.brokerCount} brokers covering`
    const severity = computeSeverity(
      'unresolved_divergence_held', reasons,
      m.position?.weightPct ?? null, m.position?.conviction ?? null,
    )
    out.push(makeCandidate({
      kind: 'unresolved_divergence_held', severity, headline, body, reasons,
      ticker: c.ticker, brokerId: null, reportId: null,
      membership: 'held',
      direction: m.position?.direction ?? null,
      conviction: m.position?.conviction ?? null,
      weightPct: m.position?.weightPct ?? null,
      orgId: inputs.orgId,
      bucket: state,
      expiresInHours: 24 * 3,
    }))
  }
  return out
}

// ── Trigger: broker outlier on a held position ───────────────────────────

const brokerOutlierHeld = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  for (const c of inputs.closures) {
    const m = membershipFor(inputs.snapshot, c.ticker)
    if (m.membership !== 'held') continue
    for (const o of c.outliers) {
      const broker = inputs.brokers.find((b) => b.id === o.brokerId)
      const reasons: AlertReason[] = [
        { code: 'held', text: 'held position', severityDelta: 0 },
        { code: 'outlier', text: `${broker?.shortName ?? 'broker'} outlier`, severityDelta: 5 },
      ]
      const headline = `${(c.ticker as string)} — ${broker?.shortName ?? 'broker'} outlier`
      const body = `Outlier vs Street consensus on ${(c.ticker as string)}`
      const severity = computeSeverity(
        'broker_outlier_held', reasons,
        m.position?.weightPct ?? null, m.position?.conviction ?? null,
      )
      out.push(makeCandidate({
        kind: 'broker_outlier_held', severity, headline, body, reasons,
        ticker: c.ticker, brokerId: o.brokerId, reportId: null,
        membership: 'held',
        direction: m.position?.direction ?? null,
        conviction: m.position?.conviction ?? null,
        weightPct: m.position?.weightPct ?? null,
        orgId: inputs.orgId,
        bucket: 'outlier',
        expiresInHours: 24 * 3,
      }))
    }
  }
  return out
}

// ── Trigger: pile-in (>=3 brokers in 7d on a book name) ──────────────────

const pileInBook = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const cutoffMs = inputs.now.getTime() - PILE_IN_DAYS * DAY_MS
  const tally = new Map<string, Set<string>>()
  for (const r of inputs.reports) {
    if (Date.parse(r.receivedAt) < cutoffMs) continue
    for (const t of r.tickers) {
      const m = membershipFor(inputs.snapshot, t)
      if (m.membership !== 'held' && m.membership !== 'watchlist') continue
      const k = t as string
      const set = tally.get(k) ?? new Set<string>()
      set.add(r.brokerId as unknown as string)
      tally.set(k, set)
    }
  }
  const out: CandidateAlert[] = []
  for (const [tk, brokers] of tally) {
    if (brokers.size < PILE_IN_MIN_BROKERS) continue
    const ticker = tk as unknown as StockTicker
    const m = membershipFor(inputs.snapshot, ticker)
    const reasons: AlertReason[] = [
      { code: m.membership, text: m.membership, severityDelta: 0 },
      { code: 'pile_in', text: `${brokers.size} brokers in ${PILE_IN_DAYS}d`, severityDelta: 6 },
    ]
    const headline = `${tk} — ${brokers.size} brokers updating in ${PILE_IN_DAYS}d`
    const body = `Heavy Street activity on a ${m.membership} name`
    const severity = computeSeverity(
      'pile_in_book', reasons,
      m.position?.weightPct ?? null, m.position?.conviction ?? null,
    )
    out.push(makeCandidate({
      kind: 'pile_in_book', severity, headline, body, reasons,
      ticker, brokerId: null, reportId: null,
      membership: m.membership === 'held' || m.membership === 'watchlist' ? m.membership : 'held',
      direction: m.position?.direction ?? null,
      conviction: m.position?.conviction ?? null,
      weightPct: m.position?.weightPct ?? null,
      orgId: inputs.orgId,
      bucket: `n=${brokers.size}`,
      expiresInHours: 24 * 2,
    }))
  }
  return out
}

// ── Stale-coverage triggers ──────────────────────────────────────────────

function staleCoverageImpl(
  inputs: TriggerInputs,
  kind: 'stale_coverage_high_conviction' | 'stale_coverage_held' | 'stale_coverage_watchlist',
): readonly CandidateAlert[] {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  const reportsByTicker = new Map<string, ResearchReport[]>()
  for (const r of inputs.reports) {
    for (const t of r.tickers) {
      const k = t as string
      const arr = reportsByTicker.get(k) ?? []
      arr.push(r)
      reportsByTicker.set(k, arr)
    }
  }
  for (const arr of reportsByTicker.values()) {
    arr.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }

  const items: Array<{ ticker: StockTicker; pos: PortfolioPosition | null; watch: WatchlistEntry | null; m: 'held' | 'watchlist' }> = []
  if (kind === 'stale_coverage_watchlist') {
    for (const w of inputs.snapshot.watchlist) items.push({ ticker: w.ticker, pos: null, watch: w, m: 'watchlist' })
  } else {
    for (const p of inputs.snapshot.positions) items.push({ ticker: p.ticker, pos: p, watch: null, m: 'held' })
  }

  for (const it of items) {
    if (kind === 'stale_coverage_high_conviction' && it.pos?.conviction !== 'high') continue
    if (kind === 'stale_coverage_held' && it.pos?.conviction === 'high') continue
    const reports = reportsByTicker.get(it.ticker as string) ?? []
    const last = reports[0]
    const days = last ? ageDays(last.receivedAt, inputs.now) : Number.POSITIVE_INFINITY
    const threshold =
      kind === 'stale_coverage_high_conviction' ? STALE_DAYS_HIGH_CONVICTION
      : kind === 'stale_coverage_held' ? STALE_DAYS_HELD
      : STALE_DAYS_WATCH
    if (days <= threshold) continue
    const reasons: AlertReason[] = [
      { code: it.m, text: it.m, severityDelta: 0 },
      {
        code: 'stale_days',
        text: Number.isFinite(days) ? `${Math.floor(days)}d since last note` : 'no broker note on record',
        severityDelta: kind === 'stale_coverage_high_conviction' ? 8 : 3,
      },
    ]
    const headline = `${it.ticker as unknown as string} — stale coverage (${Number.isFinite(days) ? `${Math.floor(days)}d` : 'no notes'})`
    const body = `Last broker note ${last ? `received ${last.receivedAt.slice(0, 10)}` : 'unknown'}`
    const severity = computeSeverity(kind, reasons, it.pos?.weightPct ?? null, it.pos?.conviction ?? null)
    out.push(makeCandidate({
      kind, severity, headline, body, reasons,
      ticker: it.ticker, brokerId: null, reportId: null,
      membership: it.m,
      direction: it.pos?.direction ?? null,
      conviction: it.pos?.conviction ?? null,
      weightPct: it.pos?.weightPct ?? null,
      orgId: inputs.orgId,
      bucket: Number.isFinite(days) ? Math.floor(days / 7).toString() : 'absent',
      expiresInHours: 24 * 5,
    }))
  }
  return out
}

const staleHighConviction = (i: TriggerInputs) => staleCoverageImpl(i, 'stale_coverage_high_conviction')
const staleHeld           = (i: TriggerInputs) => staleCoverageImpl(i, 'stale_coverage_held')
const staleWatchlist      = (i: TriggerInputs) => staleCoverageImpl(i, 'stale_coverage_watchlist')

// ── Trigger: watchlist freshness candidate ───────────────────────────────

const watchlistCandidate = (inputs: TriggerInputs): readonly CandidateAlert[] => {
  if (!inputs.snapshot) return []
  const out: CandidateAlert[] = []
  const cutoffMs = inputs.now.getTime() - 3 * DAY_MS
  for (const w of inputs.snapshot.watchlist) {
    const reports = inputs.reports
      .filter((r) => r.tickers.some((t) => (t as string) === (w.ticker as string)))
      .filter((r) => Date.parse(r.receivedAt) >= cutoffMs)
    if (reports.length < 2) continue
    const reasons: AlertReason[] = [
      { code: 'watchlist', text: 'on watchlist', severityDelta: 0 },
      { code: 'fresh_run', text: `${reports.length} fresh notes in 3d`, severityDelta: 3 },
    ]
    const headline = `${(w.ticker as string)} — promotion candidate (${reports.length} fresh notes)`
    const body = 'Multiple fresh notes on watchlist name; consider promotion to book.'
    const severity = computeSeverity('watchlist_fresh_candidate', reasons)
    out.push(makeCandidate({
      kind: 'watchlist_fresh_candidate', severity, headline, body, reasons,
      ticker: w.ticker, brokerId: null, reportId: null,
      membership: 'watchlist',
      direction: null, conviction: null, weightPct: null,
      orgId: inputs.orgId,
      bucket: `n=${reports.length}`,
      expiresInHours: 24 * 2,
    }))
  }
  return out
}

// ── Helper to package a CandidateAlert ───────────────────────────────────

function makeCandidate(input: {
  kind: AlertTriggerKind
  severity: AlertSeverity
  headline: string
  body: string
  reasons: readonly AlertReason[]
  ticker: StockTicker | null
  brokerId: BrokerId | null
  reportId: ReportId | null
  membership: 'held' | 'watchlist' | 'adjacent' | 'none'
  direction: 'long' | 'short' | 'hedge' | null
  conviction: 'high' | 'medium' | 'low' | null
  weightPct: number | null
  orgId: OrgId
  bucket: string
  expiresInHours: number | null
}): CandidateAlert {
  return {
    kind: input.kind,
    severity: input.severity,
    headline: input.headline,
    body: input.body,
    reasons: input.reasons,
    ticker: input.ticker,
    brokerId: input.brokerId,
    reportId: input.reportId,
    bookMembership: input.membership,
    bookDirection: input.direction,
    bookConviction: input.conviction,
    bookWeightPct: input.weightPct,
    fingerprint: buildFingerprint({
      orgId: input.orgId,
      kind: input.kind,
      ticker: input.ticker,
      brokerId: input.brokerId,
      reportId: input.reportId,
      bucket: input.bucket,
    }),
    expiresInHours: input.expiresInHours,
  }
}

// ── Static rule registry ─────────────────────────────────────────────────

export const RULES: readonly RuleRegistryEntry[] = [
  rule('rule_new_research_held',          'new_research_held',          'high',     'pm',      30,  'Fresh research lands on a held name.', newResearchHeld),
  rule('rule_new_research_watchlist',     'new_research_watchlist',     'medium',   'analyst', 60,  'Fresh research lands on a watchlist name.', newResearchWatchlist),
  rule('rule_significant_change_held',    'significant_change_held',    'critical', 'pm',      120, 'Material rating/target change on a held name.', significantChangeHeld),
  rule('rule_against_position',           'against_position',           'critical', 'pm',      120, 'Broker view opposes a held position direction.', againstPosition),
  rule('rule_unresolved_divergence_held', 'unresolved_divergence_held', 'high',     'pm',      720, 'Unresolved Street divergence on a held name.', unresolvedDivergenceHeld),
  rule('rule_broker_outlier_held',        'broker_outlier_held',        'medium',   'analyst', 720, 'A broker is an outlier on a held name.', brokerOutlierHeld),
  rule('rule_pile_in_book',               'pile_in_book',               'high',     'analyst', 720, '≥3 brokers covering a book name in 7 days.', pileInBook),
  rule('rule_stale_high_conviction',      'stale_coverage_high_conviction', 'high',  'pm',     24*60, 'High-conviction position with stale broker coverage.', staleHighConviction),
  rule('rule_stale_held',                 'stale_coverage_held',         'medium',  'analyst', 24*60, 'Held position with stale broker coverage.', staleHeld),
  rule('rule_stale_watchlist',            'stale_coverage_watchlist',    'low',     'analyst', 48*60, 'Watchlist name with stale broker coverage.', staleWatchlist),
  rule('rule_watchlist_candidate',        'watchlist_fresh_candidate',   'medium',  'pm',      720, 'Watchlist name with multiple fresh notes — promotion candidate.', watchlistCandidate),
]

function rule(
  id: string,
  kind: AlertTriggerKind,
  defaultSeverity: AlertSeverity,
  audience: AlertRule['audience'],
  suppressionWindowMinutes: number,
  description: string,
  trigger: (inputs: TriggerInputs) => readonly CandidateAlert[],
): RuleRegistryEntry {
  return {
    rule: {
      id: asAlertRuleId(id),
      kind,
      enabled: true,
      defaultSeverity,
      audience,
      suppressionWindowMinutes,
      description,
    },
    trigger,
  }
}
