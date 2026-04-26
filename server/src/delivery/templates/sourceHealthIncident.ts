// Source Health Incident — fires only when at least one source is
// `failing`. Always proceeds (the gate is bypassed for this kind because
// the incident IS the gate's signal).

import type { InMemoryStore } from '../../store/InMemoryStore'
import type { DeliveryTemplateImpl, TemplateInputs } from '../types'
import { buildPayload } from './types'

export const sourceHealthIncidentTemplate: DeliveryTemplateImpl = {
  contentKind: 'source_health_incident',
  displayName: 'Source Health Incident',
  dependsOnSources: [],
  suppressionTtlSeconds: 60 * 60,

  render({ sourcesHealth }: TemplateInputs, _store: InMemoryStore) {
    if (!sourcesHealth) return null
    const failing = sourcesHealth.sources.filter((s) => s.status === 'failing')
    if (failing.length === 0) return null

    const subject = failing.length === 1
      ? `Source incident — ${failing[0]!.displayName} failing`
      : `Source incident — ${failing.length} sources failing`

    const bullets: string[] = []
    for (const s of failing) {
      const err = s.lastError?.message ?? 'no error message'
      const consec = s.lastError?.consecutiveFailures ?? 0
      bullets.push(`• ${s.displayName} [${s.kind}] — ${err} (consec=${consec})`)
    }
    bullets.push(`Run \`npm run ops -- sources:retry\` once upstream recovers.`)

    const text = [subject, '', ...bullets].join('\n')
    const markdown = [`*${subject}*`, '', ...bullets].join('\n')
    const summary = {
      title: subject,
      subtitle: `${failing.length} source(s) failing`,
      bullets: bullets.slice(0, 5),
      counts: { failing: failing.length },
      badges: ['INCIDENT'],
    }
    return buildPayload({
      contentKind: 'source_health_incident', subject, text, markdown, summary,
      clickThrough: { tab: 'sources', entityId: null },
    })
  },
}
