// ─────────────────────────────────────────────────────────────────────────
// Operator CLI for the Module-27 control plane.
//
//   npm run ops -- org:settings        [--org=<orgId>]
//   npm run ops -- org:flags           [--org=<orgId>]
//   npm run ops -- org:flag --key=<>   --on|--off [--reason="..."] [--org=<orgId>]
//   npm run ops -- org:modules         [--org=<orgId>]
//   npm run ops -- org:permissions     [--org=<orgId>]
//   npm run ops -- org:audit           [--org=<orgId>] [--limit=<n>]
//   npm run ops -- org:compare         --a=<orgId> --b=<orgId>
//   npm run ops -- org:rollout --state=<state> [--note="..."] [--org=<orgId>]
//   npm run ops -- org:source-mode --kind=<source> --mode=<mode> [--org=<orgId>]
//   npm run ops -- org:export-rollout  [--org=<orgId>] [--out=<path>]
//
// Reads and writes funnel through the same `service.ts` used by the API,
// so audit + role-checks behave identically.
// ─────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs'
import type {
  OrgId, FeatureFlagKey, RolloutState, SourceKind, SourceProviderMode,
  AccessibleModule, OrgSettings,
} from '../../../src/domain'
import { FEATURE_FLAG_KEYS, ROLLOUT_STATES } from '../../../src/domain'
import type { Repo } from '../persistence'
import { resolveOrgSettings } from '../orgControl'
import {
  setFeatureFlag, setSourceMode, setRolloutState, setModuleAccess,
} from '../orgControl/service'
import type { SourceManager } from '../sources'

export interface OrgControlCliFlags {
  readonly orgId: OrgId
  readonly key?: FeatureFlagKey
  readonly enabled?: boolean
  readonly reason?: string | null
  readonly limit?: number
  readonly outPath?: string | null
  readonly compareA?: OrgId
  readonly compareB?: OrgId
  readonly rolloutState?: RolloutState
  readonly rolloutNote?: string | null
  readonly sourceKind?: SourceKind
  readonly sourceMode?: SourceProviderMode
  readonly module?: AccessibleModule
}

export function parseFeatureFlagKey(s: string | undefined): FeatureFlagKey | undefined {
  if (!s) return undefined
  return FEATURE_FLAG_KEYS.includes(s as FeatureFlagKey) ? (s as FeatureFlagKey) : undefined
}

export function parseRolloutState(s: string | undefined): RolloutState | undefined {
  if (!s) return undefined
  return ROLLOUT_STATES.includes(s as RolloutState) ? (s as RolloutState) : undefined
}

function buildSettings(orgId: OrgId, repo: Repo, sourceManager?: SourceManager): OrgSettings {
  return resolveOrgSettings({
    orgId,
    currentUserId: 'cli',
    currentUserRole: 'admin',
    repo,
  }, sourceManager?.snapshot(orgId) ?? null)
}

export function cmdOrgSettings(flags: OrgControlCliFlags, repo: Repo, sourceManager?: SourceManager): void {
  const s = buildSettings(flags.orgId, repo, sourceManager)
  console.log('━'.repeat(72))
  console.log(`Org settings — ${s.orgId as unknown as string}   role=${s.currentUserRole}   rollout=${s.rolloutState}`)
  console.log(`generatedAt=${s.generatedAt}`)
  if (s.notes.rollout) console.log(`note: ${s.notes.rollout}`)
  console.log('━'.repeat(72))
  console.log()
  console.log('Feature flags:')
  for (const f of s.featureFlags) {
    console.log(`  ${f.enabled ? 'on ' : 'off'}  ${f.key.padEnd(40)} (${f.source})`)
  }
  console.log()
  console.log('Modules:')
  for (const m of s.modules) {
    console.log(`  ${m.enabled ? 'yes' : 'no '}  ${m.module.padEnd(20)} (${m.source})`)
  }
  console.log()
  console.log('Source integrations:')
  for (const i of s.integrations) {
    console.log(`  ${i.sourceKind.padEnd(20)} mode=${i.mode.padEnd(10)} (${i.source})  staleness=${Math.round(i.stalenessThresholdSeconds / 60)}m`)
  }
  console.log()
  console.log('Delivery routing:')
  for (const d of s.deliveryRouting) {
    const channels = d.channels.length > 0 ? d.channels.join(',') : '—'
    console.log(`  ${d.contentKind.padEnd(28)} ${d.enabled ? 'on ' : 'off'}  channels=${channels.padEnd(18)} (${d.source})`)
  }
}

