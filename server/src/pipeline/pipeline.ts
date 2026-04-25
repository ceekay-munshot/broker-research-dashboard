// ─────────────────────────────────────────────────────────────────────────
// Pipeline orchestrator.
//
// One artifact at a time, advance the state machine:
//
//   fetched_raw
//      ↓ extractEmailEnvelope
//   parsed_email
//      ↓ AttachmentTextExtractor.extract per attachment
//   extracted_attachment_text
//      ↓ LinkedArtifactExtractor.extract per URL (optional, may fail soft)
//   extracted_linked_artifact_text
//      ↓ deterministic field extraction (broker / ticker / rating / target / type / digest split)
//   deterministic_fields_ready
//      ↓ LlmProvider.enrich(...) per candidate (optional)
//   llm_enriched
//      ↓ materialize(...) → canonical /v1 entities
//   materialized_ready  ← writes to InMemoryStore
//
// Failure / review:
//   - resolveBroker fails       → BROKER_NOT_RESOLVED (failed)
//   - empty extraction          → EMPTY_EXTRACTION   (review_needed)
//   - ambiguous ticker          → AMBIGUOUS_TICKER   (review_needed)
//   - conflicting rating/target → CONFLICTING_*      (review_needed)
//   - low-confidence digest     → LOW_CONFIDENCE_DIGEST (review_needed)
//   - linked artifact failure   → BROKEN_LINKED_ARTIFACT (best-effort,
//                                  pipeline continues with body+attachment)
//   - LLM error                 → LLM_FAILURE_FALLBACK (continue with
//                                  deterministic-only candidate)
// ─────────────────────────────────────────────────────────────────────────

import type { Iso8601, ReportType, Stance, StockTicker } from '../../../src/domain'
import { stocks as stockCatalog } from '../config/organizations'
import { extractEmailEnvelope } from './extract/email'
import {
  CachedTextAttachmentExtractor, type AttachmentTextExtractor,
} from './extract/attachment'
import {
  CachedLinkedArtifactExtractor, type LinkedArtifactExtractor,
} from './extract/linked'
import {
  resolveBroker,
  detectTickers, pickPrimaryTicker,
  detectRating, stanceFromRating,
  detectTargetPrice,
  detectReportType, looksLikeDigest,
  splitDigest,
} from './deterministic'
import type { LlmProvider } from './enrich/provider'
import { NoOpLlmProvider } from './enrich/noOpProvider'
import { provFromAttachment, provFromBody, provFromLinkedPdf, provFromLinkedWebpage } from './provenance'
import { applyArtifactCorrections, applyCandidateCorrections } from '../corrections/apply'
import { PipelineError } from './errors'
import { ReviewQueue } from './reviewQueue'
import { materialize } from './materialize'
import type { InMemoryStore } from '../store/InMemoryStore'
import type {
  EnrichedReportCandidate, ExtractedTextArtifact, ParsedReportCandidate,
  RawEmailArtifact, RawEmailArtifactJob, ParsedEmailArtifact,
} from './models'

export interface PipelineOptions {
  readonly attachmentExtractor?: AttachmentTextExtractor
  readonly linkedExtractor?: LinkedArtifactExtractor
  readonly llmProvider?: LlmProvider
  readonly reviewQueue?: ReviewQueue
  readonly store?: InMemoryStore
  /** Anchor for "now" used by stages that need a clock. */
  readonly now?: Date
  /** Module 16: indexed correction rules. When provided, the pipeline
   *  applies them between extraction and enrichment. */
  readonly corrections?: import('../corrections/types').CorrectionRuleSet
  /** Called once per fired rule application during the run. Lets the
   *  caller persist `applicationCount` / `correctedFields` deltas. */
  readonly onCorrectionApplied?: (a: import('../corrections/types').CorrectionApplication) => void
}

export interface PipelineRunResult {
  readonly job: RawEmailArtifactJob
  readonly outcome: 'materialized_ready' | 'review_needed' | 'failed'
}

