# Org control plane / permissions / governance / rollout (Module 27)

> Org-scoped governance over what's enabled, who can see what, which
> providers are bound, where deliveries route, and where each org sits
> in the rollout journey. Everything is audited.

## Roles

| Role     | Sees                                                      | Can write |
| -------- | --------------------------------------------------------- | --------- |
| viewer   | analyst surfaces (My Book, Briefing, Worklog, Catalysts…) | no        |
| analyst  | same as viewer                                             | no        |
| pm       | same as viewer                                             | no        |
| operator | analyst surfaces + Sources + Pilot Analytics + Control Plane | yes (operator-only writes) |
| admin    | everything                                                 | yes (full control plane) |

Analyst surfaces stay read-only regardless of role. The Sources, Pilot
Analytics, and Control Plane tabs are operator-gated; they don't appear
in the tab list for analyst/pm/viewer roles.

The active session today is treated as `admin` until real auth is wired
(out of scope). The mock adapter returns `admin` so the operator UI is
exercised end-to-end in dev.

## Feature flags

Eleven canonical keys. Env vars stay as global defaults; the resolver
tags every effective value with its source: `env` / `org_override` /
`default`.

```
adaptive_ranking.enabled
adaptive_ranking.show_compare
delivery.email.enabled
delivery.slack.enabled
delivery.webhook.enabled
delivery.scheduler.enabled
sources.portfolio.real_provider
sources.catalyst_calendar.real_provider
sources.market_data.real_provider
usage.tracking.enabled
control_plane.writes_enabled
```

`org:flag --key=<key> --on|--off --note="reason"` writes the override and
records an audit entry. The Control Plane tab shows each flag's current
value, source, and a small toggle button when the active role can write.

## Module access

Per-org enable/disable for each tab module. Off ⇒ tab hidden for everyone.
Useful for "this fund hasn't paid for Catalysts yet" or "we're piloting
Pilot Analytics with Vimana only".

```
mybook briefing worklog dashboard broker stock divergence sector
calibration catalysts sources inbox usage control_plane
```

## Integration config

Per-source mode override of the env-driven `SOURCE_<KIND>_*` config.
**Only the mode crosses `/v1`** — `baseUrl` and `tokenEnvName` stay env-only
so secrets never round-trip through the API or the browser. The resolver
merges env defaults + persisted overrides into one effective mode.

```sh
# Move portfolio source to real HTTP for one org without redeploying.
npm run ops -- org:source-mode --kind=portfolio --mode=http --note="real prod source for Vimana"
```

## Delivery routing config

Per-content-kind enable/disable + channel list. Effectively wraps the
Module-25 env-driven subscriptions with an explicit org override path.
The resolver returns the effective routing.

## Permissions

Simple grants: `(orgId, userId, role, grantedAt, grantedBy)`. Set via
CLI; not editable in the browser. Consumed by the resolver to compute
the `AccessScope` (which surfaces are accessible + which are writable).

## Audit trail

Every write action funnels through `appendAudit()` in `server/src/orgControl/audit.ts`.
Each entry: `(area, key, before, after, actorUserId, actorRole, reason, occurredAt)`.
The Control Plane tab shows the most recent 20 entries; the CLI lists more.

```sh
npm run ops -- org:audit --limit=50
```

## Rollout states

Deterministic rollout state derived from the resolved settings + sources health:

| State           | Meaning |
| --------------- | --- |
| `pilot`         | no real sources, no real channels, no adaptive ranking |
| `compare_only`  | adaptive compare-mode flag on, ranking still uses baseline |
| `adaptive_on`   | adaptive ranking flag on, no real channels |
| `delivery_on`   | ≥ 1 real channel (email / slack / webhook) enabled |
| `production`    | adaptive on + ≥ 1 real channel + all sources healthy |
| `degraded`      | ≥ 1 source `failing` — overrides everything else |

An operator can override the derived state with `org:rollout --state=<state>`
to pin the org in a known stage during a coordinated rollout.

## Operator workflows

```sh
# Inspect
npm run ops -- org:settings                  # full effective settings
npm run ops -- org:flags                     # flag table
npm run ops -- org:modules                   # module-access table
npm run ops -- org:permissions               # role grants
npm run ops -- org:audit --limit=50          # recent config changes
npm run ops -- org:compare --a=org_aranya --b=org_vimana   # diff two orgs

# Write
npm run ops -- org:flag --key=adaptive_ranking.enabled --on --note="enable for vimana"
npm run ops -- org:source-mode --kind=portfolio --mode=http --note="prod portfolio API"
npm run ops -- org:module --module=catalysts --off --note="not contracted yet"
npm run ops -- org:rollout --state=production --note="all sources healthy + delivery on"

# Export
npm run ops -- org:export-rollout --out=rollout-vimana-2026-04-26.json
```

