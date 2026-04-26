// Template helpers shared across all renderers.

import { fingerprintPayload } from '../suppression'
import type {
  DeliveryContentKind, DeliveryPayload, DeliveryClickThrough,
  DeliveryPayloadSummary,
} from '../../../../src/domain'

export function buildPayload(args: {
  contentKind: DeliveryContentKind
  subject: string
  text: string
  summary: DeliveryPayloadSummary
  markdown?: string | null
  slackBlocks?: unknown[] | null
  webhookJson?: unknown | null
  clickThrough?: DeliveryClickThrough | null
}): DeliveryPayload {
  const fingerprint = fingerprintPayload({
    contentKind: args.contentKind, subject: args.subject, text: args.text,
  })
  return {
    fingerprint,
    contentKind: args.contentKind,
    subject: args.subject,
    summary: args.summary,
    text: args.text,
    markdown: args.markdown ?? null,
    slackBlocks: args.slackBlocks ?? null,
    webhookJson: args.webhookJson ?? null,
    clickThrough: args.clickThrough ?? null,
  }
}

/** Format a date as "Tue 23 Apr". */
export function formatShortDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const day = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const dom = date.getUTCDate()
  const mon = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${day} ${dom} ${mon}`
}
