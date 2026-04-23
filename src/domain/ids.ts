// Branded ID types. At runtime these are plain strings; at compile time the
// brand prevents e.g. passing a UserId where a BrokerId is expected.
// Construct them via the cast helpers in src/lib/ids.ts.

declare const brand: unique symbol

export type OrgId          = string & { readonly [brand]: 'OrgId' }
export type UserId         = string & { readonly [brand]: 'UserId' }
export type BrokerId       = string & { readonly [brand]: 'BrokerId' }
export type EmailId        = string & { readonly [brand]: 'EmailId' }
export type AttachmentId   = string & { readonly [brand]: 'AttachmentId' }
export type ReportId       = string & { readonly [brand]: 'ReportId' }
export type SummaryId      = string & { readonly [brand]: 'SummaryId' }
export type EvidenceId     = string & { readonly [brand]: 'EvidenceId' }
export type SectorId       = string & { readonly [brand]: 'SectorId' }
export type DivergenceId   = string & { readonly [brand]: 'DivergenceId' }
export type IngestionJobId = string & { readonly [brand]: 'IngestionJobId' }

// Tickers are branded too so they cannot be confused with arbitrary strings.
export type StockTicker = string & { readonly [brand]: 'StockTicker' }
