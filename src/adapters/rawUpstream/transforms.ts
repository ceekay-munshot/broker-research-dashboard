// ─────────────────────────────────────────────────────────────────────────
// Composable transform primitives for the raw-upstream bridge.
//
// Every transform has the same signature: `(unknown) => unknown`. They
// are designed to compose cleanly:
//
//   const norm = compose(
//     unwrapEnvelope(['data', 'response']),
//     camelCaseKeys(),
//     rename({ organization_id: 'id' }),
//     wrapAsPage('results', { cursorFrom: 'next' }),
//   )
//
// No side effects, no type assertions beyond what each transform
// declares. Transforms that can't apply (wrong type, key absent) return
// the input untouched — they are tolerant by design, because a bridge
// that throws on weird shapes is worse than one that preserves them for
// the downstream mapper to report precisely.
// ─────────────────────────────────────────────────────────────────────────

import type { EndpointNormalizer } from './types'

// ── Composition ──────────────────────────────────────────────────────────

/** Left-to-right composition: `compose(f, g, h)(x) === h(g(f(x)))`. */
export function compose(...fns: readonly EndpointNormalizer[]): EndpointNormalizer {
  if (fns.length === 0) return (x) => x
  if (fns.length === 1) return fns[0]!
  return (x) => fns.reduce<unknown>((v, fn) => fn(v), x)
}

/** Marker identity transform — useful in profile maps when you want to
 *  explicitly signal "this endpoint is already `/v1`-shaped." */
export const identity: EndpointNormalizer = (x) => x

// ── Envelope unwrap ──────────────────────────────────────────────────────

const DEFAULT_ENVELOPE_KEYS = ['data', 'response', 'result', 'payload'] as const

/**
 * Unwrap `{ <key>: <inner> }` when the object has exactly one key and that
 * key is in the provided list. Defaults to the common envelope names.
 * Applied repeatedly so `{ data: { response: <real> } }` collapses to
 * `<real>` in one pass.
 */
export function unwrapEnvelope(keys: readonly string[] = DEFAULT_ENVELOPE_KEYS): EndpointNormalizer {
  const allowed = new Set(keys)
  return (raw) => {
    let cursor: unknown = raw
    // Bound the loop so a self-referential envelope (which shouldn't
    // happen on JSON anyway) can't spin forever.
    for (let i = 0; i < 6; i++) {
      if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return cursor
      const keysArr = Object.keys(cursor as Record<string, unknown>)
      if (keysArr.length !== 1) return cursor
      const only = keysArr[0]!
      if (!allowed.has(only)) return cursor
      cursor = (cursor as Record<string, unknown>)[only]
    }
    return cursor
  }
}

// ── Key casing ───────────────────────────────────────────────────────────

/** Recursively convert snake_case object keys to camelCase. Arrays and
 *  primitives pass through. Already-camelCase keys are preserved. */
export function camelCaseKeys(): EndpointNormalizer {
  const convert = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(convert)
    if (v === null || typeof v !== 'object') return v
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[snakeToCamel(k)] = convert(val)
    }
    return out
  }
  return convert
}

