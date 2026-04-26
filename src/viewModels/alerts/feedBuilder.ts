import type {
  AlertEvent, AlertSeverity, CalibrationSnapshot, PostEventReview,
} from '../../domain'
import type {
  AlertCardViewModel, AlertGroup, AlertsFeedViewModel,
} from './types'
import type { AdaptiveAnnotation } from '../adaptiveRanking'
import {
  adaptiveRankingFlags, computeRankAdjustment,
} from '../../engine'

export function alertToCard(a: AlertEvent): AlertCardViewModel {
  return {
    id: a.id,
    severity: a.severity,
    kind: a.kind,
    headline: a.headline,
    body: a.body,
    reasons: a.reasons.map((r) => ({ code: r.code, text: r.text })),
    generatedAt: a.generatedAt,
    suppressed: a.suppressed,
    bookMembership: a.bookContext?.membership ?? null,
    bookDirection: a.bookContext?.direction ?? null,
    bookConviction: a.bookContext?.conviction ?? null,
    bookWeightPct: a.bookContext?.weightPct ?? null,
    ticker: a.lineage.ticker,
    brokerId: a.lineage.brokerId,
    reportId: a.lineage.reportId,
    adaptive: null,
  }
}

export interface BuildFeedInputs {
  readonly alerts: readonly AlertEvent[]
  readonly groupBy?: AlertsFeedViewModel['groupBy']
  /** Module 23 — calibration snapshot drives adaptive-ranking adjustments. */
  readonly calibration?: CalibrationSnapshot | null
  /** Module 23 — post-event reviews feed catalyst-type and broker-event sources. */
  readonly postEventReviews?: readonly PostEventReview[] | null
}

/** Map a `severity` to a numeric baseline so the adaptive engine has a
 *  scalar baseline to nudge. Same scale used by Module 19 alert ranker.
 *  Critical=80, high=60, medium=40, low=20, info=10. */
function severityBaseline(s: AlertSeverity): number {
  switch (s) {
    case 'critical': return 80
    case 'high':     return 60
    case 'medium':   return 40
    case 'low':      return 20
    case 'info':     return 10
  }
}

function annotateCard(
  card: AlertCardViewModel,
  calibration: CalibrationSnapshot | null,
  postEventReviews: readonly PostEventReview[] | null,
): AlertCardViewModel {
  if (!calibration) return card
  const adjustment = computeRankAdjustment({
    baselineScore: severityBaseline(card.severity),
    brokerId: card.brokerId,
    alertKind: card.kind,
    catalystType: null,
    calibration,
    postEventReviews,
  })
  const adaptive: AdaptiveAnnotation = {
    adjustment,
    rankDelta: 0,
    moved: adjustment.delta !== 0,
  }
  return { ...card, adaptive }
}

