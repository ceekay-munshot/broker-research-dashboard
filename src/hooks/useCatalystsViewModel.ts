import { useAdapterQuery, type QueryResult } from './useAdapterQuery'
import type { CatalystEvent, PortfolioSnapshot } from '../domain'
import {
  buildCatalystsViewModel, type CatalystsViewModel,
} from '../viewModels/catalysts'

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

  if (catalysts.loading || portfolio.loading) return { data: null, loading: true, error: null }
  if (catalysts.error) return { data: null, loading: false, error: catalysts.error }

  const degradations: string[] = []
  if ((catalysts.data ?? []).length === 0) degradations.push('No catalysts have been ingested yet.')
  if (!portfolio.data) degradations.push('No portfolio configured — calendar will rank generically.')

  const vm = buildCatalystsViewModel({
    catalysts: catalysts.data ?? [],
    portfolio: portfolio.data ?? null,
    degradations,
  })
  return { data: vm, loading: false, error: null }
}
