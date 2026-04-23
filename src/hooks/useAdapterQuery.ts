import { useEffect, useRef, useState } from 'react'
import type { OrgScope } from '../domain'
import type { ResearchAdapter } from '../adapters'
import { getResearchAdapter } from '../adapters'
import { useScope } from '../app/ScopeContext'

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
 * The scope is supplied implicitly from ScopeContext and is included in the
 * effective dependency set so views transparently re-fetch on org switch.
 * Stale responses from a prior `fetch` are discarded when the deps change.
 */
export function useAdapterQuery<T>(
  fetch: (adapter: ResearchAdapter, scope: OrgScope) => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const scope = useScope()
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
  // The caller's `deps` plus the scope form the effective dependency set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.orgId, scope.actingUserId, ...deps])

  return { data, loading, error }
}
