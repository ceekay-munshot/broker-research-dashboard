import type {
  Broker, ResearchReport, ReportSummary, EvidenceSnippet,
  Sector, Stock, BrokerEmail, Attachment,
  ReportId, EmailProcessingStatus, Rating, Stance, ReportCatalyst,
  EvidenceSupportingField, StockTicker, ReportKeyNumber,
  BrokerSource, ResolutionClass,
  NoteSignalKind, NoteSignalSource,
} from '../domain'
import type { ConflictClosure } from '../engine/types'
import { useAdapterQuery, type QueryResult } from '../hooks/useAdapterQuery'
import { groupBy } from './shared'
import { parseBrokerSender, type BrokerSenderDisplay } from '../lib/brokerSender'
import {
  deriveArbVerdict, deriveConsensusRating,
  type ArbVerdict, type ConsensusRating,
} from './arb'

/** What kind of artifact the source link points at — drives the Source
 *  button's icon and verb ("Open PDF" / "Open spreadsheet" / "Open email" /
 *  "Open link"). */
export type SourceKind = 'pdf' | 'excel' | 'doc' | 'email' | 'web'

/** Classify a source from its MIME type / filename extension / URL. */
function deriveSourceKind(filename: string, mimeType: string | null, url: string): SourceKind {
  const f = filename.toLowerCase()
  const m = (mimeType ?? '').toLowerCase()
  if (m.includes('pdf') || f.endsWith('.pdf')) return 'pdf'
  if (m.includes('spreadsheet') || m.includes('excel') || /\.(xlsx?|csv)$/.test(f)) return 'excel'
  if (m.includes('word') || /\.docx?$/.test(f)) return 'doc'
  if (m.includes('message/rfc822') || f.endsWith('.eml') || url.startsWith('mailto:')) return 'email'
  return 'web'
}

export interface EvidenceBySection {
  readonly thesis: readonly EvidenceSnippet[]
  readonly rating: readonly EvidenceSnippet[]
  readonly targetPrice: readonly EvidenceSnippet[]
  readonly keyPointByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly riskByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly themeByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
  readonly catalystByIndex: ReadonlyMap<number, readonly EvidenceSnippet[]>
}

/** How this report's call sits against the rest of the Street — derived from
 *  the ticker's conflict closure. Null when no other broker covers it. */
export interface ReportStreetContext {
  readonly ticker: StockTicker
  readonly arb: ArbVerdict
  readonly consensusRating: ConsensusRating
  /** Street median target — robust to a single extreme call. */
  readonly consensusTarget: number | null
  readonly targetLow: number | null
  readonly targetHigh: number | null
  readonly brokerCount: number
  /** This report's broker is flagged an outlier on this ticker. */
  readonly isOutlier: boolean
  readonly outlierDirection: 'bullish' | 'bearish' | null
  /** Where this report's target sits within the Street range. */
  readonly targetStanding: 'highest' | 'lowest' | 'mid' | 'unknown'
}

/** How this note's broker/research house was resolved — drives the drawer's
 *  "Source" section and QA flags. */
export interface ReportBrokerProvenance {
  readonly canonicalName: string
  readonly source: BrokerSource
  readonly confidence: number
  readonly evidence: string | null
  readonly conflict: boolean
  readonly resolutionClass: ResolutionClass
  readonly reason: string | null
}

export interface ReportDetailViewModel {
  readonly reportId: ReportId
  readonly title: string
  readonly publishedAt: string
  readonly receivedAt: string
  readonly language: string
  readonly pageCount: number | null
  readonly reportType: ResearchReport['reportType']
  readonly processingStatus: EmailProcessingStatus
  readonly processingMessage: string | null

  readonly broker: { readonly name: string; readonly shortName: string; readonly color: string | null }
  readonly stocks: readonly { readonly ticker: StockTicker; readonly name: string }[]
  readonly sectors: readonly { readonly name: string }[]