export function buildAlertsFeedViewModel(inputs: BuildFeedInputs): AlertsFeedViewModel {
  const groupBy = inputs.groupBy ?? 'severity'
  const calibration = inputs.calibration ?? null
  const postEventReviews = inputs.postEventReviews ?? null
  const flags = adaptiveRankingFlags()

  const baseCards = inputs.alerts.filter((a) => !a.suppressed).map(alertToCard)
  const annotated = baseCards.map((c) => annotateCard(c, calibration, postEventReviews))

  // Compute baseline + adaptive ranks across the full feed to derive deltas.
  // We rank by severity desc first (severity dominates at the surface level),
  // and within severity by adjustedScore desc when the flag is on.
  const severityRank: Record<AlertSeverity, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4,
  }
  const baselineSorted = [...annotated].sort((a, b) => {
    const dr = severityRank[a.severity] - severityRank[b.severity]
    if (dr !== 0) return dr
    return a.generatedAt < b.generatedAt ? 1 : -1
  })
  const adaptiveSorted = [...annotated].sort((a, b) => {
    const dr = severityRank[a.severity] - severityRank[b.severity]
    if (dr !== 0) return dr
    const aScore = a.adaptive ? a.adaptive.adjustment.adjustedScore : severityBaseline(a.severity)
    const bScore = b.adaptive ? b.adaptive.adjustment.adjustedScore : severityBaseline(b.severity)
    if (aScore !== bScore) return bScore - aScore
    return a.generatedAt < b.generatedAt ? 1 : -1
  })
  const baselineIdx = new Map<string, number>()
  baselineSorted.forEach((c, i) => baselineIdx.set(c.id as unknown as string, i))
  const adaptiveIdx = new Map<string, number>()
  adaptiveSorted.forEach((c, i) => adaptiveIdx.set(c.id as unknown as string, i))

  const stamp = (c: AlertCardViewModel): AlertCardViewModel => {
    if (!c.adaptive) return c
    const k = c.id as unknown as string
    const rankDelta = (baselineIdx.get(k) ?? 0) - (adaptiveIdx.get(k) ?? 0)
    return {
      ...c,
      adaptive: {
        ...c.adaptive,
        rankDelta,
        moved: c.adaptive.adjustment.delta !== 0 || rankDelta !== 0,
      },
    }
  }
  const stamped = (flags.enabled ? adaptiveSorted : baselineSorted).map(stamp)

  // Re-emit `cards` in the chosen order so groupings inherit it.
  const cards: readonly AlertCardViewModel[] = stamped

  const counts = {
    critical: cards.filter((c) => c.severity === 'critical').length,
    high:     cards.filter((c) => c.severity === 'high').length,
    medium:   cards.filter((c) => c.severity === 'medium').length,
    low:      cards.filter((c) => c.severity === 'low').length,
    info:     cards.filter((c) => c.severity === 'info').length,
    total:    cards.length,
  }

  const groups = groupBy === 'severity'   ? groupBySeverity(cards)
              : groupBy === 'membership' ? groupByMembership(cards)
              : groupBy === 'kind'       ? groupByKind(cards)
              :                              groupByBroker(cards)

  return { counts, groups, groupBy }
}

function groupBySeverity(cards: readonly AlertCardViewModel[]): readonly AlertGroup[] {
  const order: readonly AlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
  return order
    .map((s) => ({
      key: s,
      label: s.toUpperCase(),
      items: cards.filter((c) => c.severity === s),
    }))
    .filter((g) => g.items.length > 0)
}

function groupByMembership(cards: readonly AlertCardViewModel[]): readonly AlertGroup[] {
  const order: readonly { key: string; label: string; pred: (c: AlertCardViewModel) => boolean }[] = [
    { key: 'held',      label: 'In Book',     pred: (c) => c.bookMembership === 'held' },
    { key: 'watchlist', label: 'Watchlist',   pred: (c) => c.bookMembership === 'watchlist' },
    { key: 'adjacent',  label: 'Adjacent',    pred: (c) => c.bookMembership === 'adjacent' },
    { key: 'none',      label: 'Not in Book', pred: (c) => !c.bookMembership || c.bookMembership === 'none' },
  ]
  return order
    .map((g) => ({ key: g.key, label: g.label, items: cards.filter(g.pred) }))
    .filter((g) => g.items.length > 0)
}

function groupByKind(cards: readonly AlertCardViewModel[]): readonly AlertGroup[] {
  const set = new Set(cards.map((c) => c.kind))
  return [...set].sort().map((k) => ({
    key: k as string,
    label: (k as string).replace(/_/g, ' '),
    items: cards.filter((c) => c.kind === k),
  }))
}

function groupByBroker(cards: readonly AlertCardViewModel[]): readonly AlertGroup[] {
  const map = new Map<string, AlertCardViewModel[]>()
  for (const c of cards) {
    const k = (c.brokerId as unknown as string) ?? '—'
    const arr = map.get(k) ?? []
    arr.push(c)
    map.set(k, arr)
  }
  return [...map.entries()]
    .map(([k, items]) => ({ key: k, label: k, items }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
