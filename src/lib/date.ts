import type { Iso8601 } from '../domain/common'

export function nowIso(): Iso8601 {
  return new Date().toISOString()
}

// Construct an ISO timestamp from a 'YYYY-MM-DD' date and an 'HH:mm' time.
// Useful for authoring mock fixtures with human-readable dates.
export function isoAt(date: string, time = '00:00'): Iso8601 {
  return new Date(`${date}T${time}:00Z`).toISOString()
}

export function isBefore(a: Iso8601, b: Iso8601): boolean {
  return Date.parse(a) < Date.parse(b)
}

export function daysAgo(iso: Iso8601, fromIso: Iso8601 = nowIso()): number {
  const ms = Date.parse(fromIso) - Date.parse(iso)
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function withinWindow(
  iso: Iso8601,
  since: Iso8601 | undefined,
  until: Iso8601 | undefined,
): boolean {
  if (since && Date.parse(iso) < Date.parse(since)) return false
  if (until && Date.parse(iso) > Date.parse(until)) return false
  return true
}
