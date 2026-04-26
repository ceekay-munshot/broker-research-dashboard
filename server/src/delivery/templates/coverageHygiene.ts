// Coverage Hygiene — daily roll-up of stale/thin/single-broker coverage
// flagged on the book. Pulls from the latest hygiene digest when present,
// falls back to summarising recent alerts.
//
// Depends on: raw_upstream + portfolio.

import type { InMemoryStore } from '../../store/InMemoryStore'
import type { DeliveryTemplateImpl, TemplateInputs } from '../types'
import { buildPayload, formatShortDate } from './types'

export const coverageHygieneTemplate: DeliveryTemplateImpl = {
  contentKind: 'coverage_hygiene',
  displayName: 'Coverage Hygiene',
  dependsOnSources: ['raw_upstream', 'portfolio'],
  suppressionTtlSeconds: 12 * 60 * 60,

  render({ orgId, now }: TemplateInputs, store: InMemoryStore) {
    const digest = store.listDigests(orgId, { kind: 'coverage_hygiene', limit: 1 })[0] ?? null
    const alerts = store.listAlerts(orgId, { limit: 200 })
      .filter((a) => !a.suppressed)
      .filter((a) => a.kind.startsWith('stale_coverage'))
    if (!digest && alerts.length === 0) return null

    const dateLabel = formatShortDate(now)
    const subject = `Coverage Hygiene — ${dateLabel}`

    const bullets: string[] = []
    if (digest?.executiveSummary) bullets.push(digest.executiveSummary)
    if (alerts.length > 0) {
      bullets.push(`${alerts.length} hygiene flags on book.`)
      for (const a of alerts.slice(0, 4)) bullets.push(`• ${a.headline}`)
    }
    const text = [subject, '', ...bullets].join('\n')
    const markdown = [`*${subject}*`, '', ...bullets].join('\n')
    const summary = {
      title: subject,
      subtitle: `${alerts.length} hygiene flags`,
      bullets: bullets.slice(0, 5),
      counts: { hygiene_flags: alerts.length },
      badges: [],
    }
    return buildPayload({
      contentKind: 'coverage_hygiene', subject, text, markdown, summary,
      clickThrough: { tab: 'mybook', entityId: null },
    })
  },
}
