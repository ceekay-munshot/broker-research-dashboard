// Read-only Session Safety panel — operator/admin only.
//
// Mounted at the top of the Control Plane tab. Surfaces:
//   - current session role, auth mode, expiry
//   - production-safety verdict with explicit unsafe/dev-only/production banner
//   - the security checks (verifier, signature, expiry)
//   - last N denied-access events

import { useSessionSafety } from '../../hooks/useSessionSafety'
import {
  buildSessionSafetyViewModel, CHECK_TONE,
} from '../../viewModels/sessionSafety'

export default function SessionSafetyPanel() {
  const { data, loading } = useSessionSafety()
  if (loading) return null
  const vm = buildSessionSafetyViewModel(data ?? null)
  if (!vm.hasData) return null

  const verdictClass =
    vm.verdictTone === 'emerald' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/[0.06]'
    : vm.verdictTone === 'rose'    ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
    :                                 'text-amber-300 border-amber-500/40 bg-amber-500/[0.06]'

  const verdictLabel =
    vm.verdict === 'production_safe' ? 'PRODUCTION-SAFE'
    : vm.verdict === 'dev_only'        ? 'DEV-ONLY'
    :                                     'UNSAFE'

  return (
    <section className="panel p-3 flex flex-col gap-2">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-slate-100 text-[13px] font-semibold">Session Safety</h3>
          <p className="text-slate-500 text-[11px]">Module 28 — auth verifier + tenant-isolation status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <div className="flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/10 bg-line/[0.02]">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Auth mode</span>
            <span className="text-slate-200 text-[12px] font-semibold">{vm.authMode}</span>
          </div>
          <div className={`flex items-baseline gap-1.5 px-2 py-1 rounded border ${verdictClass}`}>
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Status</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider">{verdictLabel}</span>
          </div>
          <span className="text-[11px] text-slate-400">{vm.currentSessionLabel}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1 mt-1">
        {vm.checks.map((c) => (
          <li key={c.id} className="text-[11px] text-slate-300 flex items-start gap-2">
            <span className={`chip border text-[9.5px] uppercase tracking-wider ${CHECK_TONE[c.status]}`}>{c.status}</span>
            <span className="flex-1"><strong className="text-slate-200">{c.title}</strong> — <span className="text-slate-400">{c.detail}</span></span>
          </li>
        ))}
      </ul>

      {vm.recentDenials.length > 0 && (
        <details className="text-[10.5px] text-slate-500 mt-1">
          <summary className="cursor-pointer hover:text-slate-300">Recent denied-access events ({vm.recentDenials.length})</summary>
          <ul className="mt-1 ml-3 flex flex-col gap-0.5">
            {vm.recentDenials.map((d) => (
              <li key={d.id as unknown as string}>
                <span className="num">{d.occurredAt.slice(0, 19).replace('T', ' ')}</span>{' '}
                <span className="text-rose-300">{d.reason}</span>{' '}
                <span className="text-slate-400">{d.method} {d.route}</span>
                {d.detail && <span className="text-slate-500"> · {d.detail}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
