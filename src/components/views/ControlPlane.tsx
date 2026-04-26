// Read-only Control Plane tab — operator/admin surface.
//
// Shows the resolved org settings: flags, modules, permissions,
// integrations, delivery routing, rollout state, recent audit.
// Operator/admin roles see four small write actions (toggle a flag,
// flip a source mode, set rollout state, set module access). Everything
// is audited.

import { useState } from 'react'
import type {
  FeatureFlagKey, AccessibleModule, SourceKind, SourceProviderMode,
  RolloutState,
} from '../../domain'
import { useOrgSettings } from '../../hooks/useOrgSettings'
import {
  buildControlPlaneViewModel, ROLLOUT_STATE_TONE, SOURCE_BADGE_TONE,
} from '../../viewModels/orgControl'
import { getResearchAdapter } from '../../adapters'
import { useScopeContext } from '../../app/ScopeContext'
import SessionSafetyPanel from '../sessionSafety/SessionSafetyPanel'

export default function ControlPlane() {
  const { scope } = useScopeContext()
  const { data, loading, error } = useOrgSettings()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [bumpKey, setBumpKey] = useState(0)

  if (error) return <ViewMessage tone="error" text={`Error: ${error.message}`}/>
  if (loading || !data) return <ViewMessage tone="loading" text="Loading control plane…"/>

  const vm = buildControlPlaneViewModel(data)
  const refresh = () => setBumpKey((k) => k + 1)
  void bumpKey  // forces a re-render after a write action — the next adapter call returns fresh data

  if (!vm.hasData) {
    return (
      <div className="flex flex-col gap-4">
        <Header role="analyst" rolloutState="pilot" rolloutNote={null} orgId="—"/>
        <div className="panel p-6 text-center text-[12px] text-slate-400">
          <div className="text-slate-200 font-medium text-[14px] mb-1">No org settings yet</div>
          <p className="max-w-md mx-auto">
            The active adapter doesn't expose Module-27. Run <code className="kbd">npm run server:dev</code> + <code className="kbd">VITE_RESEARCH_ADAPTER=http</code> to see live control-plane state.
          </p>
        </div>
      </div>
    )
  }

  const onToggleFlag = async (key: FeatureFlagKey, enabled: boolean) => {
    setBusyKey(`flag:${key}`)
    try {
      await getResearchAdapter().setFeatureFlag(scope, { key, enabled, reason: 'toggled from control plane' })
      refresh()
    } finally { setBusyKey(null) }
  }
  const onToggleModule = async (module: AccessibleModule, enabled: boolean) => {
    setBusyKey(`module:${module}`)
    try {
      await getResearchAdapter().setModuleAccess(scope, { module, enabled, reason: 'toggled from control plane' })
      refresh()
    } finally { setBusyKey(null) }
  }
  const onSetSourceMode = async (sourceKind: SourceKind, mode: SourceProviderMode) => {
    setBusyKey(`source:${sourceKind}`)
    try {
      await getResearchAdapter().setSourceMode(scope, { sourceKind, mode, reason: 'switched from control plane' })
      refresh()
    } finally { setBusyKey(null) }
  }
  const onSetRollout = async (state: RolloutState) => {
    setBusyKey(`rollout`)
    try {
      await getResearchAdapter().setRolloutState(scope, { state, reason: 'set from control plane' })
      refresh()
    } finally { setBusyKey(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Header role={vm.currentUserRole} rolloutState={vm.rolloutState} rolloutNote={vm.rolloutNote} orgId={vm.orgId}/>

      <SessionSafetyPanel/>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Rollout state</h3>
        <p className="text-slate-500 text-[11px]">
          Derived from sources health + delivery flags + adaptive ranking.
          {vm.rolloutNote && <span className="ml-1 text-slate-400">— "{vm.rolloutNote}"</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(['pilot', 'compare_only', 'adaptive_on', 'delivery_on', 'production', 'degraded'] as const).map((s) => (
            <button
              key={s}
              disabled={!vm.canWrite || busyKey === 'rollout'}
              onClick={() => onSetRollout(s)}
              className={`chip text-[10.5px] uppercase tracking-wider border ${ROLLOUT_STATE_TONE[s]} ${vm.rolloutState === s ? 'ring-1 ring-accent' : 'opacity-70 hover:opacity-100'} ${vm.canWrite ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >{s.replace('_', ' ')}</button>
          ))}
        </div>
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-slate-100 text-[13px] font-semibold">Feature flags ({vm.featureFlags.length})</h3>
            <p className="text-slate-500 text-[11px]">{vm.counts.flagsOverridden} org-overridden · rest from env defaults.</p>
          </div>
        </div>
        <table className="w-full text-[11.5px]">
          <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
            <tr><th className="text-left py-1">Key</th><th>Value</th><th>Source</th><th className="text-right">Toggle</th></tr>
          </thead>
          <tbody>
            {vm.featureFlags.map((f) => (
              <tr key={f.key} className="border-t border-line/5">
                <td className="py-1 text-slate-200 font-mono">{f.key}</td>
                <td className={f.enabled ? 'text-emerald-300' : 'text-slate-500'}>{f.enabled ? 'on' : 'off'}</td>
                <td><span className={`chip text-[9.5px] uppercase tracking-wider border ${SOURCE_BADGE_TONE[f.source]}`}>{f.source.replace('_', ' ')}</span></td>
                <td className="text-right">
                  <button
                    disabled={!vm.canWrite || busyKey === `flag:${f.key}`}
                    onClick={() => onToggleFlag(f.key, !f.enabled)}
                    className={`chip text-[10px] border ${vm.canWrite ? 'border-line/20 text-slate-300 hover:text-accent cursor-pointer' : 'border-line/10 text-slate-500 cursor-not-allowed'}`}
                  >{f.enabled ? 'turn off' : 'turn on'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Source integrations ({vm.integrations.length})</h3>
        <p className="text-slate-500 text-[11px]">{vm.counts.integrationsOverridden} org-overridden.</p>
        <table className="w-full text-[11.5px]">
          <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
            <tr><th className="text-left py-1">Source</th><th>Mode</th><th>Source</th><th>Staleness</th><th className="text-right">Switch</th></tr>
          </thead>
          <tbody>
            {vm.integrations.map((i) => {
              const next = i.mode === 'http' ? 'fixture' : 'http'
              return (
                <tr key={i.sourceKind} className="border-t border-line/5">
                  <td className="py-1">{i.sourceKind}</td>
                  <td>{i.mode}</td>
                  <td><span className={`chip text-[9.5px] uppercase tracking-wider border ${SOURCE_BADGE_TONE[i.source]}`}>{i.source.replace('_', ' ')}</span></td>
                  <td className="num">{Math.round(i.stalenessThresholdSeconds / 60)}m</td>
                  <td className="text-right">
                    <button
                      disabled={!vm.canWrite || busyKey === `source:${i.sourceKind}`}
                      onClick={() => onSetSourceMode(i.sourceKind, next as SourceProviderMode)}
                      className={`chip text-[10px] border ${vm.canWrite ? 'border-line/20 text-slate-300 hover:text-accent cursor-pointer' : 'border-line/10 text-slate-500 cursor-not-allowed'}`}
                    >→ {next}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Module access ({vm.modules.length})</h3>
        <p className="text-slate-500 text-[11px]">{vm.counts.modulesOverridden} org-overridden.</p>
        <table className="w-full text-[11.5px]">
          <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
            <tr><th className="text-left py-1">Module</th><th>Enabled</th><th>Source</th><th className="text-right">Toggle</th></tr>
          </thead>
          <tbody>
            {vm.modules.map((m) => (
              <tr key={m.module} className="border-t border-line/5">
                <td className="py-1">{m.module}</td>
                <td className={m.enabled ? 'text-emerald-300' : 'text-rose-300'}>{m.enabled ? 'yes' : 'no'}</td>
                <td><span className={`chip text-[9.5px] uppercase tracking-wider border ${SOURCE_BADGE_TONE[m.source]}`}>{m.source.replace('_', ' ')}</span></td>
                <td className="text-right">
                  <button
                    disabled={!vm.canWrite || busyKey === `module:${m.module}`}
                    onClick={() => onToggleModule(m.module, !m.enabled)}
                    className={`chip text-[10px] border ${vm.canWrite ? 'border-line/20 text-slate-300 hover:text-accent cursor-pointer' : 'border-line/10 text-slate-500 cursor-not-allowed'}`}
                  >{m.enabled ? 'disable' : 'enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Delivery routing ({vm.deliveryRouting.length})</h3>
        <p className="text-slate-500 text-[11px]">Per-content-kind enable + channels (org override of subscription config).</p>
        <table className="w-full text-[11.5px]">
          <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
            <tr><th className="text-left py-1">Content kind</th><th>Enabled</th><th>Channels</th><th>Source</th></tr>
          </thead>
          <tbody>
            {vm.deliveryRouting.map((d) => (
              <tr key={d.contentKind} className="border-t border-line/5">
                <td className="py-1">{d.contentKind}</td>
                <td className={d.enabled ? 'text-emerald-300' : 'text-slate-500'}>{d.enabled ? 'yes' : 'no'}</td>
                <td>{d.channels.join(', ') || '—'}</td>
                <td><span className={`chip text-[9.5px] uppercase tracking-wider border ${SOURCE_BADGE_TONE[d.source]}`}>{d.source.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Permissions ({vm.permissions.length})</h3>
        <p className="text-slate-500 text-[11px]">Granted roles for this org. Set via CLI; not editable here.</p>
        {vm.permissions.length === 0 ? (
          <div className="text-[11.5px] text-slate-500">No grants yet — the default acting user is treated as admin until permissions are seeded.</div>
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="text-slate-500 text-[10.5px] uppercase tracking-wider">
              <tr><th className="text-left py-1">User</th><th>Role</th><th>Granted at</th><th>Granted by</th></tr>
            </thead>
            <tbody>
              {vm.permissions.map((p) => (
                <tr key={p.id as unknown as string} className="border-t border-line/5">
                  <td className="py-1">{p.userId as unknown as string}</td>
                  <td>{p.role}</td>
                  <td className="num">{p.grantedAt.slice(0, 19).replace('T', ' ')}</td>
                  <td>{(p.grantedBy as unknown as string) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel p-3 flex flex-col gap-2">
        <h3 className="text-slate-100 text-[13px] font-semibold">Recent audit ({vm.recentAudit.length})</h3>
        {vm.recentAudit.length === 0 ? (
          <div className="text-[11.5px] text-slate-500">No config changes recorded yet.</div>
        ) : (
          <ul className="text-[11px] text-slate-300 flex flex-col gap-1">
            {vm.recentAudit.map((a) => (
              <li key={a.id as unknown as string} className="border-t border-line/5 pt-1">
                <span className="text-slate-500 num">{a.occurredAt.slice(0, 19).replace('T', ' ')}</span>{' '}
                <span className="text-slate-400">[{a.area}]</span>{' '}
                <span className="text-slate-200">{a.key}</span>{' '}
                <span className="text-slate-500">·</span>{' '}
                <span>{a.before ?? 'null'} → {a.after ?? 'null'}</span>
                {a.reason && <span className="text-slate-500"> · {a.reason}</span>}
                {a.actorRole && <span className="text-slate-500"> · by {a.actorRole}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Header({
  role, rolloutState, rolloutNote, orgId,
}: {
  role: import('../../domain').UserRole
  rolloutState: RolloutState
  rolloutNote: string | null
  orgId: string
}) {
  return (
    <header className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-slate-100 font-semibold text-base">Control Plane</h2>
        <p className="text-slate-400 text-[12px]">
          Module 27 — org settings, flags, integrations, delivery routing, rollout state, audit.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Org</span>
          <span className="num text-slate-200 text-[12px] font-semibold">{orgId}</span>
        </div>
        <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Your role</span>
          <span className="text-slate-200 text-[12px] font-semibold uppercase">{role}</span>
        </div>
        <div className={`flex items-baseline gap-1.5 px-2 py-1 rounded border ${ROLLOUT_STATE_TONE[rolloutState]}`}>
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Rollout</span>
          <span className="text-[12px] font-semibold uppercase tracking-wider">{rolloutState.replace('_', ' ')}</span>
        </div>
        {rolloutNote && (
          <span className="text-[10.5px] text-slate-500 max-w-[280px] truncate" title={rolloutNote}>"{rolloutNote}"</span>
        )}
      </div>
    </header>
  )
}

function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
