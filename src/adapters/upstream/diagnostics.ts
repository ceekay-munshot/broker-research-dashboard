// ─────────────────────────────────────────────────────────────────────────
// Upstream diagnostics store — dev-mode-only surface.
//
// Module-level state that records every adapter call's outcome plus every
// mapper warning. The dev diagnostics chip reads from here; so does
// `window.__upstreamDiagnostics()` in the browser console. In production
// builds, the recorder is a no-op and the module exports empty snapshots.
// ─────────────────────────────────────────────────────────────────────────

import { __setDiagnosticsWarningSink } from './degraded'

export type ResourceOutcome = 'ok' | 'degraded' | 'error' | 'pending'

export interface ResourceCallRecord {
  readonly key: string
  readonly outcome: ResourceOutcome
  readonly detail?: string
  readonly at: number     // Date.now()
  readonly durationMs?: number
}

export interface DiagnosticsSnapshot {
  readonly calls: readonly ResourceCallRecord[]
  readonly warnings: readonly string[]
  readonly loadedKeys: ReadonlySet<string>
  readonly degradedKeys: ReadonlySet<string>
  readonly erroredKeys: ReadonlySet<string>
  readonly mode: string
  readonly scope: { orgId: string; actingUserId: string } | null
}

type Listener = (snap: DiagnosticsSnapshot) => void

const state = {
  callsByKey: new Map<string, ResourceCallRecord>(),
  warnings: [] as string[],
  mode: 'unknown' as string,
  scope: null as DiagnosticsSnapshot['scope'],
  listeners: new Set<Listener>(),
}

function emit(): void {
  if (state.listeners.size === 0) return
  const snap = getSnapshot()
  for (const l of state.listeners) l(snap)
}

export function isDev(): boolean {
  try {
    return !!import.meta.env?.DEV
  } catch {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  }
}

export function recordResourceCall(record: ResourceCallRecord): void {
  if (!isDev()) return
  // If a later call reports 'degraded' for a key that was 'ok', upgrade it;
  // same-key calls overwrite — we care about the most recent outcome.
  state.callsByKey.set(record.key, record)
  emit()
}

export function recordWarning(message: string): void {
  if (!isDev()) return
  state.warnings.push(message)
  // Keep it bounded; the chip doesn't need more than the last 100.
  if (state.warnings.length > 100) state.warnings.shift()
  emit()
}

// Wire the degraded-mode warning sink so mapper warnings flow into the
// diagnostics store. Runs at module-load; idempotent.
__setDiagnosticsWarningSink(recordWarning)

export function setDiagnosticsMode(mode: string): void {
  state.mode = mode
  emit()
}

export function setDiagnosticsScope(scope: DiagnosticsSnapshot['scope']): void {
  state.scope = scope
  emit()
}

export function resetDiagnostics(): void {
  state.callsByKey.clear()
  state.warnings.length = 0
  emit()
}

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

export function getSnapshot(): DiagnosticsSnapshot {
  const calls = Array.from(state.callsByKey.values())
  const loadedKeys = new Set(calls.filter((c) => c.outcome === 'ok' || c.outcome === 'degraded').map((c) => c.key))
  const degradedKeys = new Set(calls.filter((c) => c.outcome === 'degraded').map((c) => c.key))
  const erroredKeys = new Set(calls.filter((c) => c.outcome === 'error').map((c) => c.key))
  return {
    calls,
    warnings: [...state.warnings],
    loadedKeys,
    degradedKeys,
    erroredKeys,
    mode: state.mode,
    scope: state.scope,
  }
}

// ── Browser console affordance ───────────────────────────────────────────
// Exposes a single callable on window that dumps a readable summary. Only
// installed in dev mode.

if (isDev() && typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__upstreamDiagnostics = () => {
    const s = getSnapshot()
    // eslint-disable-next-line no-console
    console.group(`[upstream] mode=${s.mode} scope=${s.scope?.orgId ?? '–'}/${s.scope?.actingUserId ?? '–'}`)
    // eslint-disable-next-line no-console
    console.table(s.calls.map((c) => ({ key: c.key, outcome: c.outcome, durationMs: c.durationMs ?? '–', detail: c.detail ?? '' })))
    if (s.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.group(`warnings (${s.warnings.length})`)
      // eslint-disable-next-line no-console
      for (const w of s.warnings) console.log(w)
      // eslint-disable-next-line no-console
      console.groupEnd()
    }
    // eslint-disable-next-line no-console
    console.groupEnd()
    return s
  }
}
