import type { DisagreementDimension } from './types'

// Display topic per dimension. Used by the view layer and by the engine's
// own narrative templates.
export const DIMENSION_TOPICS: Readonly<Record<DisagreementDimension, string>> = {
  stance:               'Overall stance',
  rating:               'Rating',
  target_price:         'Target price / valuation',
  growth:               'Growth assumptions',
  margin:               'Margin assumptions',
  demand_or_pricing:    'Demand / pricing',
  order_book:           'Order book / pipeline',
  timing_or_catalyst:   'Timing / catalyst',
  management_execution: 'Management / execution',
}

// Keyword → dimension mapping. First match wins. Order matters: specific
// rules must precede broader ones (e.g. 'order book' before 'growth'
// because "order" substring would match growth's 'order book' keyword
// otherwise).
export const THEME_DIMENSION_RULES: readonly {
  readonly dimension: DisagreementDimension
  readonly keywords: readonly string[]
}[] = [
  {
    dimension: 'margin',
    keywords: ['margin', 'nim', 'ebitda', 'operating margin', 'gross margin'],
  },
  {
    dimension: 'order_book',
    keywords: ['order book', 'order inflow', 'backlog', 'pipeline'],
  },
  {
    dimension: 'management_execution',
    keywords: ['execution', 'management', 'governance', 'capex discipline', 'capital return'],
  },
  {
    dimension: 'timing_or_catalyst',
    keywords: ['catalyst', 'launch', 'inflection', 'exit', 'rate cut', 'ramp', 'trough'],
  },
  {
    dimension: 'demand_or_pricing',
    keywords: ['demand', 'pricing', 'rural', 'volume', 'arpu', 'tariff', 'competitive'],
  },
  {
    dimension: 'growth',
    keywords: [
      'growth', 'deal tcv', 'deal ramp', 'discretionary spend', 'bfsi',
      'tam', 'revenue trajectory', 'genai attach', 'retail ebitda',
      'retail credit', 'deposits',
    ],
  },
  {
    dimension: 'target_price',
    keywords: ['sum-of-parts', 'valuation', 'multiple'],
  },
]

/**
 * Deterministic theme → dimension classifier. Returns `null` when no rule
 * matches — such themes still contribute to consensus/disagreement at the
 * stance and target_price level, just not as a domain-specific signal.
 */
export function classifyTheme(theme: string): DisagreementDimension | null {
  const t = theme.toLowerCase()
  for (const rule of THEME_DIMENSION_RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.dimension
  }
  return null
}

export function topicForDimension(dim: DisagreementDimension): string {
  return DIMENSION_TOPICS[dim]
}