  readonly stance: Stance | null
  readonly rating: Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
  readonly targetChanged: boolean
  readonly targetDelta: number | null
  readonly targetCurrency: string | null

  readonly thesis: string | null
  readonly keyPoints: readonly string[]
  readonly themes: readonly string[]
  readonly risks: readonly string[]
  readonly catalysts: readonly ReportCatalyst[]
  readonly confidence: number | null

  // Note insight — deep detail mined from the forwarded email body.
  // Display-only; empty / null when nothing was confidently extracted.
  readonly keyNumbers: readonly ReportKeyNumber[]
  readonly watchpoints: readonly string[]
  readonly upsidePct: number | null

  // Note signal — typed display annotation surfaced in the drawer's
  // "Note signal" section. `noteSignalKind` is the chip enum; the source
  // drives the one-line plain-language blurb.
  readonly noteSignalKind: NoteSignalKind | null
  readonly noteSignalSource: NoteSignalSource | null
  /** Standalone numeric upside chip (only set when upsidePct >= 15). */
  readonly upsideChipPct: number | null
  /** Legacy back-compat — renderers route through
   *  `signalPolicy.legacyActionLabelToNoteSignal()`; they never display
   *  the raw string. */
  readonly actionLabel: string | null

  readonly evidence: EvidenceBySection
  readonly evidenceCount: number

  readonly sourceEmail: {
    readonly subject: string
    readonly senderName: string
    readonly senderAddress: string
    /** Raw forwarded-From header lines, in order — the first usually
     *  carries the original broker sender for forwarded notes. */
    readonly forwardedFrom: readonly string[]
    readonly receivedAt: string
    readonly status: EmailProcessingStatus
  } | null

  /** Parsed broker-sender identity for the drawer's "Broker sender" row.
   *  Populated when `brokerResolution.brokerSource === 'forwarded_body_header'`
   *  OR when `sourceEmail.forwardedFrom[0]` is header-shaped. Null when
   *  the resolver landed on a non-header source (subject prefix, sender
   *  domain, etc.) with no sender info to surface. */
  readonly brokerSender: BrokerSenderDisplay | null

  /** Who forwarded the note into our system, if any — distinct from the
   *  broker sender. Null for direct broker-to-org emails (no forwarder). */
  readonly forwardedBy: {
    readonly name: string | null
    readonly email: string | null
  } | null

  /** The original source this note came from — the attachment when one exists,
   *  else the forwarded email itself. `kind` drives the icon + verb on the
   *  Source button. Null only when there's no link and no email to open. */
  readonly sourceDocument: {
    readonly url: string
    readonly filename: string
    readonly kind: SourceKind
  } | null

  /** This call vs the Street — null when no multi-broker comparison exists. */
  readonly streetContext: ReportStreetContext | null

  /** Who forwarded this note into the inbox — shown as "Received via". */
  readonly receivedVia: string | null
  /** How this note's broker was resolved — provenance for trust + QA. */
  readonly brokerProvenance: ReportBrokerProvenance | null
  /** The resolved research house is also a covered company in this note. */
  readonly brokerStockConflict: boolean
}

interface Inputs {
  readonly report: ResearchReport
  readonly summary: ReportSummary | null
  readonly evidence: readonly EvidenceSnippet[]
  readonly broker: Broker | null
  readonly stocks: readonly Stock[]
  readonly sectors: readonly Sector[]
  readonly sourceEmail: BrokerEmail | null
  readonly sourceAttachment: Attachment | null
  readonly closure: ConflictClosure | null
}

function groupEvidenceByField(
  snippets: readonly EvidenceSnippet[],
  field: EvidenceSupportingField,
): ReadonlyMap<number, readonly EvidenceSnippet[]> {
  const filtered = snippets.filter((s) => s.supportingField === field)
  const grouped = groupBy(filtered, (s) => {
    const parsed = Number.parseInt(s.fieldRef, 10)
    return (Number.isFinite(parsed) ? parsed : 0).toString()
  })
  const out = new Map<number, readonly EvidenceSnippet[]>()
  for (const [k, v] of grouped) out.set(Number.parseInt(k, 10), v)
  return out
}

