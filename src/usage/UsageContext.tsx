// React boot helper: configures the Usage client once we have an adapter
// + scope, and re-configures when scope changes.

import { useEffect } from 'react'
import { configureUsage, flushUsage } from './UsageClient'
import { getResearchAdapter } from '../adapters'
import { useScopeContext } from '../app/ScopeContext'

/** Mount this near the top of `<App>` so the singleton emitter is wired
 *  with the current scope. No props; reads from context. */
export function UsageBoot(): null {
  const { scope, generation } = useScopeContext()
  useEffect(() => {
    configureUsage(getResearchAdapter(), scope)
    return () => { flushUsage() }
  }, [scope.orgId, scope.actingUserId, generation])
  return null
}
