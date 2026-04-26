// Internal helper types for the server-side alerts engine. The canonical
// public types are in src/domain/alerts.ts and are what the /v1 API and
// the UI consume.

import type {
  AlertEvent, AlertRule, AlertSeverity, AlertTriggerKind, AlertReason,
  DigestKind, AlertDigest, DigestRun,
  PortfolioSnapshot, ResearchReport, ReportSummary, BrokerStockOpinion,
  Stock, OrgId, BrokerId, StockTicker, ReportId,
} from '../../../src/domain'
import type { ConflictClosure } from '../../../src/engine/types'

/** Inputs the trigger engine works over. Pre-aligned to the org. */
export interface TriggerInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly closures: readonly ConflictClosure[]
  readonly stocks: readonly Stock[]
  readonly brokers: readonly { readonly id: BrokerId; readonly shortName: string }[]
  readonly now: Date
  /** Inclusive lower bound for "fresh" reports — any report received at or
   *  after this time is a candidate. */
  readonly windowStart: Date
}

/** A trigger may emit zero or more candidate events. */
export interface CandidateAlert {
  readonly kind: AlertTriggerKind
  readonly severity: AlertSeverity
  readonly headline: string
  readonly body: string
  readonly reasons: readonly AlertReason[]
  readonly ticker: StockTicker | null
  readonly brokerId: BrokerId | null
  readonly reportId: ReportId | null
  readonly bookMembership: 'held' | 'watchlist' | 'adjacent' | 'none' | null
  readonly bookDirection: 'long' | 'short' | 'hedge' | null
  readonly bookConviction: 'high' | 'medium' | 'low' | null
  readonly bookWeightPct: number | null
  /** Stable fingerprint, deterministic from the rule + inputs. */
  readonly fingerprint: string
  /** Optional expiry (e.g. intraday alerts expire in 24h). */
  readonly expiresInHours: number | null
}

/** A trigger function: deterministic, pure, side-effect-free. */
export type TriggerFn = (inputs: TriggerInputs) => readonly CandidateAlert[]

/** The default rule registry. Loaded by `runAlerts`. */
export interface RuleRegistryEntry {
  readonly rule: AlertRule
  readonly trigger: TriggerFn
}

/** Persistence-side helpers. */
export interface AlertPersistence {
  readonly upsertAlert: (a: AlertEvent) => void
  readonly upsertDigest: (d: AlertDigest) => void
  readonly upsertDigestRun: (r: DigestRun) => void
  readonly listRecentAlerts: (
    orgId: OrgId,
    sinceMs: number,
  ) => readonly AlertEvent[]
}

/** Re-exports so individual modules can import from `./types` only. */
export type {
  AlertEvent, AlertRule, AlertSeverity, AlertTriggerKind, AlertReason,
  DigestKind, AlertDigest, DigestRun,
}
