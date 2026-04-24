// ─────────────────────────────────────────────────────────────────────────
// Current-vs-prior diff producer.
//
// Takes a LinkedPair (from linker.ts) + the matching ReportSummary for
// each side (when available) + the evidence counts and returns the
// deterministic `ReportChangeSet`. Theme/risk diffs are set operations on
// lowercase-normalized strings — no semantic matching, no fuzzy logic.
//
// When summaries are absent, the numeric/metadata deltas still populate;
// thematic fields are empty and `thematic = 'unavailable'` so the UI can
// clearly label the degraded state.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────

import type { ReportSummary } from '../../domain'
import type { LinkedPair } from './linker'
import type {
  ReportChangeSet, Significance, ThematicDeltaAvailability,
} from './types'
import { scoreSignificance } from './significance'

export interface CompareInputs {
  readonly link: LinkedPair
  readonly currentSummary: ReportSummary | null
  readonly priorSummary: ReportSummary | null
  readonly currentEvidenceCount: number
  readonly priorEvidenceCount: number
}

export function compareLinkedPair(inp: CompareInputs): ReportChangeSet {
  const { link } = inp
  const { current, prior } = link

  const ratingBefore = inp.priorSummary?.rating ?? null
  const ratingAfter  = inp.currentSummary?.rating ?? null
  const ratingChanged = prior !== null && ratingBefore !== ratingAfter

  const stanceBefore = inp.priorSummary?.stance ?? null
  const stanceAfter  = inp.currentSummary?.stance ?? null
  const stanceChanged = prior !== null
    && stanceBefore !== null && stanceAfter !== null
    && stanceBefore !== stanceAfter

  // Target price: prefer summary pair when both available; fall back to
  // the current summary's own `priorTargetPrice` (broker's self-reported
  // prior) when the prior summary is absent.
  const priorTp  = inp.priorSummary?.targetPrice ?? inp.currentSummary?.priorTargetPrice ?? null
  const afterTp  = inp.currentSummary?.targetPrice ?? null
  const targetBefore = priorTp
  const targetAfter  = afterTp
  const targetChangeAbs = (targetBefore !== null && targetAfter !== null)
    ? targetAfter - targetBefore
    : null
  const targetChangePct = (targetChangeAbs !== null && targetBefore !== null && targetBefore !== 0)
    ? (targetChangeAbs / targetBefore) * 100
    : null

  // Theme + risk set diffs (lowercase-normalized, trimmed). Set operations
  // only — we don't match "order book strength" to "strong order book"
  // because that's where hallucination starts.
  const curThemes = normalizeSet(inp.currentSummary?.themes ?? [])
  const priThemes = normalizeSet(inp.priorSummary?.themes ?? [])
  const curRisks  = normalizeSet(inp.currentSummary?.risks ?? [])
  const priRisks  = normalizeSet(inp.priorSummary?.risks ?? [])

  const themesAdded    = [...curThemes].filter((t) => !priThemes.has(t))
  const themesDropped  = [...priThemes].filter((t) => !curThemes.has(t))
  const themesRetained = [...curThemes].filter((t) => priThemes.has(t))
  const risksAdded     = [...curRisks].filter((r) => !priRisks.has(r))
  const risksDropped   = [...priRisks].filter((r) => !curRisks.has(r))
  const risksRetained  = [...curRisks].filter((r) => priRisks.has(r))

  const thematic: ThematicDeltaAvailability =
    prior === null                                                   ? 'unavailable'
    : (inp.currentSummary && inp.priorSummary)                        ? 'available'
    : (inp.currentSummary || inp.priorSummary)                        ? 'partial'
    :                                                                    'unavailable'

  const significance: Significance = scoreSignificance({
    comparability: link.comparability,
    ratingChanged, stanceChanged,
    targetChangePct,
    themesAddedCount: themesAdded.length,
    themesDroppedCount: themesDropped.length,
    risksAddedCount: risksAdded.length,
    risksDroppedCount: risksDropped.length,
    keyPointsDelta: (inp.currentSummary?.keyPoints.length ?? 0) - (inp.priorSummary?.keyPoints.length ?? 0),
    evidenceDelta: inp.currentEvidenceCount - inp.priorEvidenceCount,
  })

  const headline = buildHeadline({
    isFirstCoverage: prior === null,
    ratingBefore, ratingAfter, ratingChanged,
    targetBefore, targetAfter, targetChangePct,
    risksAddedCount: risksAdded.length, risksDroppedCount: risksDropped.length,
    themesAddedCount: themesAdded.length, themesDroppedCount: themesDropped.length,
    stanceChanged, stanceBefore, stanceAfter,
  })

  return {
    key: link.key,
    currentReportId: current.id,
    currentTicker: link.ticker,
    currentBrokerId: current.brokerId,
    currentPublishedAt: current.publishedAt,

    priorReportId: prior?.id ?? null,
    priorPublishedAt: prior?.publishedAt ?? null,
    daysSincePrior: link.daysSincePrior,
    comparability: link.comparability,

    reportTypeBefore: prior?.reportType ?? null,
    reportTypeAfter: current.reportType,
    reportTypeChanged: prior !== null && prior.reportType !== current.reportType,

    ratingBefore, ratingAfter, ratingChanged,
    stanceBefore, stanceAfter, stanceChanged,

    targetBefore, targetAfter,
    targetChangeAbs,
    targetChangePct,

    thematic,
    themesAdded, themesDropped, themesRetained,
    risksAdded, risksDropped, risksRetained,

    keyPointsBefore: inp.priorSummary?.keyPoints.length ?? 0,
    keyPointsAfter:  inp.currentSummary?.keyPoints.length ?? 0,
    evidenceBefore: inp.priorEvidenceCount,
    evidenceAfter:  inp.currentEvidenceCount,

    significance,
    headline,
  }
}

