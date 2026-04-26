// ─────────────────────────────────────────────────────────────────────────
// Dev-only adapter wrapper that records every ResearchAdapter call into
// the diagnostics store. A thin Proxy pattern — every method on the
// wrapped adapter is forwarded but instrumented. In production builds the
// wrapper is a no-op identity function so there is zero overhead.
// ─────────────────────────────────────────────────────────────────────────

import type { ResearchAdapter } from '../ResearchAdapter'
import { isDev, recordResourceCall } from './diagnostics'

/** Map each adapter method to the RESOURCE_CATALOG key it loads. */
const METHOD_TO_KEY: Readonly<Record<keyof ResearchAdapter, string>> = {
  getSessionScope:          'sessionScope',
  getOrganization:          'organization',
  getCurrentUser:           'currentUser',
  listBrokers:              'brokers',
  getBroker:                'brokers',
  listSectors:              'sectors',
  getSector:                'sectors',
  listStocks:               'stocks',
  getStock:                 'stocks',
  listBrokerEmails:         'brokerEmails',
  getBrokerEmail:           'brokerEmail',
  listAttachments:          'attachments',
  listResearchReports:      'researchReports',
  getResearchReport:        'researchReport',
  getReportSummary:         'reportSummary',
  listEvidenceSnippets:     'reportEvidence',
  listBrokerStockOpinions:  'opinions',
  getConflictClosure:       'conflictClosure',
  listConflictClosures:     'conflictClosures',
  getSectorIntelligence:    'sectorIntelligenceFor',
  listSectorIntelligence:   'sectorIntelligence',
  getKpiSnapshot:           'kpiSnapshot',
  getIngestionStatus:       'ingestionStatus',
  getPortfolioSnapshot:     'portfolioSnapshot',
  listAlerts:               'alerts',
  getAlert:                 'alert',
  listAlertDigests:         'alertDigests',
  getAlertDigest:           'alertDigest',
  getLatestAlertDigest:     'latestAlertDigest',
  getCalibrationSnapshot:   'calibrationSnapshot',
  listBrokerCalibrations:   'brokerCalibrations',
  getBrokerCalibration:     'brokerCalibration',
  listAlertEffectiveness:   'alertEffectivenessList',
  getAlertEffectiveness:    'alertEffectiveness',
  getCoverageSignal:        'coverageSignal',
  listCatalysts:            'catalysts',
  getCatalyst:              'catalyst',
  getLatestPreEventBrief:   'catalystBrief',
  listPostEventReviews:     'postEventReviews',
}

export function withDiagnostics(inner: ResearchAdapter): ResearchAdapter {
  if (!isDev()) return inner
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function') return orig
      const key = METHOD_TO_KEY[prop as keyof ResearchAdapter]
      if (!key) return orig
      return async (...args: unknown[]) => {
        const startedAt = Date.now()
        recordResourceCall({ key, outcome: 'pending', at: startedAt })
        try {
          const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          const outcome = inferOutcome(result)
          recordResourceCall({
            key,
            outcome,
            at: Date.now(),
            durationMs: Date.now() - startedAt,
            detail: describe(result),
          })
          return result
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          recordResourceCall({
            key,
            outcome: 'error',
            at: Date.now(),
            durationMs: Date.now() - startedAt,
            detail: msg,
          })
          throw e
        }
      }
    },
  })
}

function inferOutcome(result: unknown): 'ok' | 'degraded' {
  // An "ok" result: a non-empty array, a non-null object, a page with items,
  // or a scalar. An empty list on a non-required endpoint counts as
  // degraded so the chip shows it.
  if (Array.isArray(result)) return result.length === 0 ? 'degraded' : 'ok'
  if (result === null) return 'degraded'
  if (typeof result === 'object') {
    // Page<T>
    const obj = result as { items?: unknown; totalCount?: unknown }
    if (Array.isArray(obj.items)) {
      return obj.items.length === 0 ? 'degraded' : 'ok'
    }
  }
  return 'ok'
}

function describe(result: unknown): string {
  if (Array.isArray(result)) return `array(${result.length})`
  if (result === null) return 'null'
  if (typeof result === 'object') {
    const obj = result as { items?: unknown; totalCount?: unknown }
    if (Array.isArray(obj.items)) return `Page(${obj.items.length}/${obj.totalCount ?? '?'})`
  }
  return typeof result
}
