import { useEffect, useState } from 'react'
import {
  subscribe, getSnapshot, type DiagnosticsSnapshot,
} from '../adapters/upstream/diagnostics'
import { assessAllScreens, SCREEN_READINESS } from '../adapters/upstream/screenReadiness'
import { isProductionMode } from '../adapters/AdapterMode'
import { getActiveAdapterMode } from '../adapters'

// ─────────────────────────────────────────────────────────────────────────
// DevDiagnosticsChip — dev-only floating chip showing upstream integration
// health. Renders nothing in production. Safe to always mount; the first
// render returns null when dev mode is off.
//
// Collapsed: a single row "upstream · mock · 8 ok · 0 degraded · 0 err".
// Expanded (click): per-resource table + per-screen readiness + warnings.
// ─────────────────────────────────────────────────────────────────────────

function useDiagnostics(): DiagnosticsSnapshot {
  const [snap, setSnap] = useState<DiagnosticsSnapshot>(() => getSnapshot())
  useEffect(() => subscribe(setSnap), [])
  return snap
}

function useIsDev(): boolean {
  try { return !!import.meta.env?.DEV } catch { return false }
}

export default function DevDiagnosticsChip() {
  const isDev = useIsDev()
  const snap = useDiagnostics()
  const [open, setOpen] = useState(false)

  if (!isDev) return null
  // Also hide when running the production upstream adapter — in that
  // context the chip would be misleading for demos.
  const mode = getActiveAdapterMode()
  if (isProductionMode(mode) && !import.meta.env?.DEV) return null

  const okCount       = snap.calls.filter((c) => c.outcome === 'ok').length
  const degradedCount = snap.degradedKeys.size
  const errCount      = snap.erroredKeys.size
  const totalScreens  = SCREEN_READINESS.length
  const screenReports = assessAllScreens(snap.loadedKeys, snap.erroredKeys)
  const usableScreens = screenReports.filter((r) => r.verdict !== 'blocked').length
  const blockedScreens = screenReports.filter((r) => r.verdict === 'blocked').length

  const statusColor = errCount > 0 || blockedScreens > 0 ? 'rose' : degradedCount > 0 ? 'amber' : 'emerald'
  const statusDot = `w-1.5 h-1.5 rounded-full bg-${statusColor}-500`

  return (
    <div
      className="fixed bottom-3 right-3 z-50 select-none"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-ink-900/90 border border-line/20 text-[11px] text-slate-200 shadow-lg hover:bg-ink-900"
        aria-label="Toggle upstream diagnostics"
      >
        <span className={statusDot} />
        <span className="tabular-nums">upstream</span>
        <span className="text-slate-400">·</span>
        <span className="tabular-nums">{mode}</span>
        <span className="text-slate-400">·</span>
        <span className="tabular-nums">{usableScreens}/{totalScreens} screens{blockedScreens > 0 ? ` (${blockedScreens} blocked)` : ''}</span>
        <span className="text-slate-400">·</span>
        <span className="tabular-nums text-emerald-400">{okCount} ok</span>
        <span className="tabular-nums text-amber-400">{degradedCount} deg</span>
        <span className="tabular-nums text-rose-400">{errCount} err</span>
      </button>

      {open && (
        <div className="mt-2 w-[420px] max-h-[60vh] overflow-auto rounded-md bg-ink-900/95 border border-line/20 p-3 text-[11px] text-slate-200 shadow-2xl">
          <DiagSummary snap={snap} mode={mode} />
          <ScreenReadinessList reports={screenReports} />
          <ResourceTable snap={snap} />
          <WarningsList warnings={snap.warnings} />
          <div className="mt-2 text-slate-500">
            Tip: run <code className="text-slate-300">window.__upstreamDiagnostics()</code> in the console for the full dump.
          </div>
        </div>
      )}
    </div>
  )
}

function DiagSummary({ snap, mode }: { snap: DiagnosticsSnapshot; mode: string }) {
  return (
    <div className="mb-2 pb-2 border-b border-line/10">
      <div>mode: <span className="text-slate-300">{mode}</span></div>
      <div>
        scope:{' '}
        {snap.scope ? (
          <span className="text-slate-300">{snap.scope.orgId} / {snap.scope.actingUserId}</span>
        ) : <span className="text-slate-500">unresolved</span>}
      </div>
    </div>
  )
}

function ScreenReadinessList({
  reports,
}: { reports: ReturnType<typeof assessAllScreens> }) {
  return (
    <div className="mb-2 pb-2 border-b border-line/10">
      <div className="text-slate-400 uppercase tracking-wider mb-1">Screens</div>
      <table className="w-full">
        <tbody>
          {reports.map((r) => {
            const tone = r.verdict === 'ready' ? 'text-emerald-400'
              : r.verdict === 'degraded' ? 'text-amber-400'
              : 'text-rose-400'
            return (
              <tr key={r.key} className="align-top">
                <td className="pr-2">{r.key}</td>
                <td className={`pr-2 ${tone}`}>{r.verdict}</td>
                <td className="text-slate-500">
                  {r.missingRequired.length > 0 && <>need: {r.missingRequired.join(', ')}</>}
                  {r.missingRequired.length === 0 && r.missingOptional.length > 0 && <>degraded: {r.missingOptional.join(', ')}</>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ResourceTable({ snap }: { snap: DiagnosticsSnapshot }) {
  const sorted = [...snap.calls].sort((a, b) => a.key.localeCompare(b.key))
  if (sorted.length === 0) {
    return <div className="text-slate-500 italic mb-2">no adapter calls recorded yet</div>
  }
  return (
    <div className="mb-2 pb-2 border-b border-line/10">
      <div className="text-slate-400 uppercase tracking-wider mb-1">Resources</div>
      <table className="w-full">
        <tbody>
          {sorted.map((c) => {
            const tone = c.outcome === 'ok' ? 'text-emerald-400'
              : c.outcome === 'degraded' ? 'text-amber-400'
              : c.outcome === 'error' ? 'text-rose-400'
              : 'text-slate-500'
            return (
              <tr key={c.key} className="align-top">
                <td className="pr-2">{c.key}</td>
                <td className={`pr-2 ${tone}`}>{c.outcome}</td>
                <td className="pr-2 text-slate-500 tabular-nums">{c.durationMs ?? '–'}ms</td>
                <td className="text-slate-500">{c.detail ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function WarningsList({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null
  return (
    <div>
      <div className="text-slate-400 uppercase tracking-wider mb-1">Warnings ({warnings.length})</div>
      <ul className="space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-slate-400">{w}</li>
        ))}
      </ul>
    </div>
  )
}