// ── Internals ────────────────────────────────────────────────────────────

function normalizeSet(arr: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const s of arr) {
    const n = s.trim().toLowerCase()
    if (n.length > 0) out.add(n)
  }
  return out
}

interface HeadlineInputs {
  readonly isFirstCoverage: boolean
  readonly ratingBefore: ReportChangeSet['ratingBefore']
  readonly ratingAfter: ReportChangeSet['ratingAfter']
  readonly ratingChanged: boolean
  readonly stanceChanged: boolean
  readonly stanceBefore: ReportChangeSet['stanceBefore']
  readonly stanceAfter: ReportChangeSet['stanceAfter']
  readonly targetBefore: number | null
  readonly targetAfter: number | null
  readonly targetChangePct: number | null
  readonly themesAddedCount: number
  readonly themesDroppedCount: number
  readonly risksAddedCount: number
  readonly risksDroppedCount: number
}

function buildHeadline(i: HeadlineInputs): string {
  if (i.isFirstCoverage) return 'Initiation / no prior comparable'

  const parts: string[] = []
  if (i.ratingChanged && i.ratingBefore && i.ratingAfter) {
    parts.push(`Rating ${i.ratingBefore} → ${i.ratingAfter}`)
  }
  if (i.targetChangePct !== null && Math.abs(i.targetChangePct) >= 0.5) {
    const sign = i.targetChangePct > 0 ? 'raised' : 'cut'
    parts.push(`Target ${sign} ${Math.abs(i.targetChangePct).toFixed(1)}%`)
  }
  if (i.stanceChanged && i.stanceBefore && i.stanceAfter) {
    parts.push(`Stance ${i.stanceBefore} → ${i.stanceAfter}`)
  }
  if (i.risksAddedCount > 0) parts.push(`${i.risksAddedCount} new risk${i.risksAddedCount === 1 ? '' : 's'}`)
  if (i.risksDroppedCount > 0) parts.push(`${i.risksDroppedCount} risk${i.risksDroppedCount === 1 ? '' : 's'} resolved`)
  if (i.themesAddedCount > 0) parts.push(`${i.themesAddedCount} new theme${i.themesAddedCount === 1 ? '' : 's'}`)
  if (parts.length === 0) return 'Repeated view · no material change'
  return parts.join(' · ')
}
