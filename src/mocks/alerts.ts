// Mock alerts + digest fixtures.
//
// These mirror what the server-side alerts engine produces from the
// canonical mock + portfolio fixtures. Hand-written so the UI has
// rich, varied content offline (mock adapter) without importing the
// server-side engine.
//
// In the http/local mode, the real /v1/alerts and /v1/alert-digests
// endpoints supersede these — the live engine produces freshly
// generated content from the canonical store on every server boot.

import type {
  AlertEvent, AlertDigest, DigestSection,
} from '../domain'
import {
  asAlertId, asOrgId, asReportId, asTicker, asBrokerId,
  asDigestId, asDigestRunId,
} from '../lib/ids'

const ARANYA = asOrgId('org_aranya')
const NOW = '2026-04-26T07:30:00.000Z'

// ── Alert events for Aranya ──────────────────────────────────────────────

export const alertEvents: readonly AlertEvent[] = [
  {
    id: asAlertId('alrt_aranya_against_tatam_001'),
    orgId: ARANYA,
    kind: 'against_position',
    severity: 'critical',
    audience: 'pm',
    headline: 'TATAMOTORS — HDFC Securities cautious against your long position',
    body: 'TATAMOTORS: JLR margin recovery measured; balanced risk/reward',
    reasons: [
      { code: 'held', text: 'held position', severityDelta: 0 },
      { code: 'against_position', text: 'HDFC neutral on your long', severityDelta: 10 },
      { code: 'fresh_today', text: 'fresh today', severityDelta: 6 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'medium', weightPct: 5.2 },
    lineage: { reportId: asReportId('rpt_0030'), brokerId: asBrokerId('brk_hdfc'), ticker: asTicker('TATAMOTORS'), supersedes: [] },
    fingerprint: 'a8f2c1', generatedAt: '2026-04-26T05:00:00.000Z', expiresAt: '2026-04-28T05:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_sigchg_tcs_001'),
    orgId: ARANYA,
    kind: 'significant_change_held',
    severity: 'critical',
    audience: 'pm',
    headline: 'INFY — Ambit raises target +13% on improving deal ramp',
    body: 'INFY: Deal ramp improving; raising PT',
    reasons: [
      { code: 'held', text: 'held position', severityDelta: 0 },
      { code: 'target_significant', text: 'target +13%', severityDelta: 4 },
      { code: 'fresh_today', text: 'fresh today', severityDelta: 6 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'medium', weightPct: 4.1 },
    lineage: { reportId: asReportId('rpt_0018'), brokerId: asBrokerId('brk_ambit'), ticker: asTicker('INFY'), supersedes: [] },
    fingerprint: 'b3d44e', generatedAt: '2026-04-26T05:30:00.000Z', expiresAt: '2026-04-28T05:30:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_pile_in_tatam'),
    orgId: ARANYA,
    kind: 'pile_in_book',
    severity: 'high',
    audience: 'analyst',
    headline: 'TATAMOTORS — 4 brokers updating in 7d on a held name',
    body: 'Heavy Street activity on a held name',
    reasons: [
      { code: 'held', text: 'held', severityDelta: 0 },
      { code: 'pile_in', text: '4 brokers in 7d', severityDelta: 6 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'medium', weightPct: 5.2 },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('TATAMOTORS'), supersedes: [] },
    fingerprint: 'c4192a', generatedAt: '2026-04-26T06:00:00.000Z', expiresAt: '2026-04-28T06:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_new_held_tcs'),
    orgId: ARANYA,
    kind: 'new_research_held',
    severity: 'high',
    audience: 'pm',
    headline: 'TCS — new research from MOSL',
    body: 'TCS: GenAI attach running ahead of plan; reiterate Buy',
    reasons: [
      { code: 'fresh_today', text: 'fresh today', severityDelta: 6 },
      { code: 'held', text: 'in current book', severityDelta: 0 },
      { code: 'high_conviction', text: 'high-conviction holding', severityDelta: 4 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 6.4 },
    lineage: { reportId: asReportId('rpt_0028'), brokerId: asBrokerId('brk_mosl'), ticker: asTicker('TCS'), supersedes: [] },
    fingerprint: 'e7a201', generatedAt: '2026-04-26T05:30:00.000Z', expiresAt: '2026-04-28T05:30:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_new_held_icicibank'),
    orgId: ARANYA,
    kind: 'new_research_held',
    severity: 'high',
    audience: 'pm',
    headline: 'ICICIBANK — new research from Kotak',
    body: 'ICICIBANK: Deposit franchise resilient; retail credit quality intact',
    reasons: [
      { code: 'fresh_today', text: 'fresh today', severityDelta: 6 },
      { code: 'held', text: 'in current book', severityDelta: 0 },
      { code: 'high_conviction', text: 'high-conviction holding', severityDelta: 4 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 7.8 },
    lineage: { reportId: asReportId('rpt_0029'), brokerId: asBrokerId('brk_kotak'), ticker: asTicker('ICICIBANK'), supersedes: [] },
    fingerprint: '9d5512', generatedAt: '2026-04-26T05:00:00.000Z', expiresAt: '2026-04-28T05:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_div_tcs'),
    orgId: ARANYA,
    kind: 'unresolved_divergence_held',
    severity: 'high',
    audience: 'pm',
    headline: 'TCS — unresolved divergence on the book',
    body: 'Street is mixed constructive; 5 brokers covering',
    reasons: [
      { code: 'held', text: 'held position', severityDelta: 0 },
      { code: 'divergence', text: 'Street: mixed constructive', severityDelta: 6 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 6.4 },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('TCS'), supersedes: [] },
    fingerprint: '7a09e2', generatedAt: '2026-04-26T04:00:00.000Z', expiresAt: '2026-04-29T04:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_outlier_iciciamb'),
    orgId: ARANYA,
    kind: 'broker_outlier_held',
    severity: 'medium',
    audience: 'analyst',
    headline: 'ICICIBANK — Nuvama outlier vs Street',
    body: 'Outlier vs consensus on ICICIBANK',
    reasons: [
      { code: 'held', text: 'held', severityDelta: 0 },
      { code: 'outlier', text: 'Nuvama outlier', severityDelta: 5 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 7.8 },
    lineage: { reportId: null, brokerId: asBrokerId('brk_nuvama'), ticker: asTicker('ICICIBANK'), supersedes: [] },
    fingerprint: '4ef190', generatedAt: '2026-04-26T03:00:00.000Z', expiresAt: '2026-04-29T03:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_watch_hcltech'),
    orgId: ARANYA,
    kind: 'new_research_watchlist',
    severity: 'medium',
    audience: 'analyst',
    headline: 'HCLTECH — fresh research (watchlist)',
    body: 'AMBIT · HCLTECH: Services business at inflection; AI infra spend beneficiary',
    reasons: [{ code: 'watchlist', text: 'on watchlist', severityDelta: 0 }],
    bookContext: { membership: 'watchlist', direction: null, conviction: null, weightPct: null },
    lineage: { reportId: asReportId('rpt_0017'), brokerId: asBrokerId('brk_ambit'), ticker: asTicker('HCLTECH'), supersedes: [] },
    fingerprint: 'd1c4a7', generatedAt: '2026-04-23T08:11:44.000Z', expiresAt: '2026-04-25T08:11:44.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_watch_candidate_hcltech'),
    orgId: ARANYA,
    kind: 'watchlist_fresh_candidate',
    severity: 'medium',
    audience: 'pm',
    headline: 'HCLTECH — promotion candidate (3 fresh notes)',
    body: 'Multiple fresh notes on watchlist name; consider promotion to book.',
    reasons: [
      { code: 'watchlist', text: 'on watchlist', severityDelta: 0 },
      { code: 'fresh_run', text: '3 fresh notes in 3d', severityDelta: 3 },
    ],
    bookContext: { membership: 'watchlist', direction: null, conviction: null, weightPct: null },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('HCLTECH'), supersedes: [] },
    fingerprint: 'fa2017', generatedAt: '2026-04-26T06:30:00.000Z', expiresAt: '2026-04-28T06:30:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_stale_lt'),
    orgId: ARANYA,
    kind: 'stale_coverage_high_conviction',
    severity: 'high',
    audience: 'pm',
    headline: 'LT — stale coverage (12d)',
    body: 'Last broker note received 2026-04-14',
    reasons: [
      { code: 'held', text: 'held', severityDelta: 0 },
      { code: 'stale_days', text: '12d since last note', severityDelta: 8 },
    ],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 4.5 },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('LT'), supersedes: [] },
    fingerprint: '0a221b', generatedAt: '2026-04-26T01:00:00.000Z', expiresAt: '2026-05-01T01:00:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_stale_sbin'),
    orgId: ARANYA,
    kind: 'stale_coverage_held',
    severity: 'medium',
    audience: 'analyst',
    headline: 'HINDUNILVR — stale coverage (11d)',
    body: 'Last broker note received 2026-04-15',
    reasons: [
      { code: 'held', text: 'held', severityDelta: 0 },
      { code: 'stale_days', text: '11d since last note', severityDelta: 3 },
    ],
    bookContext: { membership: 'held', direction: 'short', conviction: 'low', weightPct: 1.8 },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('HINDUNILVR'), supersedes: [] },
    fingerprint: 'f4d911', generatedAt: '2026-04-26T01:30:00.000Z', expiresAt: '2026-05-01T01:30:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_stale_maruti'),
    orgId: ARANYA,
    kind: 'stale_coverage_watchlist',
    severity: 'low',
    audience: 'analyst',
    headline: 'MARUTI — stale coverage (33d)',
    body: 'Last broker note received 2026-03-24',
    reasons: [
      { code: 'watchlist', text: 'watchlist', severityDelta: 0 },
      { code: 'stale_days', text: '33d since last note', severityDelta: 3 },
    ],
    bookContext: { membership: 'watchlist', direction: null, conviction: null, weightPct: null },
    lineage: { reportId: null, brokerId: null, ticker: asTicker('MARUTI'), supersedes: [] },
    fingerprint: '88c011', generatedAt: '2026-04-26T01:45:00.000Z', expiresAt: '2026-05-01T01:45:00.000Z',
    suppressed: false, suppressedReason: null,
  },
  {
    id: asAlertId('alrt_aranya_dup_demo'),
    orgId: ARANYA,
    kind: 'new_research_held',
    severity: 'high',
    audience: 'pm',
    headline: 'TCS — new research from MOSL (duplicate)',
    body: 'Suppressed by dedup window',
    reasons: [{ code: 'fresh_today', text: 'fresh today', severityDelta: 6 }],
    bookContext: { membership: 'held', direction: 'long', conviction: 'high', weightPct: 6.4 },
    lineage: { reportId: asReportId('rpt_0028'), brokerId: asBrokerId('brk_mosl'), ticker: asTicker('TCS'), supersedes: [asAlertId('alrt_aranya_new_held_tcs')] },
    fingerprint: 'e7a201',
    generatedAt: '2026-04-26T05:50:00.000Z', expiresAt: '2026-04-28T05:50:00.000Z',
    suppressed: true, suppressedReason: 'prior alert alrt_aranya_new_held_tcs fired within 30m',
  },
]