export class Pipeline {
  readonly attachmentExtractor: AttachmentTextExtractor
  readonly linkedExtractor: LinkedArtifactExtractor
  readonly llmProvider: LlmProvider
  readonly reviewQueue: ReviewQueue
  readonly store: InMemoryStore | null
  readonly corrections: import('../corrections/types').CorrectionRuleSet | null
  readonly onCorrectionApplied: ((a: import('../corrections/types').CorrectionApplication) => void) | null

  constructor(opts: PipelineOptions = {}) {
    this.attachmentExtractor = opts.attachmentExtractor ?? new CachedTextAttachmentExtractor()
    this.linkedExtractor = opts.linkedExtractor ?? new CachedLinkedArtifactExtractor()
    this.llmProvider = opts.llmProvider ?? new NoOpLlmProvider()
    this.reviewQueue = opts.reviewQueue ?? new ReviewQueue()
    this.store = opts.store ?? null
    this.corrections = opts.corrections ?? null
    this.onCorrectionApplied = opts.onCorrectionApplied ?? null
  }

  /** Tracks fields per (reportId-key) corrected during the active run.
   *  Read by the materializer-side hook below to enrich the
   *  `MaterializationQuality.correctedFields` list. */
  private correctedFieldsByCandidate = new Map<string, string[]>()

  async run(artifact: RawEmailArtifact): Promise<PipelineRunResult> {
    // Reset per-run scratch space.
    this.correctedFieldsByCandidate = new Map<string, string[]>()

    const job: RawEmailArtifactJob = {
      artifact,
      state: 'fetched_raw',
      history: [{ at: nowIso(), state: 'fetched_raw' }],
    }

    try {
      // Stage 1: parse email envelope.
      let parsed = extractEmailEnvelope(artifact)
      let workingArtifact = artifact

      // Module 16: artifact-level corrections (linked include/exclude,
      // etc.). Apply BEFORE candidate generation so downstream sees
      // the corrected linked refs.
      if (this.corrections) {
        const r = applyArtifactCorrections(parsed, workingArtifact, this.corrections)
        parsed = r.parsed
        workingArtifact = r.artifact
        for (const a of r.applications) {
          this.onCorrectionApplied?.(a)
        }
      }
      job.parsedEmail = parsed
      advance(job, 'parsed_email')

      // Stage 2: attachment text extraction.
      const attachmentTexts = new Map<string, ExtractedTextArtifact>()
      for (const ref of workingArtifact.attachmentRefs) {
        try {
          const out = await this.attachmentExtractor.extract(ref)
          attachmentTexts.set(ref.filename, out)
        } catch {
          // Swallow individual attachment failures — the email + body
          // path still produces a canonical record.
        }
      }
      job.attachmentTexts = attachmentTexts
      advance(job, 'extracted_attachment_text')

      // Stage 3: linked-artifact extraction (optional + tolerant).
      const linkedTexts = new Map<string, ExtractedTextArtifact>()
      for (const ref of workingArtifact.linkedRefs) {
        try {
          const out = await this.linkedExtractor.extract(ref)
          linkedTexts.set(ref.url, out)
        } catch (e) {
          this.reviewQueue.enqueue(
            workingArtifact.orgId,
            workingArtifact,
            'BROKEN_LINKED_ARTIFACT',
            e instanceof Error ? e.message : String(e),
          )
        }
      }
      job.linkedTexts = linkedTexts
      advance(job, 'extracted_linked_artifact_text')

      // Stage 4: deterministic field extraction.
      let candidates = this.buildDeterministicCandidates({
        parsed, attachmentTexts, linkedTexts, raw: workingArtifact,
      })
      if (candidates.length === 0) {
        return this.failJob(job, 'EMPTY_EXTRACTION', 'No usable text from any source.')
      }

      // Module 16: candidate-level corrections. Apply BEFORE enrichment
      // so the LLM sees corrected facts. Track corrected fields per
      // (reportId-key) so the materializer's quality score reflects them.
      if (this.corrections) {
        const corrected: ParsedReportCandidate[] = []
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i]!
          const r = applyCandidateCorrections(c, workingArtifact, parsed, this.corrections)
          corrected.push(r.candidate)
          if (r.correctedFields.length > 0) {
            const key = `${parsed.messageId}:${i}:${(r.candidate.ticker as unknown as string) ?? '_'}`
            this.correctedFieldsByCandidate.set(key, [...r.correctedFields])
          }
          for (const a of r.applications) this.onCorrectionApplied?.(a)
        }
        candidates = corrected
      }

