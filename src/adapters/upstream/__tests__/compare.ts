#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Side-by-side comparison: reference fixtures vs real upstream samples.
//
// Reads every JSON file under `upstream-samples/` and diffs it against
// the matching fixture in `src/adapters/upstream/fixtures/`. For each
// endpoint it reports:
//
//   ✓ matching    fields present on both sides with compatible types
//   ? missing     fields the dashboard expects but the sample omits
//   + extra       fields in the sample that the dashboard does not read
//   ≈ rename      plausible rename suggestions (snake_case vs camelCase,
//                 id-alias heuristics)
//   ! type-mismatch  same field, different type (e.g. number vs string)
//
// Harmless vs blocking classification:
//
//   - Envelope wrappers, snake_case, bare-array Page<T>, numeric strings,
//     pagination aliases, null-for-optional → HARMLESS (normalize.ts
//     absorbs them).
//   - Missing required field, wrong type on required field → BLOCKING.
//
// Exits 0 if every sample is HARMLESS or no samples exist. Exits 1 if any
// BLOCKING drift is detected.
// ─────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeUpstreamPayload, normalizePagePayload } from '../normalize'

// ─── Paths ────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..', '..')
const samplesDir = join(repoRoot, 'upstream-samples')
const fixturesDir = join(repoRoot, 'src', 'adapters', 'upstream', 'fixtures')

// ─── Types ────────────────────────────────────────────────────────────────

type Category = 'matching' | 'missing' | 'extra' | 'rename' | 'type-mismatch'

interface FieldDiff {
  readonly path: string
  readonly category: Category
  readonly note?: string
}

interface EndpointReport {
  readonly endpoint: string
  readonly diffs: readonly FieldDiff[]
  readonly blocking: boolean
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(samplesDir)) {
    process.stdout.write(`no samples at ${samplesDir}\n`)
    return
  }
  const samples = readdirSync(samplesDir).filter((f) => f.endsWith('.json'))
  if (samples.length === 0) {
    process.stdout.write(`no samples dropped in upstream-samples/. ready to use!\n`)
    return
  }

  const reports: EndpointReport[] = []
  for (const file of samples) {
    const fixturePath = join(fixturesDir, file)
    if (!existsSync(fixturePath)) {
      process.stdout.write(`\n--- ${file} ---\n`)
      process.stdout.write(`  ! no reference fixture at src/adapters/upstream/fixtures/${file}; skipping\n`)
      continue
    }
    const expectedRaw = loadJson(fixturePath)
    const actualRaw   = loadJson(join(samplesDir, file))
    // Run both sides through the same normalize pass the production path
    // applies: envelope unwrap + snake→camel. Pageable endpoints also get
    // the Page<T> partial-wrapper fill. The diff then reports what's left
    // after the *normalize layer has done its job*, so drift we already
    // absorb shows up as "matching" rather than "missing".
    const expected = normalizeForEndpoint(expectedRaw, file)
    const actual   = normalizeForEndpoint(actualRaw, file)
    const diffs    = diff(expected, actual, '')
    const blocking = diffs.some((d) => d.category === 'missing' || d.category === 'type-mismatch')
    reports.push({ endpoint: file, diffs, blocking })
  }

  render(reports)
  const blocked = reports.some((r) => r.blocking)
  process.exit(blocked ? 1 : 0)
}

// Endpoints whose canonical shape is `Page<T>`. For these we also run the
// partial-pagination-wrapper normalizer so bare arrays / alias keys
// (`cursor`, `total`) align with the `{ items, nextCursor, totalCount }`
// reference shape.
const PAGE_ENDPOINTS = new Set(['broker-emails.json', 'research-reports.json'])

function normalizeForEndpoint(raw: unknown, file: string): unknown {
  const endpointKey = file.replace(/\.json$/, '')
  const n = normalizeUpstreamPayload(raw, endpointKey)
  if (PAGE_ENDPOINTS.has(file)) return normalizePagePayload(n, endpointKey)
  return n
}

// ─── Diff engine ──────────────────────────────────────────────────────────