/** Derive the Street comparison for one report from its ticker's closure. */
function buildStreetContext(
  closure: ConflictClosure | null,
  report: ResearchReport,
  summary: ReportSummary | null,
): ReportStreetContext | null {
  if (!closure || closure.brokerCount < 2) return null
  const ts = closure.targetStats
  const myTarget = summary?.targetPrice ?? null
  let targetStanding: ReportStreetContext['targetStanding'] = 'unknown'
  if (myTarget !== null && ts.high !== null && ts.low !== null) {
    targetStanding = myTarget >= ts.high ? 'highest'
      : myTarget <= ts.low ? 'lowest'
      : 'mid'
  }
  const outlier = closure.outliers.find((o) => o.brokerId === report.brokerId) ?? null
  return {
    ticker: closure.ticker,
    arb: deriveArbVerdict(closure, closure.brokerCount),
    consensusRating: deriveConsensusRating(closure),
    consensusTarget: ts.median ?? ts.mean,
    targetLow: ts.low,
    targetHigh: ts.high,
    brokerCount: closure.brokerCount,
    isOutlier: outlier !== null,
    outlierDirection: outlier ? outlier.direction : null,
    targetStanding,
  }
}

export function buildReportDetailViewModel(inputs: Inputs): ReportDetailViewModel {
  const { report, summary, evidence, broker, stocks, sectors, sourceEmail, sourceAttachment, closure } = inputs

  const targetChanged = summary?.targetPrice != null && summary.priorTargetPrice != null
    && summary.targetPrice !== summary.priorTargetPrice
  const targetDelta = summary?.targetPrice != null && summary.priorTargetPrice != null
    ? summary.targetPrice - summary.priorTargetPrice
    : null

  const evidenceBySection: EvidenceBySection = {
    thesis: evidence.filter((e) => e.supportingField === 'thesis'),
    rating: evidence.filter((e) => e.supportingField === 'rating'),
    targetPrice: evidence.filter((e) => e.supportingField === 'targetPrice'),
    keyPointByIndex: groupEvidenceByField(evidence, 'keyPoint'),
    riskByIndex: groupEvidenceByField(evidence, 'risk'),
    themeByIndex: groupEvidenceByField(evidence, 'theme'),
    catalystByIndex: groupEvidenceByField(evidence, 'catalyst'),
  }

  return {
    reportId: report.id,
    title: report.title,
    publishedAt: report.publishedAt,
    receivedAt: report.receivedAt,
    language: report.language,
    pageCount: report.pageCount,
    reportType: report.reportType,
    processingStatus: report.status,
    processingMessage: null,

    broker: {
      name: broker?.name ?? '—',
      shortName: broker?.shortName ?? '—',
      color: broker?.brandColor ?? null,
    },
    stocks: stocks.map((s) => ({ ticker: s.ticker, name: s.name })),
    sectors: sectors.map((s) => ({ name: s.name })),

    stance: summary?.stance ?? null,
    rating: summary?.rating ?? null,
    targetPrice: summary?.targetPrice ?? null,
    priorTargetPrice: summary?.priorTargetPrice ?? null,
    targetChanged,
    targetDelta,
    targetCurrency: summary?.targetCurrency ?? null,

    thesis: summary?.thesis ?? null,
    keyPoints: summary?.keyPoints ?? [],
    themes: summary?.themes ?? [],
    risks: summary?.risks ?? [],
    catalysts: summary?.catalysts ?? [],
    confidence: summary?.confidence ?? null,

    keyNumbers: summary?.keyNumbers ?? [],
    watchpoints: summary?.watchpoints ?? [],
    upsidePct: summary?.upsidePct ?? null,
    noteSignalKind: summary?.noteSignalKind ?? null,
    noteSignalSource: summary?.noteSignalSource ?? null,
    upsideChipPct: summary?.upsideChipPct ?? null,
    actionLabel: summary?.actionLabel ?? null,

    evidence: evidenceBySection,
    evidenceCount: evidence.length,

    sourceEmail: sourceEmail ? {
      subject: sourceEmail.subject,
      senderName: sourceEmail.senderName,
      senderAddress: sourceEmail.senderAddress,
      forwardedFrom: sourceEmail.forwardedFrom,
      receivedAt: sourceEmail.receivedAt,
      status: sourceEmail.status,
    } : null,

    brokerSender: deriveBrokerSender(report, sourceEmail),
    forwardedBy: deriveForwardedBy(sourceEmail),

    sourceDocument: deriveSourceDocument(sourceAttachment, sourceEmail),

    streetContext: buildStreetContext(closure, report, summary),

    receivedVia: sourceEmail?.senderName ?? null,
    brokerProvenance: report.brokerResolution ? {
      canonicalName: report.brokerResolution.brokerCanonicalName,
      source: report.brokerResolution.brokerSource,
      confidence: report.brokerResolution.brokerConfidence,
      evidence: report.brokerResolution.brokerEvidence ?? null,
      conflict: report.brokerResolution.brokerConflict,
      resolutionClass: report.brokerResolution.resolutionClass,
      reason: report.brokerResolution.resolutionReason ?? null,
    } : null,
    brokerStockConflict: report.brokerStockConflict ?? false,
  }
}