      job.candidates = candidates
      advance(job, 'deterministic_fields_ready')

      // Stage 5: LLM enrichment (optional).
      const enriched: EnrichedReportCandidate[] = []
      for (const c of candidates) {
        try {
          const enrichment = await this.llmProvider.enrich({
            candidate: c,
            bodyText: parsed.bodyText,
            attachmentTexts: [...attachmentTexts.values()],
            linkedTexts: [...linkedTexts.values()],
          })
          enriched.push({ candidate: c, enrichment })
        } catch (e) {
          if (e instanceof PipelineError && e.category === 'LLM_FAILURE_FALLBACK') {
            this.reviewQueue.enqueue(
              workingArtifact.orgId, workingArtifact, 'LLM_FAILURE_FALLBACK', e.detail,
            )
            // Continue with deterministic-only candidate.
            enriched.push({ candidate: c, enrichment: null })
          } else {
            throw e
          }
        }
      }
      job.enriched = enriched
      advance(job, 'llm_enriched')

      // Stage 6: materialize → canonical /v1 entities.
      const out = materialize({
        orgId: workingArtifact.orgId,
        parsedEmail: parsed,
        attachmentRefs: workingArtifact.attachmentRefs,
        enriched,
        receivedAt: workingArtifact.receivedAt,
        correctedFieldsByKey: this.correctedFieldsByCandidate,
      })
      job.materialized = out
      advance(job, 'materialized_ready')

      // Persist to the canonical store, if one was supplied.
      if (this.store) {
        this.store.upsertEmail(out.email)
        this.store.upsertAttachments(out.attachments)
        for (const r of out.reports) this.store.upsertReport(r)
        for (const s of out.summaries) this.store.upsertSummary(s)
        this.store.upsertEvidence(out.evidence)
        for (const o of out.opinions) this.store.upsertOpinion(o)
        // Quality metadata (Module 15) — only HybridCanonicalStore
        // implements `upsertQuality`; the base InMemoryStore ignores it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upsertQuality = (this.store as any).upsertQuality
        if (typeof upsertQuality === 'function') {
          for (const q of out.quality) upsertQuality.call(this.store, q)
        }
      }
      // Post-materialization review hooks (Module 15) — fire on every
      // run regardless of store type so downstream operators see the
      // signal whether or not persistence is wired.
      enqueuePostMaterializationReviews(this.reviewQueue, artifact, out.quality)

