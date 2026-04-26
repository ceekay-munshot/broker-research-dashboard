// Morning Book Brief — daily summary of what's on the book + the
// briefing's executive summary + critical alert count + stale coverage.
//
// Depends on: raw_upstream + portfolio (book overlay).

import type { InMemoryStore } from '../../store/InMemoryStore'
import type { DeliveryTemplateImpl, TemplateInputs } from '../types'
import { buildPayload, formatShortDate } from './types'

export const morningBookBriefTemplate: DeliveryTemplateImpl = {
  contentKind: 'morning_book_brief',
  displayName: 'Morning Book Brief',
  dependsOnSources: ['raw_upstream', 'portfolio'],
  suppressionTtlSeconds: 12 * 60 * 60,  // half-day so a re-run doesn't double-fire

  render({ orgId, now, sourcesHealth }: TemplateInputs, store: InMemoryStore) {
    const digest = store.listDigests(orgId, { kind: 'morning_brief', limit: 1 })[0] ?? null
    const alerts = store.listAlerts(orgId, { sinceMs: 24 * 60 * 60 * 1000, limit: 200 })
    const critical = alerts.filter((a) => a.severity === 'critical' && !a.suppressed).length
    const high     = alerts.filter((a) => a.severity === 'high'     && !a.suppressed).length

    if (!digest && critical === 0 && high === 0) return null  // nothing to say

    const onBook = alerts.filter((a) => a.bookContext?.membership === 'held' || a.bookContext?.membership === 'watchlist').length
    const dateLabel = formatShortDate(now)
    const subject = `Morning Book Brief — ${dateLabel}`

    const bullets: string[] = []
    if (digest?.executiveSummary) bullets.push(digest.executiveSummary)
    bullets.push(`${critical} critical · ${high} high · ${onBook} on book in last 24h`)

    const degradedSources = (sourcesHealth?.sources ?? [])
      .filter((s) => s.status === 'stale' || s.status === 'failing')
    if (degradedSources.length > 0) {
      bullets.push(`Source warnings: ${degradedSources.map((s) => `${s.kind} (${s.status})`).join(', ')}`)
    }

    const text = [subject, '', ...bullets].join('\n')
    const markdown = [`*${subject}*`, '', ...bullets.map((b) => `• ${b}`)].join('\n')
    const summary = {
      title: subject,
      subtitle: `${critical} critical · ${high} high · ${onBook} on book`,
      bullets: bullets.slice(0, 4),
      counts: { critical, high, onBookLast24h: onBook },
      badges: degradedSources.length > 0 ? ['DEGRADED'] : [],
    }
    return buildPayload({
      contentKind: 'morning_book_brief',
      subject, text, markdown, summary,
      clickThrough: { tab: 'briefing', entityId: null },
    })
  },
}
