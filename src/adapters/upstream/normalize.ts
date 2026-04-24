// ─────────────────────────────────────────────────────────────────────────
// Real-world drift absorption.
//
// Every upstream payload flows through `normalizeUpstreamPayload` before
// the strict mapper runs. Normalization is *disciplined*: it only applies
// transformations that are safe, unambiguous, and universally seen in
// real-world APIs. Field-level coercions (numeric strings, ID aliases)
// are opt-in and happen inside individual mappers at sites where the
// semantics are known.
//
// Transformations applied generically:
//
//   1. Envelope unwrap — if the body is `{ data: … }`, `{ response: … }`,
//      `{ result: … }`, or `{ payload: … }` with no other sibling keys,
//      unwrap to the inner value. Safe because those keys are never
//      meaningful at the top level of our canonical responses.
//
//   2. snake_case → camelCase — convert every object key that contains a
//      lowercase-letter + underscore pattern to its camelCase equivalent.
//      Already-camelCase keys pass through unchanged.
//
// Transformations available opt-in per mapper:
//
//   - `coerceNumericString(v, path)` — accept string "4200" as 4200 at a
//     known numeric field. Throws `ContractViolationError` on unparseable
//     input.
//   - `aliasField(obj, from, to)` — move a renamed field to its canonical
//     name. Intended for alt ID fields like `organization_id` → `id`.
//   - `normalizePagePayload(raw, itemsKey?)` — ensure a `Page<T>` wrapper
//     is present. A bare array becomes `{ items, nextCursor: null,
//     totalCount: items.length }`. Missing `nextCursor` → null. Missing
//     `totalCount` → items.length.
//
// Do not add transformations that silently rename semantic fields at the
// generic level — that would make mappers ambiguous. Put renames in the
// mapper that owns them.
// ─────────────────────────────────────────────────────────────────────────

import { ContractViolationError } from '../errors'
import { warnMissingOptional } from './degraded'

// ── Generic normalize (applied to every mapper's input) ──────────────────

/**
 * Apply the always-on normalizations to a raw payload. Callers pass the
 * endpoint key so warnings and errors surface with context.
 */
export function normalizeUpstreamPayload(raw: unknown, endpointKey: string): unknown {
  const unwrapped = unwrapEnvelope(raw, endpointKey)
  return camelCaseKeysDeep(unwrapped)
}

// ── Envelope unwrap ──────────────────────────────────────────────────────

const ENVELOPE_KEYS = ['data', 'response', 'result', 'payload'] as const

function unwrapEnvelope(raw: unknown, endpointKey: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length !== 1) return raw
  const only = keys[0]!
  if (!(ENVELOPE_KEYS as readonly string[]).includes(only)) return raw
  warnMissingOptional(endpointKey, `<envelope:${only}>`, `unwrapped`)
  return obj[only]
}

// ── Key-case conversion ──────────────────────────────────────────────────

/** Recursively convert every object key from snake_case to camelCase.
 *  Arrays and primitives pass through. Already-camelCase keys are
 *  preserved (the regex doesn't match them). */
export function camelCaseKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camelCaseKeysDeep)
  if (v === null || typeof v !== 'object') return v
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[snakeToCamel(k)] = camelCaseKeysDeep(val)
  }
  return out
}

function snakeToCamel(s: string): string {
  if (!s.includes('_')) return s
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// ── Field-level opt-in coercions ─────────────────────────────────────────

/** Accept a number OR a numeric string at a field that must be numeric.
 *  Leaves null/undefined/non-numeric values untouched — the strict parser
 *  then reports them with full context. */
export function coerceNumericString(v: unknown, path: string): unknown {
  if (typeof v !== 'string') return v
  // Safe numeric pattern: optional sign, digits, optional decimal, optional
  // exponent. Rejects `"1e"`, `" 1 "`, `""`, etc.
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) {
    throw new ContractViolationError(path, `expected number, got unparseable string ${JSON.stringify(v)}`)
  }
  return Number(v)
}

/** Apply a batch of numeric-string coercions to an object in place. Used
 *  inside a mapper for fields that are *known* to be numeric and may
 *  arrive as strings. */
export function coerceNumericFields(
  obj: Record<string, unknown>,
  fields: readonly string[],
  parentPath: string,
): void {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null) continue
    obj[f] = coerceNumericString(obj[f], `${parentPath}.${f}`)
  }
}

// ── Field alias rewrite ──────────────────────────────────────────────────

/**
 * Rewrite an aliased field name to its canonical name. Useful for
 * alt-ID drift like `organizationId` → `id` on the Organization payload,
 * or `orgIdField` variants.
 *
 * - If the canonical name is already present, the alias is ignored (the
 *   canonical wins — no ambiguity).
 * - If only the alias is present, it is moved to the canonical name and
 *   a dev warning is emitted.
 */
export function aliasField(
  obj: Record<string, unknown>,
  canonical: string,
  aliases: readonly string[],
  endpointKey: string,
): void {
  if (obj[canonical] !== undefined) return
  for (const a of aliases) {
    if (obj[a] !== undefined) {
      warnMissingOptional(endpointKey, `<alias:${a}→${canonical}>`, JSON.stringify(obj[a]))
      obj[canonical] = obj[a]
      delete obj[a]
      return
    }
  }
}

// ── Page<T> normalization ────────────────────────────────────────────────

/**
 * Ensure a payload looks like `Page<T>`. Three drift shapes absorbed:
 *
 * - Bare array          → `{ items, nextCursor: null, totalCount: len }`
 * - Envelope already
 *   unwrapped above so
 *   `{ items: [...] }`   → fill missing `nextCursor` / `totalCount`
 * - Pagination wrapper  → map aliases (`cursor` → `nextCursor`,
 *   `total` / `count` → `totalCount`)
 */
export function normalizePagePayload(raw: unknown, endpointKey: string): unknown {
  if (Array.isArray(raw)) {
    warnMissingOptional(endpointKey, '<page:bareArray>', `wrapped into { items, nextCursor: null, totalCount: ${raw.length} }`)
    return { items: raw, nextCursor: null, totalCount: raw.length }
  }
  if (raw === null || typeof raw !== 'object') return raw
  const obj = { ...(raw as Record<string, unknown>) }

  // Cursor aliases
  aliasField(obj, 'nextCursor', ['cursor', 'next', 'nextPageCursor'], endpointKey)
  // Count aliases
  aliasField(obj, 'totalCount', ['total', 'count', 'totalItems'], endpointKey)

  // Fill defaults for partial wrappers that lack cursor / total.
  if (obj.items !== undefined && Array.isArray(obj.items)) {
    if (obj.nextCursor === undefined) {
      warnMissingOptional(endpointKey, 'nextCursor', 'null')
      obj.nextCursor = null
    }
    if (obj.totalCount === undefined) {
      warnMissingOptional(endpointKey, 'totalCount', String(obj.items.length))
      obj.totalCount = obj.items.length
    }
  }
  return obj
}
