// ─────────────────────────────────────────────────────────────────────────
// Module 28 — Tenant isolation tests.
//
// In-process tests that wire the real Router + auth middleware against an
// InMemoryRepo + a synthetic store. Each scenario asserts a tenant-safety
// guarantee. Run with `npm run server:test:tenant`.
//
// No test framework: zero-dep node script. Exits 1 on any failure.
// ─────────────────────────────────────────────────────────────────────────

import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { reply } from '../api/responses'
import type { Repo } from '../persistence'
import { InMemoryRepo } from '../persistence'
import { DevFixtureVerifier } from '../auth/devFixtureVerifier'
import { HeaderSignedVerifier } from '../auth/headerSignedVerifier'
import { authenticate } from '../auth/middleware'
import type { SessionVerifier } from '../auth/types'
import { ROUTE_PERMISSIONS, findRoutePermission, roleAllows } from '../auth/permissions'

interface TestResult { readonly name: string; readonly ok: boolean; readonly detail?: string }

const results: TestResult[] = []

function ok(name: string, detail?: string): void { results.push({ name, ok: true, detail }) }
function fail(name: string, detail: string): void { results.push({ name, ok: false, detail }) }

// ── Test harness ──────────────────────────────────────────────────────

function makeReq(opts: {
  method?: string
  url?: string
  headers?: Record<string, string>
}): IncomingMessage {
  const sock = new Socket()
  const req = new IncomingMessage(sock)
  req.method = opts.method ?? 'GET'
  req.url = opts.url ?? '/v1/session/scope'
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    req.headers[k.toLowerCase()] = v
  }
  return req
}

function makeRes(): { res: ServerResponse; capture: () => { status: number; body: string } } {
  let status = 0
  let body = ''
  const sock = new Socket()
  const req = new IncomingMessage(sock)
  const res = new ServerResponse(req)
  // Intercept writeHead + end + write so we can read what the handler wrote.
  const origWriteHead = res.writeHead.bind(res)
  res.writeHead = ((s: number, ...rest: unknown[]) => {
    status = s
    return (origWriteHead as unknown as (...a: unknown[]) => ServerResponse)(s, ...rest)
  }) as typeof res.writeHead
  const origEnd = res.end.bind(res)
  res.end = ((chunk?: string | Buffer | (() => void)) => {
    if (typeof chunk === 'string') body += chunk
    else if (chunk && typeof chunk !== 'function') body += chunk.toString('utf8')
    return origEnd(chunk as string | Buffer)
  }) as typeof res.end
  res.write = ((chunk: string | Buffer) => {
    if (typeof chunk === 'string') body += chunk
    else body += chunk.toString('utf8')
    return true
  }) as typeof res.write
  return { res, capture: () => ({ status, body }) }
}

async function callMiddleware(
  verifier: SessionVerifier,
  repo: Repo,
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  nodeEnv: string,
): Promise<{ status: number; body: string; passed: boolean }> {
  const req = makeReq({ method, url, headers })
  const { res, capture } = makeRes()
  const session = await authenticate(req, res, new URL(url, 'http://localhost').pathname, method, {
    verifier, repo, nodeEnv,
  })
  if (session) {
    // Middleware accepted — write a noop ok response so the test sees a 200.
    reply.ok(res, { ok: true, role: session.role, orgId: session.orgId })
  }
  const cap = capture()
  return { status: cap.status, body: cap.body, passed: !!session }
}

// ── Scenarios ─────────────────────────────────────────────────────────

async function scenario_orgMismatchRejected(): Promise<void> {
  const repo = new InMemoryRepo()
  const verifier = new DevFixtureVerifier({
    defaultOrgId: 'org_aranya',
    defaultUserId: 'usr_a',
    defaultEmail: 'a@a',
    defaultRole: 'admin',
  })
  const out = await callMiddleware(verifier, repo, '/v1/research-reports', 'GET',
    { 'x-org-id': 'org_vimana' },  // requesting a different org
    'development')
  if (out.passed) fail('cross-tenant request rejected', 'middleware accepted; expected rejection')
  else if (out.status !== 403) fail('cross-tenant returns 403', `got status=${out.status}`)
  else ok('cross-tenant request rejected')
  const denied = repo.listDeniedAccessEvents(null)
  // Denials may live under either the session orgId or null — accept both.
  const all = [...repo.listDeniedAccessEvents(null), ...repo.listDeniedAccessEvents('org_aranya' as never)]
  if (all.length === 0 && denied.length === 0) fail('cross-tenant audit appended', 'no denial event recorded')
  else ok('cross-tenant audit appended')
}

