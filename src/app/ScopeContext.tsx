import React, { createContext, useContext, useEffect, useState } from 'react'
import type { OrgScope } from '../domain'
import { getResearchAdapter } from '../adapters'

// The scope the entire running app reads against. Resolved once at bootstrap
// via `adapter.getSessionScope()` and frozen for the session. All adapter
// calls anywhere in the tree use this same object.

const ScopeContext = createContext<OrgScope | null>(null)

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<OrgScope | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    getResearchAdapter().getSessionScope()
      .then((s) => { if (!cancelled) setScope(s) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return <BootstrapMessage tone="error" text={`Failed to resolve session: ${error.message}`} />
  }
  if (!scope) {
    return <BootstrapMessage tone="loading" text="Resolving session…" />
  }
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

export function useScope(): OrgScope {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('useScope called outside ScopeProvider')
  return scope
}

function BootstrapMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}
