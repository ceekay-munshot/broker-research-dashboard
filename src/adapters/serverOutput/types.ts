// ─────────────────────────────────────────────────────────────────────────
// DashboardServerOutput — the wire contract the cofounder's server produces.
//
// This is the single envelope the dashboard consumes. The server runs email
// fetch + LLM extraction on its end and emits one of these per snapshot.
// The dashboard slices this envelope into the per-method ResearchAdapter
// calls every view-model expects.
//
// Contract rules:
//   - Every field is OPTIONAL on the wire (nullable / empty arrays).
//   - When `null` or empty, the corresponding dashboard surface shows
//     a placeholder ("Awaiting server output", "—", skeleton row).
//   - Nothing here is invented client-side: if the server hasn't sent it,
//     the dashboard does NOT fabricate data.
//
// See docs/server-output-contract.md for per-screen field usage,
// required-vs-optional-vs-derived guidance, and missing-data behavior.
// ─────────────────────────────────────────────────────────────────────────

import type {
  Organization, User, OrgScope, Iso8601,
  Broker, BrokerEmail, Attachment, Sector, Stock,
  KpiSnapshot, ResearchReport, ReportSummary, EvidenceSnippet,
  BrokerStockOpinion, PortfolioSnapshot,
  AlertEvent, AlertDigest, DeliveryAttempt,
  CatalystEvent, PreEventBrief, PostEventReview,
  CalibrationSnapshot, BrokerCalibrationSummary,
  AlertEffectivenessSummary, CoverageSignalResult,
  OrgUsageSnapshot, PilotRoiSnapshot,
  OrgSettings, ConfigAuditEntry, SessionSafetySnapshot,
} from '../../domain'
import type { ConflictClosure, SectorIntelligence } from '../../engine/types'

/** Header chip state. Drives the "Feed live / Delayed / Error / Waiting" pill. */
export interface FeedStatusPayload {
  readonly status: 'live' | 'delayed' | 'error' | 'waiting'
  /** Count of extracted items received today. Null when the server hasn't
   *  reported yet. */
  readonly itemsToday: number | null
  /** ISO timestamp of the most recent extraction the dashboard received. */
  readonly lastExtractionReceivedAt: Iso8601 | null
  /** ISO timestamp of the last successful pull from the server. */
  readonly lastSuccessfulSyncAt: Iso8601 | null
  /** Optional human-readable note for error/delayed states. */
  readonly message: string | null
}

/**
 * The single payload the dashboard consumes per snapshot. The server is
 * authoritative — it owns email fetch, LLM extraction, dedup, broker
 * resolution, and aggregation.
 *
 * Empty payload = the dashboard renders its full shell with placeholders.
 */
export interface DashboardServerOutput {
  /** Always present. When the server hasn't started yet, status='waiting'. */
  readonly feedStatus: FeedStatusPayload

  /** When this payload was generated server-side. */
  readonly generatedAt: Iso8601 | null

  // ── Tenant + scope ──────────────────────────────────────────────────────

  readonly sessionScope: OrgScope | null
  readonly organization: Organization | null
  readonly currentUser: User | null

  // ── Catalog (sidebar filters, drawers) ──────────────────────────────────

  readonly brokers: readonly Broker[]
  readonly sectors: readonly Sector[]
  readonly stocks: readonly Stock[]

  // ── KPIs (Dashboard tab) ────────────────────────────────────────────────

  readonly kpi: KpiSnapshot | null

  // ── Raw inbound (Inbox/Catalysts surfaces; mostly metadata) ─────────────

  readonly emails: readonly BrokerEmail[]
  readonly attachments: readonly Attachment[]

  // ── Normalized research (the heart of the product) ─────────────────────

  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly evidence: readonly EvidenceSnippet[]

  /** Latest opinion per (broker, ticker). Server-derived (most recent
   *  ready report per broker per ticker). The dashboard does not derive
   *  this client-side. */
  readonly opinions: readonly BrokerStockOpinion[]

  // ── Aggregated analytics (server can pre-compute these or omit) ────────

  /** Per-ticker conflict closures (consensus / disagreement / outlier). */
  readonly conflictClosures: readonly ConflictClosure[]
  /** Per-sector accumulated intelligence + roll-ups. */
  readonly sectorIntelligence: readonly SectorIntelligence[]

  // ── Portfolio overlay (My Book) ─────────────────────────────────────────

  readonly portfolio: PortfolioSnapshot | null

  // ── Alerts + digests (Briefing / Alerts) ────────────────────────────────

  readonly alerts: readonly AlertEvent[]
  readonly digests: readonly AlertDigest[]

  // ── Calibration (broker + alert effectiveness) ─────────────────────────

  readonly calibrationSnapshot: CalibrationSnapshot | null
  readonly brokerCalibrations: readonly BrokerCalibrationSummary[]
  readonly alertEffectiveness: readonly AlertEffectivenessSummary[]
  readonly coverageSignals: readonly CoverageSignalResult[]

  // ── Catalysts (calendar + briefs + reviews) ─────────────────────────────

  readonly catalysts: readonly CatalystEvent[]
  readonly preEventBriefs: readonly PreEventBrief[]
  readonly postEventReviews: readonly PostEventReview[]

  // ── Inbox (delivered briefs / alerts / incidents) ──────────────────────

  readonly deliveries: readonly DeliveryAttempt[]

  // ── Pilot analytics (Usage tab — operator-only) ────────────────────────

  readonly orgUsageSnapshot: OrgUsageSnapshot | null
  readonly pilotRoiSnapshot: PilotRoiSnapshot | null

  // ── Org control plane (Control Plane tab — operator-only) ──────────────

  readonly orgSettings: OrgSettings | null
  readonly configAuditEntries: readonly ConfigAuditEntry[]
  readonly sessionSafety: SessionSafetySnapshot | null
}

/** The default "waiting" feed status — used by the adapter before the
 *  server has produced any payload. */
export const WAITING_FEED_STATUS: FeedStatusPayload = {
  status: 'waiting',
  itemsToday: null,
  lastExtractionReceivedAt: null,
  lastSuccessfulSyncAt: null,
  message: 'Waiting for the backend to send extracted output.',
}