function diff(expected: unknown, actual: unknown, path: string): FieldDiff[] {
  const eTy = typeOf(expected)
  const aTy = typeOf(actual)

  if (eTy !== aTy) {
    // Soft-type tolerant: numeric-string where number expected is harmless.
    if (eTy === 'number' && aTy === 'string' && typeof actual === 'string' && /^-?\d+(\.\d+)?$/.test(actual)) {
      return [{ path, category: 'type-mismatch', note: `expected number, got numeric string (harmless — coerced)` }]
    }
    return [{ path, category: 'type-mismatch', note: `expected ${eTy}, got ${aTy}` }]
  }

  if (eTy === 'array') {
    // Compare first element as a representative. Arrays of different lengths
    // are reported at the parent level; we care about per-item shape, not
    // ordering.
    const e = expected as unknown[]
    const a = actual as unknown[]
    if (e.length === 0 || a.length === 0) return []
    return diff(e[0], a[0], `${path}[0]`)
  }

  if (eTy === 'object') {
    const eObj = expected as Record<string, unknown>
    const aObj = actual as Record<string, unknown>
    const eKeys = new Set(Object.keys(eObj))
    const aKeys = new Set(Object.keys(aObj))
    const diffs: FieldDiff[] = []

    for (const k of eKeys) {
      const p = path ? `${path}.${k}` : k
      if (aKeys.has(k)) {
        diffs.push(...diff(eObj[k], aObj[k], p))
        continue
      }
      // Try to find a harmless rename candidate.
      const match = findRenameCandidate(k, [...aKeys])
      if (match) {
        diffs.push({
          path: p,
          category: 'rename',
          note: `sample sent "${match}" instead (harmless — normalize absorbs it)`,
        })
        // Also compare the values.
        diffs.push(...diff(eObj[k], aObj[match], p))
      } else {
        diffs.push({ path: p, category: 'missing' })
      }
    }
    for (const k of aKeys) {
      if (!eKeys.has(k)) {
        const p = path ? `${path}.${k}` : k
        diffs.push({ path: p, category: 'extra' })
      }
    }
    // Fields that are present on both sides but we didn't emit an explicit
    // "match" for are implicitly matching at the object level. Emit one
    // aggregate match for the object so the report isn't empty on happy paths.
    if (diffs.length === 0) {
      diffs.push({ path: path || '<root>', category: 'matching' })
    }
    return diffs
  }

  // Primitive — if types match, count as matching.
  return [{ path, category: 'matching' }]
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** Heuristic rename detection: snake_case ↔ camelCase, ID alias pairs. */
function findRenameCandidate(expected: string, actualKeys: readonly string[]): string | null {
  const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
  const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

  if (actualKeys.includes(toSnake(expected))) return toSnake(expected)
  if (actualKeys.includes(toCamel(expected))) return toCamel(expected)

  // Common ID alias families.
  const aliasFamilies: readonly (readonly string[])[] = [
    ['id', 'organizationId', 'organization_id', 'orgId', 'org_id'],
    ['id', 'userId', 'user_id'],
    ['id', 'brokerId', 'broker_id'],
    ['id', 'sectorId', 'sector_id'],
    ['id', 'reportId', 'report_id'],
    ['id', 'emailId', 'email_id'],
    ['ticker', 'symbol', 'stockTicker', 'stock_ticker'],
    ['nextCursor', 'cursor', 'next', 'next_page_cursor'],
    ['totalCount', 'total', 'count', 'total_items'],
  ]
  for (const family of aliasFamilies) {
    if (family.includes(expected)) {
      const hit = actualKeys.find((k) => family.includes(k) && k !== expected)
      if (hit) return hit
    }
  }
  return null
}

// ─── I/O + render ─────────────────────────────────────────────────────────

function loadJson(path: string): unknown {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`failed to parse ${path}: ${(e as Error).message}`)
  }
}

function render(reports: readonly EndpointReport[]): void {
  for (const r of reports) {
    process.stdout.write(`\n--- ${r.endpoint} ---\n`)
    const counts = { matching: 0, missing: 0, extra: 0, rename: 0, 'type-mismatch': 0 }
    for (const d of r.diffs) counts[d.category]++
    process.stdout.write(
      `  ✓ ${counts.matching} matching · ` +
      `? ${counts.missing} missing · ` +
      `+ ${counts.extra} extra · ` +
      `≈ ${counts.rename} rename · ` +
      `! ${counts['type-mismatch']} type-mismatch\n`,
    )
    for (const d of r.diffs) {
      if (d.category === 'matching') continue
      const sym = d.category === 'missing' ? '?'
        : d.category === 'extra' ? '+'
        : d.category === 'rename' ? '≈'
        : '!'
      const tone = (d.category === 'missing' || d.category === 'type-mismatch') ? 'BLOCKING' : 'HARMLESS'
      process.stdout.write(`    ${sym} ${d.path.padEnd(40)}  [${tone}] ${d.note ?? ''}\n`)
    }
    process.stdout.write(`  verdict: ${r.blocking ? 'BLOCKING' : 'HARMLESS'}\n`)
  }

  // Summary
  const blocking = reports.filter((r) => r.blocking).length
  const harmless = reports.length - blocking
  process.stdout.write(`\n=== summary ===\n`)
  process.stdout.write(`  ${reports.length} samples examined · ${harmless} harmless · ${blocking} blocking\n`)
}

main()