      return { job, outcome: 'materialized_ready' }
    } catch (e) {
      if (e instanceof PipelineError) {
        return this.failJob(job, e.category, e.detail, e.recoverable)
      }
      return this.failJob(job, 'INTERNAL', e instanceof Error ? e.message : String(e), false)
    }
  }

  // ── Deterministic candidate construction ──────────────────────────────

  private buildDeterministicCandidates(args: {
    readonly parsed: ParsedEmailArtifact
    readonly attachmentTexts: ReadonlyMap<string, ExtractedTextArtifact>
    readonly linkedTexts: ReadonlyMap<string, ExtractedTextArtifact>
    readonly raw: RawEmailArtifact
  }): readonly ParsedReportCandidate[] {
    const { parsed, attachmentTexts, linkedTexts } = args

    // Resolve (orgId, brokerId).
    const resolved = resolveBroker(parsed.recipientAddress, parsed.senderAddress)
    if (!resolved) {
      throw new PipelineError(
        'BROKER_NOT_RESOLVED',
        `recipient=${parsed.recipientAddress} sender=${parsed.senderAddress}`,
        false,
      )
    }

    const allText = [
      parsed.subject, parsed.bodyText,
      ...[...attachmentTexts.values()].map((a) => a.text),
      ...[...linkedTexts.values()].map((l) => l.text),
    ].join('\n')

    if (!allText.trim()) {
      throw new PipelineError('EMPTY_EXTRACTION', 'All text sources are empty.')
    }

    // Decide: digest or single?
    const wantsDigestSplit = looksLikeDigest(parsed.subject, parsed.bodyText)
      || detectTickers(parsed.bodyText).length >= 2
    const reportType = detectReportType(parsed.subject)
    const isDigestType = reportType === 'morning_note' || reportType === 'sector_note'

    if (wantsDigestSplit || isDigestType) {
      const split = splitDigest(parsed.bodyText)
      if (!split.confident && split.sections.length > 0) {
        // Build candidates anyway, but route to review.
        this.reviewQueue.enqueue(
          parsed.orgId, args.raw, 'LOW_CONFIDENCE_DIGEST',
          `${split.sections.length} candidate sections without strong heading anchors.`,
        )
      }
      if (split.sections.length >= 2) {
        return split.sections.map((sec) => this.makeCandidate({
          orgId: parsed.orgId,
          brokerId: resolved.brokerId,
          ticker: sec.ticker,
          parsed,
          sectionText: sec.text,
          attachmentTexts,
          linkedTexts,
          reportType,
          origin: 'digest_split',
          digestSection: sec.text.split('\n')[0]?.slice(0, 80) ?? undefined,
        }))
      }
      // Fell through — treat as single after all.
    }

    // Single candidate path.
    const { ticker, ambiguous } = pickPrimaryTicker(parsed.subject, parsed.bodyText)
    if (ambiguous) {
      this.reviewQueue.enqueue(
        parsed.orgId, args.raw, 'AMBIGUOUS_TICKER',
        `Multiple tickers resolved without a clear primary.`,
      )
    }
    const hasAttachment = attachmentTexts.size > 0
    return [this.makeCandidate({
      orgId: parsed.orgId,
      brokerId: resolved.brokerId,
      ticker,
      parsed,
      sectionText: parsed.bodyText,
      attachmentTexts,
      linkedTexts,
      reportType,
      origin: hasAttachment ? 'direct_attachment' : 'direct_body',
    })]
  }

  private makeCandidate(args: {
    readonly orgId: import('../../../src/domain').OrgId
    readonly brokerId: import('../../../src/domain').BrokerId
    readonly ticker: StockTicker | null
    readonly parsed: ParsedEmailArtifact
    readonly sectionText: string
    readonly attachmentTexts: ReadonlyMap<string, ExtractedTextArtifact>
    readonly linkedTexts: ReadonlyMap<string, ExtractedTextArtifact>
    readonly reportType: ReportType
    readonly origin: ParsedReportCandidate['origin']
    readonly digestSection?: string
  }): ParsedReportCandidate {
    const sectionText = args.sectionText
    const attachmentText = [...args.attachmentTexts.values()].map((a) => a.text).join('\n\n')
    const linkedText = [...args.linkedTexts.values()].map((l) => l.text).join('\n\n')
    const allText = `${args.parsed.subject}\n${sectionText}\n${attachmentText}\n${linkedText}`

    const ratingResult = detectRating(allText)
    if (ratingResult.conflicting) {
      this.reviewQueue.enqueue(
        args.orgId, /* a synthetic snapshot */ {
          id: args.parsed.messageId, orgId: args.orgId,
          receivedAt: args.parsed.receivedAt,
          envelope: {
            messageId: args.parsed.messageId,
            from: args.parsed.senderAddress,
            to: args.parsed.recipientAddress,
            subject: args.parsed.subject,
            receivedAt: args.parsed.receivedAt,
            bodyText: args.parsed.bodyText,
            bodyHtml: args.parsed.bodyHtml,
            forwardedBy: args.parsed.forwardedBy,
          },
          attachmentRefs: [], linkedRefs: [],
        },
        'CONFLICTING_RATINGS', 'Multiple distinct rating actions detected.',
      )
    }
    const tp = detectTargetPrice(allText)
    if (tp.conflicting) {
      this.reviewQueue.enqueue(
        args.orgId, /* synthetic snapshot */ {
          id: args.parsed.messageId, orgId: args.orgId,
          receivedAt: args.parsed.receivedAt,
          envelope: {
            messageId: args.parsed.messageId,
            from: args.parsed.senderAddress,
            to: args.parsed.recipientAddress,
            subject: args.parsed.subject,
            receivedAt: args.parsed.receivedAt,
            bodyText: args.parsed.bodyText,
            bodyHtml: args.parsed.bodyHtml,
            forwardedBy: args.parsed.forwardedBy,
          },
          attachmentRefs: [], linkedRefs: [],
        },
        'CONFLICTING_TARGETS', 'Multiple distinct target prices detected.',
      )
    }
    const stance: Stance = stanceFromRating(ratingResult.rating)

    const sectorId = args.ticker
      ? stockCatalog.find((s) => s.ticker === args.ticker)?.sectorId ?? null
      : null

    const summaryOneLine = composeOneLineSummary({
      subject: args.parsed.subject,
      ticker: args.ticker,
      rating: ratingResult.rating,
      targetPrice: tp.targetPrice,
      priorTargetPrice: tp.priorTargetPrice,
    })

    const deterministicEvidence = mineDeterministicEvidence({
      bodyText: args.parsed.bodyText,
      attachmentTexts: args.attachmentTexts,
      linkedTexts: args.linkedTexts,
      ticker: args.ticker,
    })

    return {
      ticker: args.ticker,
      sectorId,
      brokerId: args.brokerId,
      orgId: args.orgId,
      reportType: args.reportType,
      rating: ratingResult.rating,
      stance,
      targetPrice: tp.targetPrice,
      priorTargetPrice: tp.priorTargetPrice,
      publishedAt: args.parsed.receivedAt,
      receivedAt: args.parsed.receivedAt,
      title: args.parsed.subject,
      summaryOneLine,
      deterministicEvidence,
      origin: args.origin,
      digestSection: args.digestSection,
    }
  }

  // ── Failure helpers ──────────────────────────────────────────────────

  private failJob(
    job: RawEmailArtifactJob,
    category: import('./errors').PipelineErrorCategory,
    detail: string,
    recoverable = true,
  ): PipelineRunResult {
    job.error = { category, detail }
    const target = recoverable ? 'review_needed' : 'failed'
    advance(job, target)
    this.reviewQueue.enqueue(job.artifact.orgId, job.artifact, category, detail)
    return { job, outcome: target }
  }
}

