// Tests for the stock-price parser (src/lib/stockPriceParser.ts).
// The upstream response format is brittle (a flat comma-separated string),
// so we lock in the parser's contract here.
// Run: npx tsx src/lib/__tests__/stockPriceParser.ts

import { parseStockQuote } from '../stockPriceParser'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

console.log('stock price parser\n')

// ── 1. Normal success: the exact RELIANCE response we observed ──────────────
{
  const raw =
    'Current Price=1354.5,Market Cap=18329734184107.5,Opening Price=1350.0,'
    + 'Previous Close=1349.0,Day Range=1349.1 - 1367.4,'
    + '52-Week Range=1290.0 - 1611.8,Last Volume=7105813,'
    + '10-Day Average Volume=16288945,3-Month Average Volume=19362657,'
    + '50-Day Moving Average=1375.61,200-Day Moving Average=1430.08,'
    + 'Yearly Change (%)=-5.6'
  const q = parseStockQuote(raw)
  check('normal: parses without throwing', q !== null)
  check('normal: currentPrice === 1354.5', q?.currentPrice === 1354.5, String(q?.currentPrice))
  check('normal: previousClose === 1349.0', q?.previousClose === 1349.0, String(q?.previousClose))
  check('normal: openingPrice === 1350.0', q?.openingPrice === 1350.0, String(q?.openingPrice))
  check('normal: dayRange parsed', q?.dayRange?.low === 1349.1 && q?.dayRange?.high === 1367.4,
    JSON.stringify(q?.dayRange))
  check('normal: yearlyChangePct === -5.6', q?.yearlyChangePct === -5.6, String(q?.yearlyChangePct))
}

// ── 2. Missing optional fields — only Current Price present ─────────────────
{
  const q = parseStockQuote('Current Price=100.0')
  check('sparse: parses with only Current Price', q !== null)
  check('sparse: currentPrice === 100', q?.currentPrice === 100, String(q?.currentPrice))
  check('sparse: previousClose is null', q?.previousClose === null)
  check('sparse: openingPrice is null', q?.openingPrice === null)
  check('sparse: dayRange is null', q?.dayRange === null)
  check('sparse: yearlyChangePct is null', q?.yearlyChangePct === null)
}

// ── 3. Missing the required Current Price key ───────────────────────────────
{
  const q = parseStockQuote('Previous Close=100.0,Opening Price=99.0')
  check('no Current Price: returns null', q === null, JSON.stringify(q))
}
{
  // Empty value for Current Price is also unusable.
  const q = parseStockQuote('Current Price=,Previous Close=100.0')
  check('empty Current Price value: returns null', q === null, JSON.stringify(q))
}
{
  // Non-numeric Current Price (NaN) is also unusable.
  const q = parseStockQuote('Current Price=abc,Previous Close=100.0')
  check('non-numeric Current Price: returns null', q === null, JSON.stringify(q))
}

// ── 4. Malformed input — no throws, returns null ────────────────────────────
check('empty string returns null', parseStockQuote('') === null)
check('garbage with no = returns null', parseStockQuote('foo,bar,baz') === null)
check('non-string (object) returns null', parseStockQuote({ currentPrice: 1 } as unknown) === null)
check('non-string (number) returns null', parseStockQuote(123 as unknown) === null)
check('null returns null', parseStockQuote(null) === null)
check('undefined returns null', parseStockQuote(undefined) === null)

// ── 5. Surrounding double quotes — the raw API form ─────────────────────────
{
  const raw = '"Current Price=2317.3,Previous Close=2325.4"'
  const q = parseStockQuote(raw)
  check('wrapped in quotes: parses', q !== null)
  check('wrapped in quotes: currentPrice === 2317.3', q?.currentPrice === 2317.3, String(q?.currentPrice))
  check('wrapped in quotes: previousClose === 2325.4', q?.previousClose === 2325.4, String(q?.previousClose))
}

// ── Bonus sanity: negative numbers in Yearly Change survive ─────────────────
{
  const q = parseStockQuote('Current Price=100.0,Yearly Change (%)=-34.49')
  check('negative yearly change parsed', q?.yearlyChangePct === -34.49, String(q?.yearlyChangePct))
}

// ── Bonus sanity: Day Range with negative low-value parses correctly ────────
// (Unlikely for prices, but the splitter must not over-split on '-'.)
{
  const q = parseStockQuote('Current Price=100.0,Day Range=95.0 - 105.0')
  check('day range with positives', q?.dayRange?.low === 95 && q?.dayRange?.high === 105,
    JSON.stringify(q?.dayRange))
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