// ── Build Morning Brief digest ───────────────────────────────────────────

const visible = alertEvents.filter((a) => !a.suppressed)

function ids(predicate: (a: AlertEvent) => boolean) {
  return visible.filter(predicate).map((a) => a.id)
}

function section(
  key: string, title: string, subtitle: string,
  alertIds: readonly AlertEvent['id'][], emptyText: string,
): DigestSection {
  return {
    key, title, subtitle, alertIds,
    prose: alertIds.length === 0 ? emptyText : `${alertIds.length} ${alertIds.length === 1 ? 'item' : 'items'} in “${title}”.`,
    proseFromLlm: false,
  }
}

const morningRunId = asDigestRunId('drun_morning_brief_aranya_demo')
const morningDigest: AlertDigest = {
  id: asDigestId('digest_morning_brief_aranya_demo'),
  runId: morningRunId,
  orgId: ARANYA,
  kind: 'morning_brief',
  title: 'Morning Book Brief',
  subtitle: "Today's portfolio-aware reading list, ranked deterministically.",
  generatedAt: NOW,
  windowStart: '2026-04-24T19:30:00.000Z',
  windowEnd:   NOW,
  sections: [
    section('today_on_book',         'Today on the book',                    'Held / watchlist names with new research in the last 36h.',
      ids((a) => a.kind === 'new_research_held' || a.kind === 'new_research_watchlist'),
      'No new research on the book in the last 36h.'),
    section('significant_changes',   'Significant broker changes',           'Material rating or target moves on held names — including views opposing your position.',
      ids((a) => a.kind === 'significant_change_held' || a.kind === 'against_position'),
      'No significant changes on the book this window.'),
    section('unresolved_divergence', 'Unresolved divergence on the book',     'Held names where the Street disagrees or an outlier is active.',
      ids((a) => a.kind === 'unresolved_divergence_held' || a.kind === 'broker_outlier_held'),
      'Street is aligned across the book.'),
    section('watchlist_fresh',       'Watchlist with fresh research',         'Watchlist names with broker activity worth a look.',
      ids((a) => a.kind === 'new_research_watchlist' || a.kind === 'watchlist_fresh_candidate'),
      'No fresh broker research on the watchlist.'),
    section('stale_coverage',        'Stale or thin coverage',                'Held / watchlist names without recent broker notes.',
      ids((a) => a.kind === 'stale_coverage_high_conviction' || a.kind === 'stale_coverage_held' || a.kind === 'stale_coverage_watchlist'),
      'Coverage looks healthy across the book.'),
  ],
  alertCount: visible.length,
  topSeverity: 'critical',
  executiveSummary: 'Morning brief: 2 critical actions on the book, target +13% on INFY (held), HDFC turning cautious vs your TATAMOTORS long, plus 1 stale high-conviction position (LT, 12d).',
  executiveSummaryFromLlm: false,
}