// ── Stage helpers ──────────────────────────────────────────────────────

function advance(job: RawEmailArtifactJob, to: import('./states').ProcessingState): void {
  job.state = to
  job.history.push({ at: nowIso(), state: to })
}

/** Module 15 — fire post-materialization review hooks based on the
 *  per-report `MaterializationQuality`. Categories enqueued here are
 *  recoverable signals an operator should look at, not pipeline failures.
 *  Idempotent: ReviewQueue dedupes by (messageId, reasonCategory). */
function enqueuePostMaterializationReviews(
  reviewQueue: ReviewQueue,
  artifact: RawEmailArtifact,
  qualities: readonly import('./quality').MaterializationQuality[],
): void {
  for (const q of qualities) {
    if (q.flags.missingTargetForRatedNote) {
      reviewQueue.enqueue(
        artifact.orgId, artifact, 'MISSING_TARGET_FOR_RATED',
        `report ${q.reportId as unknown as string} has rating but no target price.`,
      )
    }
    if (q.flags.noEvidenceForFields.length > 0) {
      reviewQueue.enqueue(
        artifact.orgId, artifact, 'EVIDENCE_MISMATCH',
        `report ${q.reportId as unknown as string} populated [${q.flags.noEvidenceForFields.join(', ')}] without backing evidence.`,
      )
    }
    if (q.tier === 'low' && q.flags.thesisShorterThan > 0) {
      reviewQueue.enqueue(
        artifact.orgId, artifact, 'LOW_QUALITY_SUMMARY',
        `report ${q.reportId as unknown as string} thesis < ${q.flags.thesisShorterThan} chars and overall tier=low.`,
      )
    }
  }
}