## Env-only vs org-configurable

| Concern                         | Where it lives | Why |
| ------------------------------- | -------------- | --- |
| Secrets (tokens, webhook URLs)  | env only       | Secrets never round-trip through `/v1` |
| Source `baseUrl`                | env only       | URLs don't belong in a browser-shipped settings doc |
| Source provider mode            | env default + org override | The "is this real or fixture for THIS fund?" question |
| Feature flags                   | env default + org override | Per-org rollout pacing |
| Module access                   | env default + org override | Per-fund packaging |
| Delivery subscription targets   | env only (today) | Channel addresses are deployment-config-shaped |
| Delivery routing enable/disable | env default + org override | Per-fund channel rollout |
| Rollout state override          | persisted only  | Deliberate operator decision |

## How an operator rolls out one new fund from pilot → production safely

The control plane is designed so each step is small, audited, and
reversible. Walking through onboarding a new fund (`org_newfund`):

1. **Bootstrap permissions.** `npm run ops -- org:permissions` — confirm
   the analyst user(s) have the `analyst` role and the operator has
   `operator` or `admin`. Without this, analysts can't see the analyst
   surfaces and operators can't see Sources / Pilot Analytics.
2. **Confirm pilot baseline.** `npm run ops -- org:settings --org=org_newfund`.
   The resolver should report `rollout=pilot`, every source mode `fixture`,
   every flag `off` (env defaults). Audit should be empty.
3. **Open the Control Plane tab.** Verify analysts see only analyst tabs
   when their role is `analyst`. Switch your own role to operator and
   verify Sources / Pilot Analytics / Control Plane appear.
4. **Turn compare-mode on first.**
   ```sh
   npm run ops -- org:flag --org=org_newfund --key=adaptive_ranking.show_compare --on --note="staging compare"
   ```
   Resolver moves to `compare_only`. Analysts see the rank-Δ chip but the
   ordering is still baseline. Run for a day; check `usage:compare-ranking`
   to see whether adaptive opens are directionally faster.
5. **Promote to adaptive.**
   ```sh
   npm run ops -- org:flag --org=org_newfund --key=adaptive_ranking.enabled --on --note="adaptive ranking on"
   ```
   Resolver moves to `adaptive_on`. Pilot Analytics keeps reporting hedged
   ranking-experiment notes; revert via the same CLI if the hedged note
   turns negative.
6. **Bring up real sources one at a time.**
   ```sh
   npm run ops -- org:source-mode --org=org_newfund --kind=portfolio --mode=http --note="real portfolio API"
   npm run ops -- sources:sync --kind=portfolio
   npm run ops -- sources:health
   ```
   Repeat for `catalyst_calendar` and `market_data`. After each flip,
   confirm the source comes up `healthy` in `sources:health`. If it's
   `failing`, the resolver pushes the org to `degraded` and the morning
   brief defers — that's the safe path.
7. **Enable a real delivery channel.**
   Flip the env flag for the real channel (email / slack / webhook) per
   the channel-by-channel rollout in `docs/delivery.md`, then mirror it
   per-org:
   ```sh
   npm run ops -- org:flag --org=org_newfund --key=delivery.email.enabled --on
   ```
   Resolver moves to `delivery_on`. Use `delivery:preview` first; once a
   live `delivery:run-due` lands cleanly, promote.
8. **Pin to production.** When the rollout looks good (all sources
   healthy, ≥ 1 real channel sending, adaptive ranking on with a
   directional-positive note in `usage:compare-ranking`):
   ```sh
   npm run ops -- org:rollout --org=org_newfund --state=production --note="vimana production rollout"
   ```
9. **Verify the audit trail.** `npm run ops -- org:audit --org=org_newfund --limit=50` should show the
   ordered sequence of changes you just made, each with the `--note`
   you supplied. This is the artifact for the rollout review meeting.
10. **Compare against a known-good org.**
    `npm run ops -- org:compare --a=org_newfund --b=org_aranya`
    flags any flag/source-mode that differs from the reference org —
    a fast pre-launch sanity check.
11. **Roll back any single piece without affecting others.** Every step
    is one CLI call away from reversal. Audit makes it obvious who
    changed what and why.

The Control Plane tab makes the same operations available in-browser to
the operator/admin role, with the audit list updating live so two
operators can coordinate without stepping on each other.

## What this module deliberately does **not** do

- Full auth / SSO / user provisioning — out of scope. Permissions are
  CLI-managed; the active session role is treated as admin until real
  auth is wired.
- Editing secrets from the browser — never. Secrets stay env-only.
- Bulk fleet-wide config changes — every change is per-org and audited.
- A giant edit-anything UI — the four operator-only writes (flag,
  module, source mode, rollout state) cover the actual rollout journey
  cleanly. Anything beyond that goes through the CLI.
