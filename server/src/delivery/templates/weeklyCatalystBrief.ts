// Weekly Catalyst Brief — Monday morning summary of upcoming events on
// held + watchlist names with priority + risk flags.
//
// Depends on: catalyst_calendar + portfolio.

import type { InMemoryStore } from '../../store/InMemoryStore'
import type { DeliveryTemplateImpl, TemplateInputs } from '../types'
import { buildPayload, formatShortDate } from './types'

export const weeklyCatalystBriefTemplate: DeliveryTemplateImpl = {
  contentKind: 'weekly_catalyst_brief',
  displayName: 'Weekly Catalyst Brief',
  dependsOnSources: ['catalyst_calendar', 'portfolio'],
  suppressionTtlSeconds: 6 * 24 * 60 * 60,  // ~weekly

  render({ orgId, now }: TemplateInputs, store: InMemoryStore) {
    const upcoming = store.listCatalysts(orgId)
      .filter((c) => c.status === 'scheduled' || c.status === 'estimated')
      .filter((c) => {
        const dt = Date.parse(c.expectedAt)
        return dt > now.getTime() && dt <= now.getTime() + 14 * 86400 * 1000
      })
      .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
    if (upcoming.length === 0) return null

    const high = upcoming.filter((c) => c.importance === 'critical' || c.importance === 'high')
    const dateLabel = formatShortDate(now)
    const subject = `Weekly Catalyst Brief — week of ${dateLabel}`

    const bullets: string[] = []
    bullets.push(`${upcoming.length} events in next 14d, ${high.length} high/critical.`)
    for (const c of upcoming.slice(0, 6)) {
      const day = formatShortDate(c.expectedAt)
      bullets.push(`• ${day} · ${c.ticker as unknown as string} · ${c.type} · ${c.importance}`)
    }
    const text = [subject, '', ...bullets].join('\n')
    const markdown = [`*${subject}*`, '', ...bullets].join('\n')
    const summary = {
      title: subject,
      subtitle: `${upcoming.length} events · ${high.length} high/critical`,
      bullets: bullets.slice(0, 6),
      counts: { upcoming: upcoming.length, high: high.length },
      badges: high.length > 0 ? ['HIGH'] : [],
    }
    return buildPayload({
      contentKind: 'weekly_catalyst_brief', subject, text, markdown, summary,
      clickThrough: { tab: 'catalysts', entityId: null },
    })
  },
}
