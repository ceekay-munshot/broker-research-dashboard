#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────
// Integration readiness verdict.
//
// Single command that runs every check this repo has against the upstream
// contract, with or without real samples dropped into
// `upstream-samples/`. Produces one of three final verdicts:
//
//   READY              — fixtures valid, contract tests pass, any real
//                        samples are shape-compatible.
//   NEEDS MAPPER WORK  — harmless drift detected in real samples; can be
//                        absorbed by the normalize layer but you should
//                        inspect the compare report.
//   BLOCKED            — contract tests fail, or real samples have
//                        blocking drift (missing required fields, type
//                        mismatches on required fields).
//
// Intended usage: after the upstream team hands over sample payloads,
// drop them in `upstream-samples/` and run `npm run upstream:ready`.
// ─────────────────────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESOURCE_CATALOG } from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..', '..')
const samplesDir = join(repoRoot, 'upstream-samples')
const fixturesDir = join(repoRoot, 'src', 'adapters', 'upstream', 'fixtures')

interface Step {
  readonly name: string
  readonly verdict: 'pass' | 'warn' | 'fail' | 'skipped'
  readonly detail?: string
}

const steps: Step[] = []

function addStep(s: Step): void { steps.push(s) }

function run(cmd: string, args: readonly string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// ── Step 1: fixtures parse as JSON ────────────────────────────────────────

function step1_fixtureJson(): void {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))
  const bad: string[] = []
  for (const f of files) {
    try { JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) }
    catch (e) { bad.push(`${f}: ${(e as Error).message}`) }
  }
  if (bad.length > 0) {
    addStep({ name: 'fixture json parse', verdict: 'fail', detail: bad.join('; ') })
  } else {
    addStep({ name: 'fixture json parse', verdict: 'pass', detail: `${files.length} fixtures parsed` })
  }
}

// ── Step 2: contract tests on current fixtures ────────────────────────────

function step2_contractTests(): void {
  const r = run('npx', ['tsx', 'src/adapters/upstream/__tests__/contract.ts'])
  if (r.code !== 0) {
    addStep({ name: 'contract tests', verdict: 'fail', detail: tailLines(r.stdout || r.stderr, 10) })
  } else {
    const lastLine = r.stdout.trim().split('\n').slice(-1)[0] ?? ''
    addStep({ name: 'contract tests', verdict: 'pass', detail: lastLine })
  }
}

// ── Step 3: sample presence + required-endpoint coverage ──────────────────

function step3_sampleCoverage(): void {
  if (!existsSync(samplesDir)) {
    addStep({ name: 'samples present', verdict: 'skipped', detail: 'upstream-samples/ does not exist' })
    return
  }
  const files = readdirSync(samplesDir).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    addStep({ name: 'samples present', verdict: 'skipped', detail: 'no samples dropped yet' })
    return
  }
  const requiredCatalog = RESOURCE_CATALOG.filter((s) => s.requirement === 'required')
  // Map catalog keys → fixture filenames (same filename-style mapping used
  // by compare.ts).
  const catalogToFixture: Record<string, string> = {
    sessionScope: 'session-scope.json',
    organization: 'organization.json',
    currentUser: 'me.json',
    brokers: 'brokers.json',
    sectors: 'sectors.json',
    stocks: 'stocks.json',
    researchReports: 'research-reports.json',
    kpiSnapshot: 'kpi-snapshot.json',
    ingestionStatus: 'ingestion-status.json',
  }
  const missing: string[] = []
  for (const r of requiredCatalog) {
    const fn = catalogToFixture[r.key]
    if (fn && !files.includes(fn)) missing.push(`${r.key} (expected ${fn})`)
  }
  if (missing.length > 0) {
    addStep({
      name: 'required-endpoint samples',
      verdict: 'warn',
      detail: `${missing.length} required endpoint(s) have no sample yet: ${missing.join(', ')}`,
    })
  } else {
    addStep({
      name: 'required-endpoint samples',
      verdict: 'pass',
      detail: `all required endpoints have samples (${files.length} total)`,
    })
  }
}

// ── Step 4: sample compatibility (diff) ───────────────────────────────────

function step4_compareSamples(): void {
  if (!existsSync(samplesDir) || readdirSync(samplesDir).filter((f) => f.endsWith('.json')).length === 0) {
    addStep({ name: 'sample compatibility', verdict: 'skipped', detail: 'no samples to compare' })
    return
  }
  const r = run('npx', ['tsx', 'src/adapters/upstream/__tests__/compare.ts'])
  const lastLines = tailLines(r.stdout, 20)
  if (r.code === 0) {
    addStep({ name: 'sample compatibility', verdict: 'pass', detail: lastLines })
  } else {
    addStep({ name: 'sample compatibility', verdict: 'fail', detail: lastLines })
  }
}

// ── Verdict ───────────────────────────────────────────────────────────────

function renderAndVerdict(): void {
  process.stdout.write(`\n=== upstream integration readiness ===\n\n`)
  for (const s of steps) {
    const tag = s.verdict === 'pass' ? '✓'
      : s.verdict === 'warn' ? '⚠'
      : s.verdict === 'fail' ? '✗'
      : '·'
    process.stdout.write(`  ${tag} ${s.name.padEnd(32)} ${s.verdict}\n`)
    if (s.detail) {
      for (const line of s.detail.split('\n')) {
        process.stdout.write(`        ${line}\n`)
      }
    }
  }

  const anyFail = steps.some((s) => s.verdict === 'fail')
  const anyWarn = steps.some((s) => s.verdict === 'warn')

  process.stdout.write(`\nverdict: `)
  if (anyFail) {
    process.stdout.write(`BLOCKED\n`)
    process.stdout.write(`  fix the failing steps above before pointing the dashboard at the real upstream.\n`)
    process.exit(1)
  }
  if (anyWarn) {
    process.stdout.write(`NEEDS MAPPER WORK\n`)
    process.stdout.write(`  some upstream samples show harmless drift (normalize.ts absorbs it) or are missing.\n`)
    process.stdout.write(`  review \`npm run upstream:compare\` output, then copy samples into src/adapters/upstream/fixtures/.\n`)
    process.exit(0)
  }
  process.stdout.write(`READY\n`)
  process.stdout.write(`  dashboard is compatible with the current fixtures and samples.\n`)
}

function tailLines(s: string, n: number): string {
  const lines = s.trim().split('\n')
  return lines.slice(Math.max(0, lines.length - n)).join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────

step1_fixtureJson()
step2_contractTests()
step3_sampleCoverage()
step4_compareSamples()
renderAndVerdict()