function snakeToCamel(s: string): string {
  if (!s.includes('_')) return s
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// ── Key rename ───────────────────────────────────────────────────────────

/**
 * Rename specific keys at the top level. For deep renames, chain this
 * with `at(path, rename({...}))`. The canonical key wins: if `{from,to}`
 * exists alongside `to`, the alias is dropped silently.
 */
export function rename(map: Readonly<Record<string, string>>): EndpointNormalizer {
  const entries = Object.entries(map)
  if (entries.length === 0) return identity
  return (raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const obj = { ...(raw as Record<string, unknown>) }
    for (const [from, to] of entries) {
      if (obj[from] !== undefined && obj[to] === undefined) {
        obj[to] = obj[from]
        delete obj[from]
      } else if (obj[from] !== undefined && obj[to] !== undefined) {
        delete obj[from]
      }
    }
    return obj
  }
}

// ── Aliasing (pick first-seen from a list) ───────────────────────────────

/**
 * When the canonical key is absent but one of the aliases is present,
 * move the alias's value to the canonical name. Like `rename` but
 * supports multiple candidate source names.
 */
export function alias(canonical: string, aliases: readonly string[]): EndpointNormalizer {
  return (raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const obj = { ...(raw as Record<string, unknown>) }
    if (obj[canonical] !== undefined) return obj
    for (const a of aliases) {
      if (obj[a] !== undefined) {
        obj[canonical] = obj[a]
        delete obj[a]
        return obj
      }
    }
    return obj
  }
}

// ── Path operations ──────────────────────────────────────────────────────

/** Apply a transform at a nested path. `path` is dot-notated; missing
 *  segments leave the value unchanged. */
export function at(path: string, fn: EndpointNormalizer): EndpointNormalizer {
  const segments = path.split('.').filter((p) => p.length > 0)
  if (segments.length === 0) return fn
  return (raw) => applyAtPath(raw, segments, fn, 0)
}

function applyAtPath(v: unknown, segments: readonly string[], fn: EndpointNormalizer, i: number): unknown {
  if (i === segments.length) return fn(v)
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
  const key = segments[i]!
  const obj = v as Record<string, unknown>
  if (!(key in obj)) return v
  const next = applyAtPath(obj[key], segments, fn, i + 1)
  return { ...obj, [key]: next }
}

/** Extract a nested value by dot-notated path. Returns the input
 *  unchanged if any segment is absent. */
export function pluck(path: string): EndpointNormalizer {
  const segments = path.split('.').filter((p) => p.length > 0)
  if (segments.length === 0) return identity
  return (raw) => {
    let cursor: unknown = raw
    for (const seg of segments) {
      if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return raw
      cursor = (cursor as Record<string, unknown>)[seg]
      if (cursor === undefined) return raw
    }
    return cursor
  }
}

// ── Pagination ───────────────────────────────────────────────────────────

export interface WrapAsPageOptions {
  /** If the item list is nested, where to find it (e.g. `data.results`).
   *  Defaults to the current root when the input is a bare array. */
  readonly itemsAt?: string
  /** Source field for nextCursor (defaults to `nextCursor`). */
  readonly cursorFrom?: string
  /** Source field for totalCount (defaults to `totalCount`). */
  readonly totalFrom?: string
}

/**
 * Normalize any shape into the canonical `{ items, nextCursor, totalCount }`
 * page. Handles three common vendor shapes:
 *   - bare array       → { items: arr, nextCursor: null, totalCount: arr.length }
 *   - `{ items, … }`   → fill missing cursor / count with sensible defaults
 *   - `{ results, next, count }` (with `itemsAt: 'results'`, `cursorFrom: 'next'`, `totalFrom: 'count'`)
 */
export function wrapAsPage(opts: WrapAsPageOptions = {}): EndpointNormalizer {
  const itemsAt = opts.itemsAt
  const cursorFrom = opts.cursorFrom ?? 'nextCursor'
  const totalFrom = opts.totalFrom ?? 'totalCount'
  return (raw) => {
    if (Array.isArray(raw)) {
      return { items: raw, nextCursor: null, totalCount: raw.length }
    }
    if (raw === null || typeof raw !== 'object') return raw
    const obj = raw as Record<string, unknown>
    const items = itemsAt
      ? deepGet(obj, itemsAt)
      : (obj.items ?? obj.results ?? obj.data)
    const arr = Array.isArray(items) ? items : []
    const nextCursor = obj[cursorFrom] ?? obj.nextCursor ?? obj.cursor ?? null
    const totalCount = obj[totalFrom] ?? obj.totalCount ?? obj.total ?? obj.count ?? arr.length
    return { items: arr, nextCursor, totalCount }
  }
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = obj
  for (const seg of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[seg]
    if (cursor === undefined) return undefined
  }
  return cursor
}

// ── Per-element transforms for lists / pages ─────────────────────────────

/** Apply a transform to every element of an array. */
export function mapArray(fn: EndpointNormalizer): EndpointNormalizer {
  return (raw) => Array.isArray(raw) ? raw.map(fn) : raw
}

/** Apply a transform to every element of `items` when the input is a
 *  `Page<T>`-shaped object. Leaves non-page inputs alone. */
export function mapPageItems(fn: EndpointNormalizer): EndpointNormalizer {
  return (raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const obj = raw as Record<string, unknown>
    if (!Array.isArray(obj.items)) return raw
    return { ...obj, items: obj.items.map(fn) }
  }
}

// ── Numeric-string coercion ──────────────────────────────────────────────

/**
 * At the named fields, convert numeric strings to numbers. Non-numeric
 * strings or unparseable values are left in place for the strict
 * `/v1` mapper to reject with a precise field path.
 */
export function coerceNumericFields(fields: readonly string[]): EndpointNormalizer {
  if (fields.length === 0) return identity
  return (raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const obj = { ...(raw as Record<string, unknown>) }
    for (const f of fields) {
      const v = obj[f]
      if (typeof v === 'string' && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) {
        obj[f] = Number(v)
      }
    }
    return obj
  }
}
