// Derive `SignalEvent`s from canonical reports + alerts.
//
// One report → one or more events (broker_report + optional rating_change
// + optional target_change). One alert → one event of the matching kind.
// Each event carries the deterministic `expectedDirection` and the
// frozen `bookContext` at event-time.

import type {
  AlertEvent, BrokerStockOpinion, ReportSummary, ResearchReport, Stock,
  PortfolioSnapshot, OrgId, BrokerId, ReportId, StockTicker, SectorId,
  SignalEvent, SignalEventKind, ExpectedDirection, EventBookContext,
  IsoCurrency, AlertTriggerKind,
} from '../../../src/domain'
import { asSignalEventId } from '../../../src/lib/ids'

export interface DeriveEventsInputs {
  readonly orgId: OrgId
  readonly snapshot: PortfolioSnapshot | null
  readonly reports: readonly ResearchReport[]
  readonly summaries: readonly ReportSummary[]
  readonly opinions: readonly BrokerStockOpinion[]
  readonly alerts: readonly AlertEvent[]
  readonly stocks: readonly Stock[]
}

export function deriveSignalEvents(inputs: DeriveEventsInputs): readonly SignalEvent[] {
  const out: SignalEvent[] = []
  const stockByTicker = new Map<string, Stock>()
  for (const s of inputs.stocks) stockByTicker.set(s.ticker as string, s)
  const summaryByReport = new Map<string, ReportSummary>()
  for (const s of inputs.summaries) summaryByReport.set(s.reportId as string, s)

  // ── 1. Report-level events ────────────────────────────────────────────
  for (const r of inputs.reports) {
    const sum = summaryByReport.get(r.id as string) ?? null
    for (const ticker of r.tickers) {
      const stk = stockByTicker.get(ticker as string) ?? null
      const sectorId = stk?.sectorId ?? r.sectorIds[0] ?? null
      const ctx = bookContextFor(inputs.snapshot, ticker)
      const occurredAt = r.receivedAt
      const asOfDate = occurredAt.slice(0, 10)
      const currency: IsoCurrency | null = stk?.currency ?? null

      // 1a. broker_report (no expected direction by default)
      out.push(makeEvent({
        kind: 'broker_report',
        orgId: inputs.orgId,
        ticker,
        sectorId,
        brokerId: r.brokerId,
        reportId: r.id,
        alertId: null, alertKind: null,
        expectedDirection: null,
        bookContext: ctx,
        occurredAt,
        asOfDate,
        anchorPrice: null,
        currency,
      }))

      // 1b. rating_change — when the new rating differs from prior recorded
      //     opinion (or there's no prior opinion).
      if (sum?.rating) {
        const prior = inputs.opinions.find((o) => o.brokerId === r.brokerId && o.ticker === ticker)
        if (prior && prior.rating !== sum.rating) {
          out.push(makeEvent({
            kind: 'rating_change',
            orgId: inputs.orgId,
            ticker,
            sectorId,
            brokerId: r.brokerId,
            reportId: r.id,
            alertId: null, alertKind: null,
            expectedDirection: ratingExpectedDir(prior.rating, sum.rating),
            bookContext: ctx,
            occurredAt,
            asOfDate,
            anchorPrice: null,
            currency,
          }))
        }
      }

      // 1c. target_change — when current vs prior target differs by ≥ 1%.
      if (sum?.targetPrice !== undefined && sum?.targetPrice !== null
          && sum.priorTargetPrice !== undefined && sum.priorTargetPrice !== null
          && sum.priorTargetPrice !== 0) {
        const deltaPct = ((sum.targetPrice - sum.priorTargetPrice) / sum.priorTargetPrice) * 100
        if (Math.abs(deltaPct) >= 1) {
          out.push(makeEvent({
            kind: 'target_change',
            orgId: inputs.orgId,
            ticker,
            sectorId,
            brokerId: r.brokerId,
            reportId: r.id,
            alertId: null, alertKind: null,
            expectedDirection: deltaPct > 0 ? 'up' : 'down',
            bookContext: ctx,
            occurredAt,
            asOfDate,
            anchorPrice: null,
            currency,
          }))
        }
      }
    }
  }

  // ── 2. Alert-level events ────────────────────────────────────────────
  for (const a of inputs.alerts) {
    if (a.suppressed) continue
    const ticker = a.lineage.ticker
    if (!ticker) continue
    const stk = stockByTicker.get(ticker as string) ?? null
    const sectorId = stk?.sectorId ?? null
    const ctx: EventBookContext = a.bookContext?.membership === 'held'
      ? (a.bookContext.direction === 'short' ? 'held_short' : 'held_long')
      : a.bookContext?.membership === 'watchlist' ? 'watchlist'
      : a.bookContext?.membership === 'adjacent' ? 'adjacent'
      : 'none'
    const kind = mapAlertKindToEventKind(a.kind)
    if (!kind) continue
    out.push(makeEvent({
      kind,
      orgId: inputs.orgId,
      ticker,
      sectorId,
      brokerId: a.lineage.brokerId,
      reportId: a.lineage.reportId,
      alertId: a.id,
      alertKind: a.kind,
      expectedDirection: alertExpectedDir(a.kind, ctx),
      bookContext: ctx,
      occurredAt: a.generatedAt,
      asOfDate: a.generatedAt.slice(0, 10),
      anchorPrice: null,
      currency: stk?.currency ?? null,
    }))
  }

  // Stable order for replays.
  out.sort((x, y) => x.occurredAt.localeCompare(y.occurredAt) || x.id.localeCompare(y.id))
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────

function bookContextFor(snapshot: PortfolioSnapshot | null, ticker: StockTicker): EventBookContext {
  if (!snapshot) return 'none'
  const tk = ticker as string
  const pos = snapshot.positions.find((p) => (p.ticker as string) === tk)
  if (pos) return pos.direction === 'short' ? 'held_short' : 'held_long'
  const watch = snapshot.watchlist.find((w) => (w.ticker as string) === tk)
  if (watch) return 'watchlist'
  return 'none'
}

const RATING_RANK: Readonly<Record<string, number>> = {
  Sell: 1, Underweight: 2, Hold: 3, 'Not Rated': 3, Overweight: 4, Buy: 5,
}

function ratingExpectedDir(prior: string | null, next: string | null): ExpectedDirection {
  if (!prior || !next) return null
  const a = RATING_RANK[prior] ?? 3
  const b = RATING_RANK[next] ?? 3
  if (b > a) return 'up'
  if (b < a) return 'down'
  return null
}

function mapAlertKindToEventKind(k: AlertTriggerKind): SignalEventKind | null {
  switch (k) {
    case 'against_position':            return 'against_position_alert'
    case 'significant_change_held':     return 'significant_change_alert'
    case 'unresolved_divergence_held':  return 'unresolved_divergence_alert'
    case 'broker_outlier_held':         return 'broker_outlier_alert'
    case 'pile_in_book':                return 'pile_in_alert'
    case 'watchlist_fresh_candidate':   return 'watchlist_fresh_alert'
    case 'stale_coverage_held':
    case 'stale_coverage_high_conviction':
    case 'stale_coverage_watchlist':    return 'stale_coverage_alert'
    case 'new_research_held':
    case 'new_research_watchlist':
    case 'correction_replay_change':    return null
  }
}

function alertExpectedDir(kind: AlertTriggerKind, ctx: EventBookContext): ExpectedDirection {
  // For "against position" alerts: the alert *warns* about a downside on
  // the position's thesis. For a held_long, the broker's bearish view
  // would imply the *book* expects "down" (the broker's call). We
  // measure whether the broker's view played out — so expectedDirection
  // mirrors the broker's stance, not the position.
  if (kind === 'against_position') {
    if (ctx === 'held_long') return 'down'
    if (ctx === 'held_short') return 'up'
    return null
  }
  // Significant change alerts inherit the directional sign of the
  // underlying summary at builder time; we conservatively mark them as
  // null here (the report-level target_change event captures direction).
  return null
}

function makeEvent(input: {
  kind: SignalEventKind
  orgId: OrgId
  ticker: StockTicker
  sectorId: SectorId | null
  brokerId: BrokerId | null
  reportId: ReportId | null
  alertId: SignalEvent['alertId']
  alertKind: AlertTriggerKind | null
  expectedDirection: ExpectedDirection
  bookContext: EventBookContext
  occurredAt: string
  asOfDate: string
  anchorPrice: number | null
  currency: IsoCurrency | null
}): SignalEvent {
  const idStr = `evt_${input.kind}_${input.orgId as unknown as string}_${(input.ticker as unknown as string)}_${input.asOfDate}_${
    input.brokerId ? (input.brokerId as unknown as string) : 'na'
  }_${input.reportId ? (input.reportId as unknown as string) : 'na'}_${input.alertId ? (input.alertId as unknown as string) : 'na'}`
  return {
    id: asSignalEventId(idStr),
    orgId: input.orgId,
    kind: input.kind,
    ticker: input.ticker,
    sectorId: input.sectorId,
    brokerId: input.brokerId,
    reportId: input.reportId,
    alertId: input.alertId,
    alertKind: input.alertKind,
    expectedDirection: input.expectedDirection,
    bookContext: input.bookContext,
    occurredAt: input.occurredAt,
    asOfDate: input.asOfDate,
    anchorPrice: input.anchorPrice,
    currency: input.currency,
  }
}