/** Resolve the note's source link + kind. Prefer the attachment's signed URL
 *  (a PDF / spreadsheet / doc); fall back to the forwarded email when there's
 *  no downloadable attachment, so the Source button always has somewhere to go.
 *  Returns null only when neither exists. */
function deriveSourceDocument(
  attachment: Attachment | null,
  email: BrokerEmail | undefined | null,
): { url: string; filename: string; kind: SourceKind } | null {
  if (attachment?.sourceUrl) {
    return {
      url: attachment.sourceUrl,
      filename: attachment.filename,
      kind: deriveSourceKind(attachment.filename, attachment.mimeType, attachment.sourceUrl),
    }
  }
  if (email) {
    // No attachment link — point at the forwarded email itself. A mailto:
    // makes the "email" kind explicit; senderAddress is the best anchor we have.
    const addr = email.senderAddress || email.senderName || 'email'
    return {
      url: `mailto:${email.senderAddress || ''}`,
      filename: email.subject || `Email from ${addr}`,
      kind: 'email',
    }
  }
  return null
}

/** Pick the best broker-sender evidence string to feed into the parser.
 *  Priority: the resolver's own evidence when it landed on the forwarded
 *  "From:" header; otherwise the first forwarded-From line on the email
 *  if it looks header-shaped; otherwise null. Returns null when we
 *  tried but the parser produced no useful name OR email AND the source
 *  isn't header-derived — keeps the drawer's "Broker sender" row from
 *  surfacing garbage for non-header resolver sources. */
function deriveBrokerSender(
  report: ResearchReport,
  sourceEmail: BrokerEmail | undefined | null,
): BrokerSenderDisplay | null {
  const res = report.brokerResolution
  if (res && res.brokerSource === 'forwarded_body_header' && res.brokerEvidence) {
    const out = parseBrokerSender(res.brokerEvidence)
    // Surface even a "raw only" result for forwarded_body_header — the
    // drawer will render a muted "Could not parse sender cleanly" fallback.
    return out
  }
  const firstForwarded = sourceEmail?.forwardedFrom?.[0]
  if (firstForwarded && /<[^<>]*@[^<>]*>|^\s*\*?(?:from|sent):/i.test(firstForwarded)) {
    const out = parseBrokerSender(firstForwarded)
    if (out.name !== null || out.email !== null) return out
  }
  return null
}

/** Forwarder identity from the email's sender fields. Distinct from the
 *  broker sender — these are the person/system whose mailbox forwarded
 *  the note INTO our org. Returns null for direct emails (no forwarder). */
