// Intraday Critical — sends immediately when critical alerts have landed
// in the last interval. Filters by minimum severity from the subscription.
//
// Depends on: raw_upstream.

import type { InMemoryStore } from '../../store/InMemoryStore'
import type { DeliveryTemplateImpl, TemplateInputs } from '../types'
import { buildPayload } from './types'

export const intradayCriticalTemplate: DeliveryTemplateImpl = {
  contentKind: 'intraday_critical',
  displayName: 'Intraday Critical Alerts',
  dependsOnSources: ['raw_upstream'],
  suppressionTtlSeconds: 30 * 60,  // 30m — let the same critical alert resend after that

  render({ orgId, now }: TemplateInputs, store: InMemoryStore) {
    // Only consider the last 15 minutes' worth of alerts.
    const window = 15 * 60 * 1000
    const since = now.getTime() - window
    const alerts = store.listAlerts(orgId, { sinceMs: window, limit: 50 })
      .filter((a) => !a.suppressed)
      .filter((a) => a.severity === 'critical' || a.severity === 'high')
      .filter((a) => Date.parse(a.generatedAt) >= since)
    if (alerts.length === 0) return null

    const subject = alerts.length === 1
      ? `Intraday Critical — ${alerts[0]!.headline}`
      : `Intraday Critical — ${alerts.length} alerts`

    const bullets = alerts.slice(0, 5).map((a) => `[${a.severity.toUpperCase()}] ${a.headline}`)
    const counts = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      high:     alerts.filter((a) => a.severity === 'high').length,
    }
    const text = [subject, '', ...bullets].join('\n')
    const markdown = [`*${subject}*`, '', ...bullets.map((b) => `• ${b}`)].join('\n')
    const summary = {
      title: subject,
      subtitle: `${counts.critical} critical · ${counts.high} high in last 15m`,
      bullets: bullets.slice(0, 5),
      counts,
      badges: counts.critical > 0 ? ['CRITICAL'] : [],
    }
    return buildPayload({
      contentKind: 'intraday_critical', subject, text, markdown, summary,
      clickThrough: { tab: 'briefing', entityId: null },
    })
  },
}
