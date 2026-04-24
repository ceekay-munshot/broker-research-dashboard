import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { OrgScope } from '../domain'
import { getResearchAdapter } from '../adapters'
import { onScopeBootstrapChanged } from './scopeBootstrap'

// The scope the entire running app reads against. Resolved once at bootstrap
// via `adapter.getSessionScope()` — which, in `upstream` mode, ultimately
// returns whatever scope the externally-supplied bearer token encodes.
// Nothing here authenticates; authentication is upstream's job.
//
// When the host swaps the externally-supplied scope (token refresh, org
// switch, etc.), this context invalidates: the scope clears, every in-flight
// query is discarded, and `getSessionScope()` re-runs. The generation
// counter threads through `useAdapterQuery` so views re-fetch cleanly
// without ever mixing data across tenants.

export interface ScopeContextValue {
  readonly scope: OrgScope
  /** Increments on every scope swap. Query hooks include this in their
   *  effective dependency set, so a scope change flushes cached data. */
  readonly generation: number
  /** Re-resolve the scope from the adapter. Host-visible via useScope(). */
  readonly reload: () => void
}

const ScopeContext = createContext<ScopeContextValue | null>(null)

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<OrgScope | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [generation, setGeneration] = useState(0)
  const reloadTokenRef = useRef(0)

  const reload = useCallback(() => {
    // Bump the reload token; the effect below sees the new value and
    // re-fetches. Increment the generation immediately so any pending
    // queries from the old scope drop their results.
    reloadTokenRef.current += 1
    setScope(null)
    setError(null)
    setGeneration((g) => g + 1)
  }, [])

  // Resolve the scope on mount and every time `reload()` bumps the token.
  useEffect(() => {
    const token = reloadTokenRef.current
    let cancelled = false
    getResearchAdapter().getSessionScope()
      .then((s) => {
        if (cancelled || reloadTokenRef.current !== token) return
        setScope(s)
      })
      .catch((e) => {
        if (cancelled || reloadTokenRef.current !== token) return
        setError(e instanceof Error ? e : new Error(String(e)))
      })
    return () => { cancelled = true }
  }, [generation])

  // The host may swap `window.__BROKER_RESEARCH_DASHBOARD__` or post a
  // `broker-research:scope-changed` message. Either triggers a full reload
  // so the next scope replaces the prior one atomically.
  useEffect(() => {
    return onScopeBootstrapChanged(() => reload())
  }, [reload])

  if (error) {
    return <BootstrapMessage tone="error" text={`Failed to resolve session: ${error.message}`} />
  }
  if (!scope) {
    return <BootstrapMessage tone="loading" text="Resolving session…" />
  }
  return (
    <ScopeContext.Provider value={{ scope, generation, reload }}>
      {children}
    </ScopeContext.Provider>
  )
}

export function useScope(): OrgScope {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScope called outside ScopeProvider')
  return ctx.scope
}

/** Full context (scope + generation + reload). Used by useAdapterQuery and
 *  by any UI that wants to force a re-resolve. */
export function useScopeContext(): ScopeContextValue {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScopeContext called outside ScopeProvider')
  return ctx
}

function BootstrapMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
