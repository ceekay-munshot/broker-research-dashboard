import type {
  Sector, ResearchReport, ReportSummary, StockTicker, BrokerId, EvidenceId, Stance,
} from '../domain'
import type {
  SectorIntelligence, SectorSignal, SectorSignalClassification,
  ConflictClosure, SectorResultantEntry,
} from './types'
import { unique } from './stats'

export interface SectorIntelligenceInputs {
  readonly sector: Sector
  readonly reports: readonly ResearchReport[]     // reports tagged into this sector
  readonly summaries: readonly ReportSummary[]   // summaries for those reports
  readonly closures: readonly ConflictClosure[]  // closures for tickers in this sector
  readonly periodStart: string
  readonly periodEnd: string
  readonly asOf?: string
}

const STANCE_SCORE: Readonly<Record<Stance, number>> = {
  bullish: 1, neutral: 0, bearish: -1,
}

/**
 * Accumulates a sector's research intelligence into a structured rollup:
 * repeated signals across names, single-name issues, broker-specific claims,
 * and unresolved debates. Deterministic. Pure. See docs/closure-logic.md.
 */
export function buildSectorIntelligence(inputs: SectorIntelligenceInputs): SectorIntelligence {
  const asOf = inputs.asOf ?? new Date().toISOString()
  const summaryByReport = new Map(inputs.summaries.map((s) => [s.reportId as string, s]))

  // Bucket themes across the sector's reports. For each theme key we track
  // the set of tickers it touches, the set of brokers that surfaced it,
  // the set of polarities it appears with, all evidence ids, and
  // mention-count + first/last-seen timestamps for recency.
  interface ThemeBucket {
    tickers: Set<string>
    brokers: Set<string>
    polarities: Set<Stance>
    evidenceIds: Set<string>
    mentionCount: number
    firstSeen: string
    lastSeen: string
  }
  const byTheme = new Map<string, ThemeBucket>()
  const canonicalTheme = new Map<string, string>() // lower-case key → canonical display form

  for (const report of inputs.reports) {
    const sum = summaryByReport.get(report.id as string)
    if (!sum) continue
    for (const theme of sum.themes) {
      const key = theme.toLowerCase().trim()
      if (!canonicalTheme.has(key)) canonicalTheme.set(key, theme)
      let bucket = byTheme.get(key)
      if (!bucket) {
        bucket = {
          tickers: new Set(),
          brokers: new Set(),
          polarities: new Set(),
          evidenceIds: new Set(),
          mentionCount: 0,
          firstSeen: report.publishedAt,
          lastSeen: report.publishedAt,
        }
        byTheme.set(key, bucket)
      }
      for (const t of report.tickers) bucket.tickers.add(t as unknown as string)
      bucket.brokers.add(report.brokerId as unknown as string)
      bucket.polarities.add(sum.stance)
      for (const evId of sum.evidenceIds) bucket.evidenceIds.add(evId as unknown as string)
      bucket.mentionCount += 1
      if (report.publishedAt < bucket.firstSeen) bucket.firstSeen = report.publishedAt
      if (report.publishedAt > bucket.lastSeen)  bucket.lastSeen  = report.publishedAt
    }
  }

  const signals: SectorSignal[] = []
  for (const [key, bucket] of byTheme) {
    const tickerCount = bucket.tickers.size
    const brokerCount = bucket.brokers.size
    const hasBull = bucket.polarities.has('bullish')
    const hasBear = bucket.polarities.has('bearish')

    let classification: SectorSignalClassification
    if (hasBull && hasBear) {
      classification = 'unresolved_debate'
    } else if (tickerCount >= 2 && brokerCount >= 2) {
      classification = 'repeated_sector'
    } else if (tickerCount === 1) {
      classification = 'single_name'
    } else {
      classification = 'broker_specific'
    }

    const polarities = [...bucket.polarities]
    const stanceLean: Stance = polarities.length === 1
      ? polarities[0]!
      : 'neutral'

    signals.push({
      theme: canonicalTheme.get(key)!,
      classification,
      tickers: [...bucket.tickers] as unknown as readonly StockTicker[],
      brokerIds: [...bucket.brokers] as unknown as readonly BrokerId[],
      stanceLean,
      evidenceIds: [...bucket.evidenceIds] as unknown as readonly EvidenceId[],
      mentionCount: bucket.mentionCount,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
    })
  }

  // Ordering: flagged classifications (unresolved_debate, repeated_sector)
  // rank above single_name/broker_specific; within a class, higher mention
  // count first; ties broken by most-recent lastSeen.
  signals.sort((a, b) => classScore(b.classification) - classScore(a.classification)
    || b.mentionCount - a.mentionCount
    || b.lastSeen.localeCompare(a.lastSeen))

  // Aggregate stance: volume-weighted mean of stance scores over all
  // reports that contributed to this sector.
  const contributingStances: Stance[] = inputs.reports
    .map((r) => summaryByReport.get(r.id as string)?.stance)
    .filter((s): s is Stance => s !== undefined)
  const aggregateStanceScore = contributingStances.length === 0
    ? 0
    : contributingStances.reduce((sum, s) => sum + STANCE_SCORE[s], 0) / contributingStances.length
  const aggregateStance: Stance = aggregateStanceScore > 0.2
    ? 'bullish'
    : aggregateStanceScore < -0.2
      ? 'bearish'
      : 'neutral'

  const resultantStates: SectorResultantEntry[] = inputs.closures.map((c) => ({
    ticker: c.ticker,
    state: c.resultant.state,
    strength: c.resultant.strength,
  }))

  const tickerCount = unique(inputs.reports.flatMap((r) => r.tickers as unknown as string[])).length
  const brokerCount = unique(inputs.reports.map((r) => r.brokerId as unknown as string)).length

  return {
    sectorId: inputs.sector.id,
    sectorName: inputs.sector.name,
    periodStart: inputs.periodStart,
    periodEnd: inputs.periodEnd,
    asOf,
    reportCount: inputs.reports.length,
    tickerCount,
    brokerCount,
    aggregateStance,
    aggregateStanceScore,
    signals,
    resultantStates,
  }
}

function classScore(c: SectorSignalClassification): number {
  switch (c) {
    case 'unresolved_debate': return 4
    case 'repeated_sector':   return 3
    case 'broker_specific':   return 2
    case 'single_name':       return 1
  }
}
