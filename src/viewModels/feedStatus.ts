import type { FeedStatusPayload } from '../adapters'

export type FeedStatusTone = 'live' | 'delayed' | 'error' | 'waiting' | 'idle'

export interface FeedStatusViewModel {
  readonly tone: FeedStatusTone
  readonly label: string
  readonly itemsToday: number | null
  readonly lastExtractionIso: string | null
  readonly lastSyncIso: string | null
  readonly errorNote: string | null
}

/**
 * Derive the four-state chip view-model from the server-output payload.
 *
 *   waiting  → no payload yet from the backend ("Waiting for feed")
 *   idle     → backend connected but no extracted items today ("No extracted items yet")
 *   live     → backend sending real activity ("Feed live · N today")
 *   delayed  → backend reporting partial trouble ("Feed delayed")
 *   error    → backend reporting outright failure ("Feed unavailable")
 *
 * The dashboard never *infers* a "live" state from data alone; the backend
 * must claim status='live'. This matches the cofounder's contract: the
 * server is authoritative.
 */
export function buildFeedStatusViewModel(
  payload: FeedStatusPayload | null,
): FeedStatusViewModel {
  if (!payload || payload.status === 'waiting') {
    return {
      tone: 'waiting',
      label: 'Waiting for feed',
      itemsToday: null,
      lastExtractionIso: null,
      lastSyncIso: null,
      errorNote: payload?.message ?? null,
    }
  }

  if (payload.status === 'error') {
    return {
      tone: 'error',
      label: 'Feed unavailable',
      itemsToday: payload.itemsToday,
      lastExtractionIso: payload.lastExtractionReceivedAt,
      lastSyncIso: payload.lastSuccessfulSyncAt,
      errorNote: payload.message ?? 'Backend feed reported an error.',
    }
  }

  if (payload.status === 'delayed') {
    return {
      tone: 'delayed',
      label: 'Feed delayed',
      itemsToday: payload.itemsToday,
      lastExtractionIso: payload.lastExtractionReceivedAt,
      lastSyncIso: payload.lastSuccessfulSyncAt,
      errorNote: payload.message ?? 'Backend feed is running behind.',
    }
  }

  // status === 'live'. If the backend hasn't extracted any items today, surface
  // an honest "no extracted items yet" instead of "Feed live · 0 today".
  const items = payload.itemsToday
  if (items == null || items === 0) {
    return {
      tone: 'idle',
      label: 'No extracted items yet',
      itemsToday: items,
      lastExtractionIso: payload.lastExtractionReceivedAt,
      lastSyncIso: payload.lastSuccessfulSyncAt,
      errorNote: payload.message ?? null,
    }
  }

  return {
    tone: 'live',
    label: 'Feed live',
    itemsToday: items,
    lastExtractionIso: payload.lastExtractionReceivedAt,
    lastSyncIso: payload.lastSuccessfulSyncAt,
    errorNote: payload.message ?? null,
  }
}
