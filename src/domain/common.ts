import type { OrgId, UserId } from './ids'

// ISO-8601 UTC timestamp, always in 'YYYY-MM-DDTHH:mm:ss.sssZ' form.
export type Iso8601 = string

// Every read call on the adapter is made in the context of a single
// organization and the user acting on its behalf. The real adapter will cross
// the wire with a bearer token that embeds both; the mock adapter filters
// by orgId directly.
export interface OrgScope {
  readonly orgId: OrgId
  readonly actingUserId: UserId
}

// Cursor-based pagination. `nextCursor === null` means no more pages.
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
  readonly totalCount: number
}

// Analyst stance on the underlying thesis.
export type Stance = 'bullish' | 'neutral' | 'bearish'

// The canonical rating vocabulary. `Not Rated` is used when a broker covers
// the name but has suspended or never issued a formal rating (e.g. restricted
// during an M&A assignment).
export type Rating =
  | 'Buy'
  | 'Overweight'
  | 'Hold'
  | 'Underweight'
  | 'Sell'
  | 'Not Rated'

// Model confidence. Always 0..1 inclusive.
export type Confidence = number

export type IsoCurrency = string // ISO 4217, e.g. 'USD', 'EUR', 'INR'
