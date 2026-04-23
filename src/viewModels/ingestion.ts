import type {
  Broker, BrokerEmail, IngestionStatus, EmailProcessingStatus, EmailId,
} from '../domain'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { indexBy } from './shared'

export interface IngestionChipViewModel {
  readonly queued: number
  readonly processing: number
  readonly failedLast24h: number
  readonly isHealthy: boolean
}

export interface IngestionRowViewModel {
  readonly emailId: EmailId
  readonly subject: string
  readonly brokerName: string
  readonly receivedAt: string
  readonly status: EmailProcessingStatus
  readonly statusMessage: string | null
}

export interface IngestionPanelViewModel {
  readonly chip: IngestionChipViewModel
  readonly recent: readonly IngestionRowViewModel[]
}

interface Inputs {
  readonly status: IngestionStatus
  readonly emails: readonly BrokerEmail[]
  readonly brokers: readonly Broker[]
}

export function buildIngestionChip(status: IngestionStatus): IngestionChipViewModel {
  return {
    queued: status.queued,
    processing: status.processing,
    failedLast24h: status.failedLast24h,
    isHealthy: status.failedLast24h === 0,
  }
}

export function buildIngestionPanel(inputs: Inputs): IngestionPanelViewModel {
  const brokerById = indexBy(inputs.brokers, (b) => b.id as string)
  const recent = [...inputs.emails]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 10)
    .map<IngestionRowViewModel>((e) => ({
      emailId: e.id,
      subject: e.subject,
      brokerName: e.brokerId
        ? brokerById.get(e.brokerId as string)?.shortName ?? '—'
        : '—',
      receivedAt: e.receivedAt,
      status: e.status,
      statusMessage: e.statusMessage,
    }))

  return { chip: buildIngestionChip(inputs.status), recent }
}

export function useIngestionChipViewModel(): QueryResult<IngestionChipViewModel> {
  const status = useAdapterQuery((a, s) => a.getIngestionStatus(s), [])
  if (status.loading) return { data: null, loading: true, error: null }
  if (status.error) return { data: null, loading: false, error: status.error }
  if (!status.data) return { data: null, loading: true, error: null }
  return { data: buildIngestionChip(status.data), loading: false, error: null }
}