export function cmdOrgFlags(flags: OrgControlCliFlags, repo: Repo, sourceManager?: SourceManager): void {
  const s = buildSettings(flags.orgId, repo, sourceManager)
  console.log('flag                                       value  source')
  console.log('-'.repeat(72))
  for (const f of s.featureFlags) {
    console.log(`${f.key.padEnd(42)} ${(f.enabled ? 'on' : 'off').padEnd(6)} ${f.source}`)
  }
}

export function cmdOrgFlag(flags: OrgControlCliFlags, repo: Repo): void {
  if (!flags.key || flags.enabled === undefined) {
    console.error('org:flag requires --key=<key> --on|--off')
    process.exit(2)
  }
  const next = setFeatureFlag({
    orgId: flags.orgId, key: flags.key, enabled: flags.enabled,
    actorUserId: null, actorRole: 'admin',
    reason: flags.reason ?? 'cli',
    repo,
  })
  console.log(`[org:flag] ${flags.orgId as unknown as string}  ${next.key}=${next.enabled ? 'on' : 'off'}  source=${next.source}  ${next.note ?? ''}`)
}

export function cmdOrgModules(flags: OrgControlCliFlags, repo: Repo, sourceManager?: SourceManager): void {
  const s = buildSettings(flags.orgId, repo, sourceManager)
  for (const m of s.modules) {
    console.log(`  ${m.enabled ? 'yes' : 'no '}  ${m.module.padEnd(20)} (${m.source})${m.note ? `  note: ${m.note}` : ''}`)
  }
}

export function cmdOrgPermissions(flags: OrgControlCliFlags, repo: Repo): void {
  const grants = repo.listPermissionGrants(flags.orgId)
  if (grants.length === 0) { console.log('no permission grants for this org'); return }
  for (const g of grants) {
    console.log(`  ${(g.userId as unknown as string).padEnd(28)} role=${g.role.padEnd(10)} grantedAt=${g.grantedAt}`)
  }
}

export function cmdOrgAudit(flags: OrgControlCliFlags, repo: Repo): void {
  const items = repo.listConfigAuditEntries(flags.orgId, { limit: flags.limit ?? 50 })
  if (items.length === 0) { console.log('no audit entries'); return }
  console.log('time                  area              key                            before → after            reason')
  console.log('-'.repeat(120))
  for (const a of items) {
    console.log(
      a.occurredAt.slice(0, 19).replace('T', ' ').padEnd(22) +
      a.area.padEnd(18) +
      a.key.padEnd(32) +
      `${a.before ?? 'null'} → ${a.after ?? 'null'}`.padEnd(28) +
      (a.reason ?? ''),
    )
  }
}

