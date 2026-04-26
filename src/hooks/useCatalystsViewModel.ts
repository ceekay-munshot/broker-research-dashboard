import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CatalystEvent, PortfolioSnapshot, SourcesHealthSnapshot } from '../domain'
import {
  buildCatalystsViewModel, type CatalystsViewModel,
} from '../viewModels/catalysts'
import { stalenessDegradationsForKinds } from '../viewModels/sources'

export function useCatalystsViewModel(): QueryResult<CatalystsViewModel> {
  const catalysts = useAdapterQuery<readonly CatalystEvent[]>(
    async (a, s) => {
      try { return await a.listCatalysts(s) }
      catch { return [] }
    },
    [],
  )
  const portfolio = useAdapterQuery<PortfolioSnapshot | null>(
    async (a, s) => {
      try { return await a.getPortfolioSnapshot(s) }
      catch { return null }
    },
    [],
  )
  const sourcesQ = useAdapterQuery<SourcesHealthSnapshot | null>(
    async (a, s) => { try { return await a.getSourcesHealth(s) } catch { return null } },
    [],
  )

  if (catalysts.loading || portfolio.loading) return { data: null, loading: true, error: null }
  if (catalysts.error) return { data: null, loading: false, error: catalysts.error }

  const degradations: string[] = []
  if ((catalysts.data ?? []).length === 0) degradations.push('No catalysts have been ingested yet.')
  if (!portfolio.data) degradations.push('No portfolio configured — calendar will rank generically.')
  for (const note of stalenessDegradationsForKinds(sourcesQ.data ?? null, ['catalyst_calendar', 'portfolio'])) {
    degradations.unshift(note)
  }

  const vm = buildCatalystsViewModel({
    catalysts: catalysts.data ?? [],
    portfolio: portfolio.data ?? null,
    degradations,
  })
  return { data: vm, loading: false, error: null }
}
