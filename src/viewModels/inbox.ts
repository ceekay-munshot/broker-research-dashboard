// ─────────────────────────────────────────────────────────────────────────
// Inbox view-model — read-only surface for delivered items.
//
// Pure transform over `DeliveryAttempt[]`. Groups by date + content kind,
// applies tone classes, builds tooltips.
// ─────────────────────────────────────────────────────────────────────────

import type {
  DeliveryAttempt, DeliveryStatus, DeliveryContentKind, DeliveryChannel,
} from '../domain'
import { TONE_CHIP_CLASS, getDeliveryStatusTone } from '../lib/semanticColor'

export interface InboxRowViewModel {
  readonly attempt: DeliveryAttempt
  readonly statusTone: 'sent' | 'failed' | 'suppressed' | 'queued' | 'retrying' | 'skipped' | 'other'
  readonly channelLabel: string
  readonly when: string
  readonly relativeWhen: string
  readonly contentKindLabel: string
  readonly badges: readonly string[]
}

export interface InboxGroupViewModel {
  readonly key: string
  readonly label: string
  readonly rows: readonly InboxRowViewModel[]
}

export interface InboxViewModel {
  readonly hasData: boolean
  readonly counts: {
    readonly total: number
    readonly sent: number
    readonly failed: number
    readonly suppressed: number
    readonly queued: number
  }
  readonly groups: readonly InboxGroupViewModel[]
}

const KIND_LABEL: Record<DeliveryContentKind, string> = {
  morning_book_brief: 'Morning Book Brief',
  intraday_critical: 'Intraday Critical',
  coverage_hygiene: 'Coverage Hygiene',
  weekly_catalyst_brief: 'Weekly Catalyst Brief',
  source_health_incident: 'Source Health Incident',
}

const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  slack: 'Slack',
  webhook: 'Webhook',
  cli: 'CLI',
}

export function buildInboxViewModel(
  attempts: readonly DeliveryAttempt[],
  now: Date = new Date(),
): InboxViewModel {
  if (attempts.length === 0) {
    return {
      hasData: false,
      counts: { total: 0, sent: 0, failed: 0, suppressed: 0, queued: 0 },
      groups: [],
    }
  }
  const sorted = [...attempts].sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt))
  const counts = {
    total: sorted.length,
    sent: sorted.filter((a) => a.status === 'sent').length,
    failed: sorted.filter((a) => a.status === 'failed').length,
    suppressed: sorted.filter((a) => a.status === 'suppressed').length,
    queued: sorted.filter((a) => a.status === 'queued' || a.status === 'retrying').length,
  }
  const rows = sorted.map<InboxRowViewModel>((a) => ({
    attempt: a,
    statusTone: toTone(a.status),
    channelLabel: CHANNEL_LABEL[a.channel] ?? a.channel,
    when: a.enqueuedAt.slice(0, 16).replace('T', ' '),
    relativeWhen: formatRelative(now, new Date(a.enqueuedAt)),
    contentKindLabel: KIND_LABEL[a.contentKind] ?? a.contentKind,
    badges: a.payloadSummary.badges,
  }))

  // Group by date (YYYY-MM-DD).
  const byDate = new Map<string, InboxRowViewModel[]>()
  for (const r of rows) {
    const k = r.attempt.enqueuedAt.slice(0, 10)
    const arr = byDate.get(k) ?? []
    arr.push(r)
    byDate.set(k, arr)
  }
  const groups: InboxGroupViewModel[] = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, items]) => ({
      key: k,
      label: formatDayLabel(now, k),
      rows: items,
    }))

  return { hasData: true, counts, groups }
}

function toTone(s: DeliveryStatus): InboxRowViewModel['statusTone'] {
  if (s === 'sent') return 'sent'
  if (s === 'failed') return 'failed'
  if (s === 'suppressed') return 'suppressed'
  if (s === 'queued') return 'queued'
  if (s === 'retrying') return 'retrying'
  if (s === 'skipped_freshness' || s === 'skipped_empty') return 'skipped'
  return 'other'
}

// Chip classes per delivery status, projected from the central semantic-tone
// system. Sent is favourable (green), failed unfavourable (red); the in-flight
// states (queued / retrying) are a caution (amber); the rest are neutral.
export const STATUS_CLASS: Record<InboxRowViewModel['statusTone'], string> = {
  sent:       TONE_CHIP_CLASS[getDeliveryStatusTone('sent')],
  failed:     TONE_CHIP_CLASS[getDeliveryStatusTone('failed')],
  suppressed: TONE_CHIP_CLASS[getDeliveryStatusTone('suppressed')],
  queued:     TONE_CHIP_CLASS[getDeliveryStatusTone('queued')],
  retrying:   TONE_CHIP_CLASS[getDeliveryStatusTone('retrying')],
  skipped:    TONE_CHIP_CLASS[getDeliveryStatusTone('skipped')],
  other:      TONE_CHIP_CLASS[getDeliveryStatusTone('other')],
}

function formatRelative(now: Date, when: Date): string {
  const ms = now.getTime() - when.getTime()
  if (ms < 0) return when.toISOString().slice(0, 16).replace('T', ' ')
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function formatDayLabel(now: Date, iso: string): string {
  const today = now.toISOString().slice(0, 10)
  if (iso === today) return 'Today'
  const ydate = new Date(now); ydate.setUTCDate(ydate.getUTCDate() - 1)
  if (iso === ydate.toISOString().slice(0, 10)) return 'Yesterday'
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
