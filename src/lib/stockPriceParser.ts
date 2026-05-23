// Pure parser for the Munshot stock-quote endpoint
// (`https://fastapi.muns.io/stock-data`).
//
// The upstream returns a JSON string body whose contents are a flat
// comma-separated list of key=value pairs, e.g.:
//   "Current Price=1354.5,Market Cap=18329734184107.5,Opening Price=1350.0,..."
//
// Parsing has to be defensive: keys can be missing, the wrapping quotes may
// or may not be present, and the only required field for our use case is
// `Current Price` (without it the quote is unusable as CMP).

export interface ParsedQuote {
  readonly currentPrice: number
  readonly previousClose: number | null
  readonly openingPrice: number | null
  readonly dayRange: { readonly low: number; readonly high: number } | null
  readonly yearlyChangePct: number | null
}

export function parseStockQuote(raw: unknown): ParsedQuote | null {
  if (typeof raw !== 'string') return null
  const stripped = stripWrappingQuotes(raw).trim()
  if (stripped === '') return null
  // Reject obvious non-pair payloads early. A valid response always
  // contains "=" inside its first segment.
  if (!stripped.includes('=')) return null

  const fields = new Map<string, string>()
  for (const segment of stripped.split(',')) {
    const eq = segment.indexOf('=')
    if (eq <= 0) continue
    const key = segment.slice(0, eq).trim()
    const value = segment.slice(eq + 1).trim()
    if (key !== '') fields.set(key, value)
  }

  const currentPrice = parseNumber(fields.get('Current Price'))
  if (currentPrice === null) return null

  return {
    currentPrice,
    previousClose: parseNumber(fields.get('Previous Close')),
    openingPrice: parseNumber(fields.get('Opening Price')),
    dayRange: parseRange(fields.get('Day Range')),
    yearlyChangePct: parseNumber(fields.get('Yearly Change (%)')),
  }
}

function stripWrappingQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1)
  }
  return s
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function parseRange(raw: string | undefined): { readonly low: number; readonly high: number } | null {
  if (raw === undefined) return null
  const parts = raw.split('-').map((p) => p.trim())
  if (parts.length !== 2) return null
  const low = parseNumber(parts[0])
  const high = parseNumber(parts[1])
  if (low === null || high === null) return null
  return { low, high }
}
