import { useEffect, useRef, useState } from 'react'
import type { OrgScope } from '../domain'
import type { ResearchAdapter } from '../adapters'
import { getResearchAdapter } from '../adapters'
import { useScopeContext } from '../app/ScopeContext'

export interface QueryResult<T> {
  readonly data: T | null
  readonly loading: boolean
  readonly error: Error | null
}

/**
 * Canonical read hook. The caller supplies:
 *   - `fetch(adapter, scope)` — invoked on every dependency change
 *   - `deps` — primitive fingerprint of everything `fetch` closes over
 *
 * The scope is supplied implicitly from `ScopeContext`. The scope's
 * `generation` counter is included in the effective dependency set so a
 * scope swap (host token refresh, org switch) flushes every query's cached
 * data and re-runs the fetch — the guardrail against cross-tenant mixing.
 *
 * Stale responses from a prior `fetch` are discarded when the deps change.
 */
export function useAdapterQuery<T>(
  fetch: (adapter: ResearchAdapter, scope: OrgScope) => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const { scope, generation } = useScopeContext()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Pin the latest fetcher so the effect body can read it without including
  // the function identity in the dep list (which the caller didn't promise
  // to memoize).
  const fetchRef = useRef(fetch)
  fetchRef.current = fetch

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Clear prior data on scope change so the UI never briefly renders
    // the previous tenant's data under a new scope.
    setData(null)
    const adapter = getResearchAdapter()
    fetchRef.current(adapter, scope)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      })
    return () => { cancelled = true }
  // The caller's `deps` plus the scope + generation form the effective
  // dependency set. `generation` bumps on every host-initiated scope swap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.orgId, scope.actingUserId, generation, ...deps])

  return { data, loading, error }
}
