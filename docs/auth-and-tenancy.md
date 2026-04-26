# Authenticated session handoff + tenant isolation (Module 28)

> Replaces Module 27's admin-by-default with verified sessions, route-
> level permission gating, and persisted denied-access audit. Existing
> analyst surfaces stay read-only; production fails closed when auth is
> not properly configured.

## Why

Module 27 introduced an org control plane but treated the active session
as `admin` until real auth was wired. Module 28 closes that gap:
- Every `/v1` request runs through a `SessionVerifier` middleware before
  the route handler sees it.
- The verified session — never raw headers — is the single source of
  truth for `orgId`, `userId`, and `role`.
- Each route declares a required role; the middleware enforces it and
  records denied-access events.
- Production refuses to boot with a non-production-safe verifier.

## Auth modes

`AUTH_MODE` env picks one of four verifier implementations. The factory
lives at `server/src/auth/verifier.ts`.

| Mode               | Production-safe | Description |
| ------------------ | --------------- | --- |
| `header_signed`    | yes             | Signed `X-Session-*` headers from upstream Munshot, HMAC-SHA256 over a canonicalized field set. Secret is read from `MUNSHOT_SESSION_SECRET`. |
| `bearer_introspect`| yes             | `Authorization: Bearer <token>`; the verifier POSTs to `MUNSHOT_INTROSPECT_URL` and trusts the introspection response. Optional `MUNSHOT_INTROSPECT_CLIENT_ID/SECRET` for Basic auth. |
| `dev_fixture`      | no              | Returns a deterministic fixture session for the configured org/user. Refuses to run when `NODE_ENV=production`. |
| `no_auth`          | no              | Last-resort local mode. Requires `ALLOW_NO_AUTH=1` AND `NODE_ENV !== 'production'`; returns a `viewer` session so analyst surfaces work and operator routes deny. |

Choose with one env var:

```sh
# Production
export AUTH_MODE=header_signed
export MUNSHOT_SESSION_SECRET=<rotated-secret>

# or
export AUTH_MODE=bearer_introspect
export MUNSHOT_INTROSPECT_URL=https://auth.munshot.com/introspect
export MUNSHOT_INTROSPECT_CLIENT_ID=research-dashboard
export MUNSHOT_INTROSPECT_CLIENT_SECRET=<secret>

# Dev
export AUTH_MODE=dev_fixture
export DEV_AUTH_DEFAULT_ORG_ID=org_vimana
export DEV_AUTH_DEFAULT_USER_ID=usr_vimana_pm
export DEV_AUTH_DEFAULT_ROLE=admin   # admin in dev only
```

## The session handoff contract

When `AUTH_MODE=header_signed`, Munshot is expected to forward the
following request headers to the broker-research API:

```
X-Session-Id: sess_xxx
X-Session-Org-Id: org_vimana
X-Session-User-Id: usr_vimana_pm
X-Session-Email: pm@vimanacapital.com
X-Session-Display-Name: Arjun PM
X-Session-Role: admin
X-Session-Issued-At: 2026-04-26T10:00:00Z
X-Session-Expires-At: 2026-04-26T11:00:00Z
X-Session-Key-Id: kid-2026-04
X-Session-Signature: <hex hmac-sha256>
```

The `Signature` is HMAC-SHA256 over `field=value` pairs joined by `;` for
the nine signed fields above (lowercase keys, in the order shown). The
secret is the same on both sides (rotated via `MUNSHOT_SESSION_SECRET`).

## Route permission matrix

`server/src/auth/permissions.ts` declares one entry per protected route.
Three required-role tiers:

| Tier       | Allows                              | Used for |
| ---------- | ----------------------------------- | --- |
| `any`      | viewer / analyst / pm / operator / admin | analyst surfaces, the usage-event ingest |
| `operator` | operator / admin                    | Sources, Pilot Analytics, deliveries inspection, Control Plane reads/writes |
| `admin`    | admin                               | (reserved for future actions) |

Inspect the matrix:

```sh
npm run ops -- route:permissions
```

## Tenant isolation guarantees

The middleware enforces these invariants on every request:

1. **A verified session must exist.** Missing/expired/invalid → `401`.
2. **`X-Org-Id` (when present) must match `session.orgId`.** Mismatch → `403` + denial audit.
3. **The verified role must satisfy the route's required role.** Insufficient role → `403` + denial audit.
4. **Dev verifiers refuse to run in production.** `dev_fixture` and `no_auth` return `production_dev_auth` failures when `NODE_ENV=production`.
5. **The verifier is never bypassed.** The router will respond `500 INTERNAL` if it's wired without a verifier.

The dev-fixture verifier does NOT trust `X-Org-Id` for session identity —
the session is bound to the configured defaults. This guarantees that a
hostile dev client cannot impersonate another org by setting headers.