function deriveForwardedBy(
  sourceEmail: BrokerEmail | undefined | null,
): { readonly name: string | null; readonly email: string | null } | null {
  if (!sourceEmail) return null
  // Hide the row entirely for direct emails — `forwardedFrom` empty
  // means the sender IS the broker, not a forwarder; surfacing the same
  // person as both "Broker sender" and "Forwarded by" would be misleading.
  if ((sourceEmail.forwardedFrom?.length ?? 0) === 0) return null
  const name = sourceEmail.senderName?.trim() || null
  const email = sourceEmail.senderAddress?.trim() || null
  if (name === null && email === null) return null
  return { name, email }
}

export function useReportDetailViewModel(reportId: ReportId | null): QueryResult<ReportDetailViewModel> {
  const report = useAdapterQuery(
    async (a, s) => reportId ? a.getResearchReport(s, reportId) : null,
    [reportId ?? ''],
  )
  const summary = useAdapterQuery(
    async (a, s) => reportId ? a.getReportSummary(s, reportId) : null,
    [reportId ?? ''],
  )
  const evidence = useAdapterQuery(
    async (a, s) => reportId ? a.listEvidenceSnippets(s, reportId) : [],
    [reportId ?? ''],
  )
  const brokers = useAdapterQuery((a, s) => a.listBrokers(s), [])
  const allStocks = useAdapterQuery((a, s) => a.listStocks(s), [])
  const allSectors = useAdapterQuery((a, s) => a.listSectors(s), [])
  const sourceEmail = useAdapterQuery(
    async (a, s) => report.data ? a.getBrokerEmail(s, report.data.sourceEmailId) : null,
    [report.data?.sourceEmailId ?? ''],
  )
  const sourceAttachment = useAdapterQuery(
    async (a, s) => {
      const r = report.data
      if (!r || !r.sourceAttachmentId) return null
      const atts = await a.listAttachments(s, r.sourceEmailId)
      return atts.find((x) => x.id === r.sourceAttachmentId) ?? null
    },
    [report.data?.sourceAttachmentId ?? '', report.data?.sourceEmailId ?? ''],
  )

  const closure = useAdapterQuery(
    async (a, s) => {
      const t = report.data?.tickers[0]
      return t ? a.getConflictClosure(s, t) : null
    },
    [report.data?.tickers[0] ?? ''],
  )

  if (!reportId) return { data: null, loading: false, error: null }

  const loading = report.loading || summary.loading || evidence.loading
    || brokers.loading || allStocks.loading || allSectors.loading
    || sourceEmail.loading || sourceAttachment.loading || closure.loading
  const error = report.error ?? summary.error ?? evidence.error
    ?? brokers.error ?? allStocks.error ?? allSectors.error
    ?? sourceEmail.error ?? sourceAttachment.error ?? closure.error

  if (loading) return { data: null, loading: true, error: null }
  if (error) return { data: null, loading: false, error }
  if (!report.data || !brokers.data || !allStocks.data || !allSectors.data) {
    return { data: null, loading: true, error: null }
  }

  const broker = brokers.data.find((b) => b.id === report.data!.brokerId) ?? null
  const tickerSet = new Set<string>(report.data.tickers as readonly string[])
  const sectorSet = new Set<string>(report.data.sectorIds as readonly string[])
  const stocks = allStocks.data.filter((s) => tickerSet.has(s.ticker as string))
  const sectors = allSectors.data.filter((s) => sectorSet.has(s.id as string))

  const vm = buildReportDetailViewModel({
    report: report.data,
    summary: summary.data,
    evidence: evidence.data ?? [],
    broker,
    stocks,
    sectors,
    sourceEmail: sourceEmail.data ?? null,
    sourceAttachment: sourceAttachment.data ?? null,
    closure: closure.data ?? null,
  })
  return { data: vm, loading: false, error: null }
}