export function cmdOrgCompare(flags: OrgControlCliFlags, repo: Repo, sourceManager?: SourceManager): void {
  if (!flags.compareA || !flags.compareB) {
    console.error('org:compare requires --a=<orgId> --b=<orgId>')
    process.exit(2)
  }
  const a = buildSettings(flags.compareA, repo, sourceManager)
  const b = buildSettings(flags.compareB, repo, sourceManager)
  console.log('━'.repeat(72))
  console.log(`Compare ${a.orgId as unknown as string} vs ${b.orgId as unknown as string}`)
  console.log('━'.repeat(72))
  console.log(`rollout: ${a.rolloutState}   ⇄   ${b.rolloutState}`)
  console.log()
  console.log('Feature flag diffs:')
  for (const fa of a.featureFlags) {
    const fb = b.featureFlags.find((x) => x.key === fa.key)
    if (!fb) continue
    if (fa.enabled !== fb.enabled || fa.source !== fb.source) {
      console.log(`  ${fa.key.padEnd(42)}  A=${fa.enabled ? 'on' : 'off'}/${fa.source.padEnd(13)} B=${fb.enabled ? 'on' : 'off'}/${fb.source}`)
    }
  }
  console.log()
  console.log('Source-mode diffs:')
  for (const ia of a.integrations) {
    const ib = b.integrations.find((x) => x.sourceKind === ia.sourceKind)
    if (!ib) continue
    if (ia.mode !== ib.mode) {
      console.log(`  ${ia.sourceKind.padEnd(20)}  A=${ia.mode.padEnd(10)} B=${ib.mode}`)
    }
  }
}

export function cmdOrgRollout(flags: OrgControlCliFlags, repo: Repo): void {
  if (!flags.rolloutState) {
    console.error(`org:rollout requires --state=<one of ${ROLLOUT_STATES.join('|')}>`)
    process.exit(2)
  }
  setRolloutState({
    orgId: flags.orgId, state: flags.rolloutState, note: flags.rolloutNote ?? undefined,
    actorUserId: null, actorRole: 'admin',
    reason: flags.reason ?? 'cli',
    repo,
  })
  console.log(`[org:rollout] ${flags.orgId as unknown as string}  state=${flags.rolloutState}` +
    (flags.rolloutNote ? `  note: ${flags.rolloutNote}` : ''))
}

export function cmdOrgSourceMode(flags: OrgControlCliFlags, repo: Repo): void {
  if (!flags.sourceKind || !flags.sourceMode) {
    console.error('org:source-mode requires --kind=<source> --mode=<http|fixture|mock|disabled>')
    process.exit(2)
  }
  const next = setSourceMode({
    orgId: flags.orgId, sourceKind: flags.sourceKind, mode: flags.sourceMode,
    actorUserId: null, actorRole: 'admin',
    reason: flags.reason ?? 'cli',
    repo,
  })
  console.log(`[org:source-mode] ${flags.orgId as unknown as string}  ${next.sourceKind}=${next.mode}`)
}

export function cmdOrgModule(flags: OrgControlCliFlags, repo: Repo): void {
  if (!flags.module || flags.enabled === undefined) {
    console.error('org:module requires --module=<module> --on|--off')
    process.exit(2)
  }
  const next = setModuleAccess({
    orgId: flags.orgId, module: flags.module, enabled: flags.enabled,
    actorUserId: null, actorRole: 'admin',
    reason: flags.reason ?? 'cli',
    repo,
  })
  console.log(`[org:module] ${flags.orgId as unknown as string}  ${next.module}=${next.enabled ? 'on' : 'off'}`)
}

export function cmdOrgExportRollout(flags: OrgControlCliFlags, repo: Repo, sourceManager?: SourceManager): void {
  const s = buildSettings(flags.orgId, repo, sourceManager)
  const summary = {
    orgId: s.orgId,
    generatedAt: s.generatedAt,
    rolloutState: s.rolloutState,
    rolloutNote: s.notes.rollout,
    featureFlags: s.featureFlags.map((f) => ({ key: f.key, enabled: f.enabled, source: f.source })),
    integrations: s.integrations.map((i) => ({ sourceKind: i.sourceKind, mode: i.mode, source: i.source })),
    deliveryRouting: s.deliveryRouting.map((d) => ({ contentKind: d.contentKind, enabled: d.enabled, channels: d.channels })),
    modules: s.modules.filter((m) => m.source === 'org_override'),
  }
  if (flags.outPath) {
    writeFileSync(flags.outPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(`[org:export-rollout] wrote ${flags.outPath}`)
    return
  }
  console.log(JSON.stringify(summary, null, 2))
}