async function scenario_analystCannotReachOperatorRoute(): Promise<void> {
  const repo = new InMemoryRepo()
  const verifier = new DevFixtureVerifier({
    defaultOrgId: 'org_aranya',
    defaultUserId: 'usr_a',
    defaultEmail: 'a@a',
    defaultRole: 'analyst',
  })
  const out = await callMiddleware(verifier, repo, '/v1/sources/health', 'GET',
    { 'x-org-id': 'org_aranya' },
    'development')
  if (out.passed) fail('analyst cannot reach /v1/sources/health', 'middleware accepted analyst on operator route')
  else if (out.status !== 403) fail('analyst → 403 on operator route', `got status=${out.status}`)
  else ok('analyst cannot reach /v1/sources/health')
}

async function scenario_analystCannotPostControlPlane(): Promise<void> {
  const repo = new InMemoryRepo()
  const verifier = new DevFixtureVerifier({
    defaultOrgId: 'org_aranya',
    defaultUserId: 'usr_a',
    defaultEmail: 'a@a',
    defaultRole: 'analyst',
  })
  const out = await callMiddleware(verifier, repo, '/v1/org-control/flag', 'POST',
    { 'x-org-id': 'org_aranya' },
    'development')
  if (out.passed) fail('analyst POST /v1/org-control/flag denied', 'middleware accepted analyst on operator route')
  else if (out.status !== 403) fail('analyst POST → 403', `got status=${out.status}`)
  else ok('analyst POST /v1/org-control/flag denied')
}

async function scenario_devVerifierBlockedInProd(): Promise<void> {
  const repo = new InMemoryRepo()
  const verifier = new DevFixtureVerifier({
    defaultOrgId: 'org_aranya',
    defaultUserId: 'usr_a',
    defaultEmail: 'a@a',
    defaultRole: 'admin',
  })
  const out = await callMiddleware(verifier, repo, '/v1/research-reports', 'GET',
    { 'x-org-id': 'org_aranya' },
    'production')   // production NODE_ENV
  if (out.passed) fail('dev verifier blocked in production', 'verifier accepted in production')
  else if (out.status !== 401) fail('prod dev-auth → 401', `got status=${out.status}`)
  else ok('dev verifier blocked in production')
}

async function scenario_missingSignatureRejected(): Promise<void> {
  const repo = new InMemoryRepo()
  const verifier = new HeaderSignedVerifier({ secret: 'test-secret' })
  // No headers — should fail.
  const out = await callMiddleware(verifier, repo, '/v1/research-reports', 'GET', {}, 'development')
  if (out.passed) fail('header_signed without headers → 401', 'verifier accepted unsigned request')
  else if (out.status !== 401) fail('header_signed unsigned → 401', `got status=${out.status}`)
  else ok('header_signed without headers → 401')
}

async function scenario_routeMatrixCoversAll(): Promise<void> {
  // Every route declared in the matrix should resolve via findRoutePermission.
  let allFound = true
  for (const p of ROUTE_PERMISSIONS) {
    // Replace `:param` with a placeholder for matching.
    const path = p.path.replace(/:[^/]+/g, 'x')
    const found = findRoutePermission(p.method, path)
    if (!found) { allFound = false; fail(`route matrix lookup ${p.method} ${p.path}`, 'not found via lookup'); break }
  }
  if (allFound) ok('route matrix lookup is consistent')
}

async function scenario_roleAllowsRespectsHierarchy(): Promise<void> {
  const cases: Array<{ role: 'analyst' | 'operator' | 'admin'; required: 'any' | 'operator' | 'admin'; expect: boolean }> = [
    { role: 'analyst', required: 'any', expect: true },
    { role: 'analyst', required: 'operator', expect: false },
    { role: 'analyst', required: 'admin', expect: false },
    { role: 'operator', required: 'operator', expect: true },
    { role: 'operator', required: 'admin', expect: false },
    { role: 'admin', required: 'admin', expect: true },
  ]
  for (const c of cases) {
    const got = roleAllows(c.role, c.required)
    if (got !== c.expect) {
      fail(`roleAllows ${c.role} ${c.required}=${c.expect}`, `got ${got}`)
      return
    }
  }
  ok('roleAllows respects hierarchy')
}

// ── Runner ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await scenario_orgMismatchRejected()
  await scenario_analystCannotReachOperatorRoute()
  await scenario_analystCannotPostControlPlane()
  await scenario_devVerifierBlockedInProd()
  await scenario_missingSignatureRejected()
  await scenario_routeMatrixCoversAll()
  await scenario_roleAllowsRespectsHierarchy()

  let pass = 0, failCount = 0
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗'
    console.log(`${tag}  ${r.name}` + (r.detail ? `  — ${r.detail}` : ''))
    if (r.ok) pass++; else failCount++
  }
  console.log(`\n${pass}/${results.length} passed (${failCount} failed)`)
  if (failCount > 0) process.exit(1)
}

main().catch((e) => {
  console.error('[tenant-isolation] fatal', e)
  process.exit(1)
})
