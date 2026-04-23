import type { Page } from '../domain/common'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

// Opaque cursor: a 1-based offset encoded as a base64 string. The real
// adapter will use a server-generated cursor (e.g. a keyset); the shape is
// intentionally opaque at the interface boundary so the encoding can change
// without touching callers.
function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`)
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0
  try {
    const raw = atob(cursor)
    const [prefix, n] = raw.split(':')
    if (prefix !== 'o') return 0
    const parsed = Number.parseInt(n ?? '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export function paginate<T>(
  all: readonly T[],
  cursor: string | null | undefined,
  limit: number | undefined,
): Page<T> {
  const cappedLimit = Math.min(Math.max(1, limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const offset = decodeCursor(cursor)
  const end = offset + cappedLimit
  const slice = all.slice(offset, end)
  const nextCursor = end < all.length ? encodeCursor(end) : null
  return {
    items: slice,
    nextCursor,
    totalCount: all.length,
  }
}