const intradayDigest: AlertDigest = {
  id: asDigestId('digest_intraday_critical_aranya_demo'),
  runId: asDigestRunId('drun_intraday_critical_aranya_demo'),
  orgId: ARANYA,
  kind: 'intraday_critical',
  title: 'Intraday Critical Feed',
  subtitle: 'Critical and high-severity alerts on the book in the last few hours.',
  generatedAt: NOW,
  windowStart: '2026-04-26T03:30:00.000Z',
  windowEnd:   NOW,
  sections: [
    section('critical_4h', 'Critical (last 4h)', 'Critical-severity alerts in the past 4 hours.',
      ids((a) => a.severity === 'critical'), 'No critical alerts in the past 4h.'),
    section('high_4h', 'High priority (last 4h)', 'High-severity alerts to scan next.',
      ids((a) => a.severity === 'high'), 'No high-severity alerts in the past 4h.'),
  ],
  alertCount: visible.filter((a) => a.severity === 'critical' || a.severity === 'high').length,
  topSeverity: 'critical',
  executiveSummary: 'Intraday critical feed: 2 critical against-position / target moves, 5 high-priority items to scan.',
  executiveSummaryFromLlm: false,
}

const hygieneDigest: AlertDigest = {
  id: asDigestId('digest_coverage_hygiene_aranya_demo'),
  runId: asDigestRunId('drun_coverage_hygiene_aranya_demo'),
  orgId: ARANYA,
  kind: 'coverage_hygiene',
  title: 'Coverage Hygiene Digest',
  subtitle: 'Stale, thin, or outlier coverage on the book. Risk surface.',
  generatedAt: NOW,
  windowStart: '2026-03-26T07:30:00.000Z',
  windowEnd:   NOW,
  sections: [
    section('stale_high_conviction', 'High-conviction stale coverage', 'High-conviction held names without a recent broker note.',
      ids((a) => a.kind === 'stale_coverage_high_conviction'), 'High-conviction holdings have fresh coverage.'),
    section('stale_held',            'Held stale coverage',             'Other held names with stale broker coverage.',
      ids((a) => a.kind === 'stale_coverage_held'), 'No stale held-name coverage.'),
    section('stale_watchlist',       'Watchlist stale coverage',         'Watchlist names with stale broker coverage.',
      ids((a) => a.kind === 'stale_coverage_watchlist'), 'Watchlist coverage is fresh.'),
    section('broker_outliers',       'Broker outliers',                  'Brokers acting as outliers on held names.',
      ids((a) => a.kind === 'broker_outlier_held'), 'No broker outliers on the book.'),
  ],
  alertCount: visible.filter((a) =>
    a.kind === 'stale_coverage_high_conviction' ||
    a.kind === 'stale_coverage_held' ||
    a.kind === 'stale_coverage_watchlist' ||
    a.kind === 'broker_outlier_held').length,
  topSeverity: 'high',
  executiveSummary: 'Coverage hygiene: 1 high-conviction position stale (LT 12d), 1 broker outlier (Nuvama on ICICIBANK), and 2 lower-priority stale items.',
  executiveSummaryFromLlm: false,
}

export const alertDigests: readonly AlertDigest[] = [
  morningDigest,
  intradayDigest,
  hygieneDigest,
]