function nowIso(): Iso8601 {
  return new Date().toISOString()
}

function composeOneLineSummary(args: {
  readonly subject: string
  readonly ticker: StockTicker | null
  readonly rating: import('../../../src/domain').Rating | null
  readonly targetPrice: number | null
  readonly priorTargetPrice: number | null
}): string {
  const parts: string[] = []
  if (args.ticker) parts.push(`${args.ticker as unknown as string}`)
  if (args.rating) parts.push(args.rating)
  if (args.targetPrice !== null) {
    if (args.priorTargetPrice !== null && args.priorTargetPrice !== args.targetPrice) {
      const pct = ((args.targetPrice - args.priorTargetPrice) / args.priorTargetPrice) * 100
      const sign = pct > 0 ? '+' : ''
      parts.push(`TP ₹${args.targetPrice} (${sign}${pct.toFixed(1)}%)`)
    } else {
      parts.push(`TP ₹${args.targetPrice}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : args.subject
}

function mineDeterministicEvidence(args: {
  readonly bodyText: string
  readonly attachmentTexts: ReadonlyMap<string, ExtractedTextArtifact>
  readonly linkedTexts: ReadonlyMap<string, ExtractedTextArtifact>
  readonly ticker: StockTicker | null
}): readonly import('./models').EvidenceSpan[] {
  const out: import('./models').EvidenceSpan[] = []

  // Pull a thesis-supporting sentence from the body if it mentions
  // pricing or the ticker.
  const sentences = args.bodyText.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  const tickerStr = args.ticker ? (args.ticker as unknown as string).toLowerCase() : null
  const thesisSentence = sentences.find((s) => /₹\s?\d/.test(s))
    ?? (tickerStr && sentences.find((s) => s.toLowerCase().includes(tickerStr)))
    ?? sentences[0]
  if (thesisSentence) {
    out.push({
      text: thesisSentence,
      provenance: provFromBody(),
      supportingField: 'thesis',
      fieldRef: '',
    })
  }

  const TP_RE = /(?:TP|PT|target\s+price|target)\s*₹?\s?\d/i

  // Pull up to 2 attachment-anchored evidence sentences (target / rating).
  let anchored = 0
  for (const [name, att] of args.attachmentTexts) {
    const attSentences = att.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
    const tpSentence = attSentences.find((s) => TP_RE.test(s))
    if (tpSentence) {
      out.push({
        text: tpSentence,
        provenance: provFromAttachment(name),
        supportingField: 'targetPrice',
        fieldRef: '',
      })
      anchored++
      if (anchored >= 2) break
    }
  }

  // Linked artifact evidence — pull a target-anchored sentence from each
  // linked artifact that contributed text. This makes
  // `quality.sourcesUsed.linkedWebpage` / `linkedPdf` reflect actual
  // contribution to the candidate.
  for (const [url, link] of args.linkedTexts) {
    const linkSentences = link.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
    const tpOrTickerSentence = linkSentences.find((s) => TP_RE.test(s))
      ?? (tickerStr ? linkSentences.find((s) => s.toLowerCase().includes(tickerStr)) : undefined)
      ?? linkSentences[0]
    if (!tpOrTickerSentence) continue
    const isPdf = link.provenance.kind === 'linked_pdf'
    out.push({
      text: tpOrTickerSentence,
      provenance: isPdf ? provFromLinkedPdf(url) : provFromLinkedWebpage(url),
      supportingField: 'thesis',
      fieldRef: '',
    })
  }

  return out
}