Tests in `server/src/__tests__/tenantIsolation.ts` assert all of the above.

```sh
npm run test:tenant
```

## Denied-access audit

Every denied request appends a `DeniedAccessEvent` to the Repo with:

- `reason` (`missing_session` / `invalid_signature` / `expired_session` /
  `cross_tenant_request` / `role_denied` / `production_dev_auth` /
  `introspect_failed` / `malformed_session` / `unknown_org`)
- `route` + `method`
- `authMode` of the verifier in effect
- `orgId` (verified) + `actingUserId` (when known)
- `attemptedOrgId` (the `X-Org-Id` that was rejected)
- `attemptedRole` (the role that was insufficient, when applicable)

Operators see the latest entries on the **Session Safety** panel of the
Control Plane tab and via:

```sh
npm run ops -- auth:test-cross-tenant
# (the panel + CLI also surface real denials, not just synthetic tests)
```

## Security checklist (run before every release)

```sh
npm run ops -- security:check
```

Asserts:
- production env is using a production-safe verifier
- required secrets/env are present (HMAC secret, introspect URL)
- `ALLOW_NO_AUTH=1` is not set in production
- dev-fixture admin role is not used in production
- source/delivery secrets are loaded by env-var name only — never round-trip through `/v1`
- the route permission matrix covers every route
- audit trails (control-plane writes + denied-access) are active

## Release checklist

```sh
npm run ops -- release:checklist
```

Composes:
1. `security:check` (auth + isolation)
2. `sources:health`
3. `delivery:list-channels`
4. `usage:roi --days=30`
5. `org:settings` and `org:audit`
6. `npm run test:tenant`

Run each before flipping a real fund into production.

## Verifying tenant safety for a new fund before enabling production

A clean, reproducible procedure for green-lighting `org_newfund`:

1. **Confirm production verifier.** `npm run ops -- auth:whoami` must
   show `mode=header_signed` (or `bearer_introspect`) and
   `production=true`. If `dev_fixture` or `no_auth` shows up, stop —
   set `AUTH_MODE` and the relevant secret env vars.
2. **Run the security check.** `npm run ops -- security:check` must
   exit with `No fail-level findings.` Warnings are OK in dev; fails
   are not.
3. **Run the tenant isolation tests.** `npm run test:tenant` must show
   `8/8 passed`. This proves cross-tenant rejection, role gating,
   missing-session denial, dev-verifier production block, header-signed
   unsigned denial, route-matrix coverage, and role hierarchy.
4. **Spot-check role gating per surface.** From the analyst's seat:
   - Switch to `analyst` role via Munshot. Confirm Sources / Pilot
     Analytics / Control Plane are not visible.
   - Switch to `operator`. Confirm those tabs appear and work.
   - Try forging a request: `curl -H "X-Session-Org-Id: org_otherfund" ...`
     against any analyst endpoint. The middleware should respond `401`
     (no valid signature for that org) — confirm the denial appears in
     `auth:test-cross-tenant`'s audit.
5. **Walk Module-27's pilot → production playbook** (`docs/org-control.md`)
   for `org_newfund` itself. Each `org:flag` / `org:source-mode` /
   `org:rollout` write now requires the verified session to be
   operator+; the audit trail records every change with the actor's
   user id and role.
6. **Confirm denied-access audit is empty for the new fund.** Open the
   Control Plane tab as the operator. The Session Safety panel should
   show the last 0 denials for that org. After the rollout completes,
   re-check; any cross-tenant or role-denied entries point at exact
   misconfigurations.
7. **Pin to production.** Only when (1)–(6) are clean:
   ```sh
   npm run ops -- org:rollout --org=org_newfund --state=production --note="<release-ticket-id>"
   ```
8. **Lock-down checklist.** Before walking away:
   - `ALLOW_NO_AUTH` is unset in production env.
   - `DEV_AUTH_DEFAULT_ROLE` is unset (or not `admin`) in production env.
   - Munshot session secret rotation cadence is documented.
   - `npm run ops -- release:checklist` is part of the deploy pipeline.

The dashboard is now safe to put in front of multiple funds: every
request carries a verified session, each org sees only its own data,
operator surfaces are explicitly role-gated, and every denial is
auditable.

## What this module deliberately does **not** do

- Does not implement a full standalone auth product. Munshot upstream
  (or any compatible IdP) supplies the session contract; we verify it.
- Does not edit secrets. `MUNSHOT_SESSION_SECRET` and channel tokens
  stay env-only. The control plane's session-safety panel shows the
  *key id*, never the secret.
- Does not change the `/v1` shape for analyst surfaces — the middleware
  is invisible to clients other than the explicit auth endpoints.
- Does not re-implement role-based UX outside the existing tab filter
  + Module-27 control-plane writes. Analyst surfaces still render the
  same data they always have.
