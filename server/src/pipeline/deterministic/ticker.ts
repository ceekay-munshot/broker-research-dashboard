import type { StockTicker } from '../../../../src/domain'
import { stocks as stockCatalog } from '../../config/organizations'
import { asTicker } from '../../../../src/lib/ids'

/**
 * Find every catalog ticker that appears in the text as a whole word.
 * Returns the *full set* (deduplicated) rather than a single best guess —
 * digest emails routinely cover multiple tickers and we let the
 * digest-splitter route them per section.
 */
export function detectTickers(text: string): StockTicker[] {
  if (!text) return []
  const upper = text.toUpperCase()
  const hits = new Set<string>()
  for (const s of stockCatalog) {
    const t = s.ticker as unknown as string
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`)
    if (re.test(upper)) hits.add(t)
  }
  return [...hits].map(asTicker)
}

/** Pick the single best ticker for a non-digest body. Heuristic:
 *  - if the subject contains a single ticker, that wins;
 *  - else if the body mentions exactly one ticker, that wins;
 *  - else null (caller surfaces AMBIGUOUS_TICKER for review). */
export function pickPrimaryTicker(
  subject: string,
  body: string,
): { readonly ticker: StockTicker | null; readonly ambiguous: boolean } {
  const subjectHits = detectTickers(subject)
  if (subjectHits.length === 1) return { ticker: subjectHits[0]!, ambiguous: false }
  const bodyHits = detectTickers(body)
  if (bodyHits.length === 1) return { ticker: bodyHits[0]!, ambiguous: false }
  if (subjectHits.length > 1) return { ticker: null, ambiguous: true }
  if (bodyHits.length > 1) return { ticker: null, ambiguous: true }
  return { ticker: null, ambiguous: false }
}

function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
