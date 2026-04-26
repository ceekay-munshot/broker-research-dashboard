import type { AlertEvent, AlertSeverity } from '../../domain'
import type {
  AlertCardViewModel, AlertGroup, AlertsFeedViewModel,
} from './types'

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
  }
}

export interface BuildFeedInputs {
  readonly alerts: readonly AlertEvent[]
  readonly groupBy?: AlertsFeedViewModel['groupBy']
}

export function buildAlertsFeedViewModel(inputs: BuildFeedInputs): AlertsFeedViewModel {
  const groupBy = inputs.groupBy ?? 'severity'
  const cards = inputs.alerts.filter((a) => !a.suppressed).map(alertToCard)

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
