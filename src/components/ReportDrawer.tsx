import React, { Fragment, useEffect } from 'react'
import type { ReportId, EvidenceSnippet, ReportType, StockTicker, BrokerSource } from '../domain'
import { useReportDetailViewModel } from '../viewModels/reportDetail'
import type { ReportDetailViewModel, ReportStreetContext } from '../viewModels/reportDetail'
import { RATING_TEXT_COLOR, formatShortDate, formatPrice } from '../viewModels/shared'
import { ARB_LABEL, ARB_COLOR } from '../viewModels/arb'
import {
  TONE_CHIP_CLASS, getActionLabelTone, getChangeTone, BROKER_GLYPH_CLASS,
  type SemanticTone,
} from '../lib/semanticColor'
import { NOTE_SIGNAL_LABEL, NOTE_SIGNAL_SOURCE_BLURB, formatConsensusRating } from '../lib/signalVocab'
import { resolveSummaryNoteSignal, type NoteSignalInput } from '../lib/signalPolicy'
import { cleanDisplayKeyPoints, isBoilerplateKeyPoint } from '../lib/researchTextCleaners'

interface ReportDrawerProps {
  readonly reportId: ReportId | null
  readonly onClose: () => void
  readonly onSelectTicker: (t: StockTicker) => void
}

// Plain, customer-facing labels for the report-type enum.
const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  initiation:       'Initiation',
  update:           'Update',
  flash:            'Flash note',
  earnings_preview: 'Earnings preview',
  earnings_review:  'Earnings review',
  morning_note:     'Morning note',
  sector_note:      'Sector note',
  deep_dive:        'Deep dive',
  other:            'Research note',
}

// Plain-language NOUN labels for how a note's broker was resolved. Used
// both as a sub-line under "Broker" (`Resolved from {label}`) and as the
// solo "Resolution detail" line when no broker-sender is available. Noun
// shape, not preposition shape, so both sentence frames read naturally.
const PROVENANCE_LABEL_SHORT: Record<BrokerSource, string> = {
  metadata:                'Broker metadata',
  forwarded_body_header:   'Forwarded “From:” header',
  signature_or_disclaimer: 'Body / disclaimer',
  original_sender_domain:  'Sender email domain',
  subject_prefix:          'Subject prefix',
  llm_extraction:          'Extracted from content',
  unknown:                 'Unknown source',
}

export default function ReportDrawer({ reportId, onClose, onSelectTicker }: ReportDrawerProps) {
  // Close on Escape.
  useEffect(() => {
    if (!reportId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [reportId, onClose])

  if (!reportId) return null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute top-0 right-0 h-full w-full md:w-[540px] lg:w-[640px] bg-ink-950 border-l border-line/5 shadow-2xl flex flex-col">
        <DrawerBody reportId={reportId} onClose={onClose} onSelectTicker={onSelectTicker}/>
      </aside>
    </div>
  )
}

function DrawerBody({ reportId, onClose, onSelectTicker }: {
  reportId: ReportId
  onClose: () => void
  onSelectTicker: (t: StockTicker) => void
}) {
  const { data, loading, error } = useReportDetailViewModel(reportId)

  if (loading) return <DrawerMessage onClose={onClose} tone="loading" text="Loading report…"/>
  if (error)   return <DrawerMessage onClose={onClose} tone="error" text={`Error: ${error.message}`}/>
  if (!data)   return <DrawerMessage onClose={onClose} tone="loading" text="Loading report…"/>

  return <DrawerContent vm={data} onClose={onClose} onSelectTicker={onSelectTicker}/>
}

function DrawerMessage({ onClose, tone, text }: { onClose: () => void; tone: 'loading' | 'error'; text: string }) {
  return (
    <>
      <DrawerHeader title="Report detail" onClose={onClose}/>
      <div className="flex-1 flex items-center justify-center text-sm">
        <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
      </div>
    </>
  )
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-line/5">
      <div className="flex items-center gap-2">
        <span className="section-title">{title}</span>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-100 w-7 h-7 flex items-center justify-center rounded border border-line/5 hover:border-line/20 transition-colors"
        aria-label="Close"
      >✕</button>
    </div>
  )
}

function DrawerContent({ vm, onClose, onSelectTicker }: {
  vm: ReportDetailViewModel
  onClose: () => void
  onSelectTicker: (t: StockTicker) => void
}) {
  const primaryTicker = vm.stocks[0]?.ticker ?? null
  // Single source of truth for the note-signal chip — applies the typed-kind
  // precedence AND the formal-rating suppression in one place. Hero card 3
  // and any future consumer read from this, never from raw vm fields.
  const noteSignal: NoteSignalInput | null = resolveSummaryNoteSignal(
    {
      noteSignalKind: vm.noteSignalKind,
      noteSignalSource: vm.noteSignalSource,
      actionLabel: vm.actionLabel,
    },
    vm.rating,
  )

  return (
    <>
      <DrawerHeader title={`${vm.broker.shortName} · ${primaryTicker ?? 'Report'}`} onClose={onClose}/>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 flex flex-col gap-5">
          {/* Title + metadata. The note-signal chip used to live here; it
              moved into the hero panel below so the title row stays clean. */}
          <DrawerTitleRow vm={vm}/>

          {/* Investor-grade hero — 4 cards: Formal call, Implied upside,
              Note signal, Street context. Replaces the old two-card
              Rating/Target grid AND the standalone Street-context block. */}
          <BrokerCallHero vm={vm} noteSignal={noteSignal}/>

          {/* Rich Street-context detail — outlier callout + "Open Street
              view →" link. Only rendered when the broker is an outlier;
              otherwise the hero card already says everything needed. */}
          {vm.streetContext?.isOutlier && (
            <OutlierCallout ctx={vm.streetContext} onOpenStreet={onSelectTicker}/>
          )}

          {/* Executive read — highlighted thesis card with left accent. */}
          <ExecutiveRead vm={vm}/>

          {/* Numbers that matter — table (3+ rows) or compact chips (≤2). */}
          <NumbersTable vm={vm}/>

          {/* Watch items — chip rail with deterministic tone hints. */}
          <WatchItemsRail vm={vm}/>

          {/* Key takeaways — boilerplate-filtered bullets with evidence,
              numbered by display index but evidence-looked-up by original. */}
          <KeyTakeawaysList vm={vm}/>

          {/* Themes */}
          {vm.themes.length > 0 && (
            <Section title="Themes">
              <div className="flex flex-wrap gap-1.5">
                {vm.themes.map((t) => (
                  <span key={t} className="chip bg-line/[0.04] border border-line/5 text-slate-300">{t}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Risks */}
          {vm.risks.length > 0 && (
            <Section title="Risks">
              <ul className="flex flex-col gap-2">
                {vm.risks.map((r, idx) => (
                  <li key={idx} className="flex gap-2 text-[12.5px] text-slate-300 leading-relaxed">
                    <span className="text-rose-400/70 mt-0.5">▲</span>
                    <span className="flex-1">{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Catalysts */}
          {vm.catalysts.length > 0 && (
            <Section title="Catalysts">
              <ul className="flex flex-col gap-1.5">
                {vm.catalysts.map((c, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-[12.5px]">
                    <span className="num text-[10.5px] text-slate-500 w-16">
                      {c.expectedOn ? formatShortDate(c.expectedOn) : 'TBD'}
                    </span>
                    <span className="text-slate-300">{c.label}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Source — four customer-facing facts: Broker / Broker sender /
              Forwarded by / Resolution detail. Each fact gets its own row;
              the raw From-header markdown that used to leak into the primary
              line is now parsed into name + organizationHint + email by
              `parseBrokerSender` (see src/lib/brokerSender.ts) and rendered
              as separate lines. The warning rows (broker conflict + broker-
              stock conflict) stay below the fact rows. */}
          <SourceSection vm={vm}/>

          {(vm.brokerProvenance?.conflict || vm.brokerStockConflict) && (
            <div className="flex flex-col gap-1.5">
              {vm.brokerProvenance?.conflict && (
                <div className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11.5px] text-amber-200">
                  Conflicting broker signals on this note — needs review.
                </div>
              )}
              {vm.brokerStockConflict && (
                <div className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11.5px] text-amber-200">
                  This research house is also a covered company in this note — kept as both.
                </div>
              )}
            </div>
          )}

          {/* Source document */}
          {vm.sourceDocument && (
            <Section title="Source document">
              <a
                href={vm.sourceDocument.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded border border-accent/30 bg-accent/[0.06] px-3 py-2 text-[12px] text-accent hover:bg-accent/[0.1] transition-colors"
              >
                <span aria-hidden>↗</span>
                <span className="font-medium">Open original PDF</span>
                <span
                  className="ml-auto text-[10.5px] text-slate-400 truncate max-w-[260px]"
                  title={vm.sourceDocument.filename}
                >{vm.sourceDocument.filename}</span>
              </a>
            </Section>
          )}
        </div>
      </div>
    </>
  )
}

// ── Title row ──────────────────────────────────────────────────────────────
// Broker badge + name + report-type chip + title + meta. The note-signal
// chip that used to live here has moved into the hero panel below.

function DrawerTitleRow({ vm }: { vm: ReportDetailViewModel }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold ${BROKER_GLYPH_CLASS}`}
        >{vm.broker.shortName.slice(0, 3).toUpperCase()}</span>
        <span className="text-slate-300 text-[12px]">{vm.broker.name}</span>
        <span className="chip border border-line/10 text-slate-400 ml-auto">
          {REPORT_TYPE_LABEL[vm.reportType]}
        </span>
      </div>
      <h2 className="text-slate-100 text-[16px] font-semibold leading-snug">{vm.title}</h2>
      <div className="flex items-center gap-3 text-[11px] text-slate-500 num">
        <span>Published {formatShortDate(vm.publishedAt)}</span>
        <span>·</span>
        <span>Received {formatShortDate(vm.receivedAt)}</span>
        {vm.pageCount !== null && (<><span>·</span><span>{vm.pageCount} pages</span></>)}
      </div>
    </div>
  )
}

// ── Broker call hero — 4 cards ─────────────────────────────────────────────
// Formal call · Implied upside · Note signal · Street context. Always
// shows Formal call and Street context (with safe fallbacks); Implied
// upside and Note signal render conditionally. The Note signal card
// reads from the resolved `noteSignal` prop so the suppression rule
// applied in `DrawerContent` is the single source of truth.

function BrokerCallHero({ vm, noteSignal }: {
  vm: ReportDetailViewModel
  noteSignal: NoteSignalInput | null
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <FormalCallCard vm={vm}/>
      {vm.upsideChipPct !== null && <ImpliedUpsideCard upsideChipPct={vm.upsideChipPct}/>}
      {noteSignal?.noteSignalKind && <NoteSignalCard noteSignal={noteSignal}/>}
      <StreetContextCard vm={vm}/>
    </div>
  )
}

function HeroCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel p-3 flex flex-col gap-1.5">
      <div className="section-title">{label}</div>
      {children}
    </div>
  )
}

function FormalCallCard({ vm }: { vm: ReportDetailViewModel }) {
  const ratingClass = vm.rating ? RATING_TEXT_COLOR[vm.rating] : 'text-slate-500'
  const targetText = formatPrice(vm.targetPrice, vm.targetCurrency, 0)
  const priorTarget = vm.priorTargetPrice
  const deltaTone: SemanticTone = vm.targetDelta == null ? 'neutral' : getChangeTone(vm.targetDelta)
  const deltaArrow = vm.targetDelta == null ? '' : vm.targetDelta > 0 ? '▲' : vm.targetDelta < 0 ? '▼' : ''
  return (
    <HeroCard label="Formal call">
      <div className={`text-[16px] font-semibold leading-tight ${ratingClass}`}>
        {vm.rating ?? 'Not rated'}
      </div>
      <div className="num text-[12px] text-slate-300">Target {targetText}</div>
      {vm.targetChanged && vm.targetDelta != null && (
        <div className={`num text-[10.5px] ${TONE_CHIP_CLASS[deltaTone].split(' ').find((c) => c.startsWith('text-')) ?? ''}`}>
          {deltaArrow} {vm.targetDelta > 0 ? '+' : ''}{vm.targetDelta}
          {priorTarget != null && (
            <span className="text-slate-500"> from {formatPrice(priorTarget, vm.targetCurrency, 0)}</span>
          )}
        </div>
      )}
    </HeroCard>
  )
}

function ImpliedUpsideCard({ upsideChipPct }: { upsideChipPct: number }) {
  const tone: SemanticTone = getChangeTone(upsideChipPct)
  const toneTextClass = TONE_CHIP_CLASS[tone].split(' ').find((c) => c.startsWith('text-')) ?? 'text-slate-200'
  const sign = upsideChipPct >= 0 ? '+' : ''
  return (
    <HeroCard label="Implied upside">
      <div className={`num text-[16px] font-semibold leading-tight ${toneTextClass}`}>
        {sign}{Math.round(upsideChipPct)}% upside
      </div>
      <div className="text-[10.5px] text-slate-500">Extracted from the note body</div>
    </HeroCard>
  )
}

function NoteSignalCard({ noteSignal }: { noteSignal: NoteSignalInput }) {
  // Guard: render path ensures noteSignalKind is non-null at the call site,
  // but TS narrowing needs an explicit check.
  if (noteSignal.noteSignalKind === null) return null
  const label = NOTE_SIGNAL_LABEL[noteSignal.noteSignalKind]
  return (
    <HeroCard label="Note signal">
      <span
        className={`chip border w-fit ${TONE_CHIP_CLASS[getActionLabelTone(label)]}`}
      >{label}</span>
      {noteSignal.noteSignalSource && (
        <div className="text-[10.5px] text-slate-500">
          {NOTE_SIGNAL_SOURCE_BLURB[noteSignal.noteSignalSource]}
        </div>
      )}
    </HeroCard>
  )
}

function StreetContextCard({ vm }: { vm: ReportDetailViewModel }) {
  const ctx = vm.streetContext
  if (!ctx) {
    return (
      <HeroCard label="Street context">
        <div className="text-[12.5px] text-slate-500 italic leading-tight">No Street comparison yet</div>
      </HeroCard>
    )
  }
  return (
    <HeroCard label="Street context">
      <div className="text-[12.5px] text-slate-200 leading-tight">
        {formatConsensusRating(ctx.consensusRating)}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`chip border ${ARB_COLOR[ctx.arb.band]} text-[10px]`}>
          {ARB_LABEL[ctx.arb.band]}
        </span>
        {ctx.consensusTarget !== null && (
          <span className="num text-[10.5px] text-slate-400">
            median {formatPrice(ctx.consensusTarget, vm.targetCurrency, 0)}
          </span>
        )}
      </div>
    </HeroCard>
  )
}

// ── Outlier callout — only when this broker breaks from the Street ─────────
// Surfaces the rich detail that used to live inside the standalone
// `StreetContext` component (now dissolved into the hero panel above).

function OutlierCallout({ ctx, onOpenStreet }: {
  ctx: ReportStreetContext
  onOpenStreet: (t: StockTicker) => void
}) {
  const extremity =
    ctx.targetStanding === 'highest' ? ' It holds the highest target on the Street.'
    : ctx.targetStanding === 'lowest' ? ' It holds the lowest target on the Street.'
    : ''
  return (
    <div className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 flex items-center justify-between gap-3">
      <span className="text-[11.5px] text-amber-200 leading-snug">
        Outlier call — this broker breaks from the Street
        {ctx.outlierDirection ? ` (${ctx.outlierDirection})` : ''}.{extremity}
      </span>
      <button
        onClick={() => onOpenStreet(ctx.ticker)}
        className="text-[11px] text-accent hover:text-accent-soft transition-colors shrink-0 whitespace-nowrap"
      >Open Street view →</button>
    </div>
  )
}

// ── Executive read — highlighted thesis card ───────────────────────────────
// "Why this note matters" with a left accent border. Falls back to the
// first non-boilerplate key point when the extractor produced no thesis.

function ExecutiveRead({ vm }: { vm: ReportDetailViewModel }) {
  const thesis = vm.thesis?.trim() || null
  const fallback = thesis === null
    ? (cleanDisplayKeyPoints(vm.keyPoints)[0] ?? null)
    : null
  const text = thesis ?? fallback
  if (text === null) return null
  return (
    <section className="border-l-2 border-accent/40 pl-3 flex flex-col gap-1.5">
      <div className="section-title">Why this note matters</div>
      <p className="text-[13.5px] text-slate-100 leading-relaxed">{highlightFigures(text)}</p>
      {thesis !== null && vm.evidence.thesis.length > 0 && (
        <EvidenceList snippets={vm.evidence.thesis} indent/>
      )}
    </section>
  )
}

// ── Numbers that matter — table for 3+, compact chips for ≤2 ───────────────
// Adds an explicit "Upside +X%" row when `upsideChipPct` is set, alongside
// the body-extracted `keyNumbers`. Read-through column is a deterministic
// generic phrase set — never invents a company-specific narrative.

function NumbersTable({ vm }: { vm: ReportDetailViewModel }) {
  type Row = { readonly label: string; readonly value: string }
  const rows: Row[] = []
  if (vm.upsideChipPct !== null) {
    const sign = vm.upsideChipPct >= 0 ? '+' : ''
    rows.push({ label: 'Upside', value: `${sign}${Math.round(vm.upsideChipPct)}%` })
  }
  for (const n of vm.keyNumbers) rows.push({ label: n.label, value: n.value })
  if (rows.length === 0) return null

  if (rows.length <= 2) {
    return (
      <Section title="Numbers that matter">
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => <KeyNumberChip key={r.label} label={r.label} value={r.value}/>)}
        </div>
      </Section>
    )
  }

  return (
    <Section title="Numbers that matter">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1.5 items-baseline">
        <div className="section-title">Metric</div>
        <div className="section-title text-right">Value</div>
        <div className="section-title">Read-through</div>
        {rows.map((r) => (
          <Fragment key={r.label}>
            <div className="text-[12px] text-slate-200 truncate" title={r.label}>{r.label}</div>
            <div className="num text-[12px] text-slate-100 font-semibold text-right whitespace-nowrap">{r.value}</div>
            <div className="text-[11.5px] text-slate-500 truncate" title={readThroughLabel(r.label)}>
              {readThroughLabel(r.label)}
            </div>
          </Fragment>
        ))}
      </div>
    </Section>
  )
}

function readThroughLabel(label: string): string {
  if (/revenue|sales|rev\b|nii|aum|order/i.test(label)) return 'Growth / sales momentum'
  if (/ebitda|ebit\b|margin|roe|roic/i.test(label))    return 'Profitability'
  if (/pat\b|eps\b|profit/i.test(label))               return 'Earnings'
  if (/^upside$|upside\s*\(/i.test(label))             return 'Valuation'
  if (/guidance|outlook/i.test(label))                 return 'Management outlook'
  if (/cagr|capacity|expansion/i.test(label))          return 'Growth runway'
  return 'Key metric'
}

// ── Watch items — chip rail with deterministic tone ────────────────────────

function WatchItemsRail({ vm }: { vm: ReportDetailViewModel }) {
  if (vm.watchpoints.length === 0) return null
  return (
    <Section title="Watch items">
      <div className="flex flex-wrap gap-1.5">
        {vm.watchpoints.map((w) => (
          <span key={w} className={`chip border ${TONE_CHIP_CLASS[watchpointTone(w)]}`}>{w}</span>
        ))}
      </div>
    </Section>
  )
}

function watchpointTone(label: string): SemanticTone {
  if (/leverage|debt|regulatory|pricing\s+pressure|input\s+cost|fx|forex/i.test(label)) return 'caution'
  if (/capacity|market\s+share|guidance|expansion/i.test(label)) return 'info'
  return 'neutral'
}

// ── Key takeaways — boilerplate-filtered bullets ───────────────────────────
// Display numbering uses the FILTERED index (1, 2, 3, ...). Evidence
// lookup uses the ORIGINAL index so existing snippet attribution survives
// the filter pass.

function KeyTakeawaysList({ vm }: { vm: ReportDetailViewModel }) {
  const displayed = vm.keyPoints
    .map((text, originalIndex) => ({ text, originalIndex }))
    .filter((p) => !isBoilerplateKeyPoint(p.text))
  if (displayed.length === 0) return null
  return (
    <Section title="Key takeaways">
      <ol className="flex flex-col gap-3">
        {displayed.map((p, i) => (
          <li key={p.originalIndex} className="flex flex-col gap-1.5">
            <div className="flex gap-2 text-[13px] text-slate-200">
              <span className="text-slate-500 num w-5">{i + 1}.</span>
              <span className="flex-1 leading-relaxed">{highlightFigures(p.text)}</span>
            </div>
            <EvidenceList snippets={vm.evidence.keyPointByIndex.get(p.originalIndex) ?? []} indent/>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// ── Source section — four customer-facing rows ──────────────────────────
// Broker / Broker sender / Forwarded by / Resolution detail. Each row
// shows a primary value and (optionally) a muted sub-line. The fact-row
// layout means raw `*From:* …` evidence text no longer leaks into the
// primary visible line.

function SourceSection({ vm }: { vm: ReportDetailViewModel }) {
  // The "Broker" row always renders when we have either a broker name or
  // a canonical name from the resolver. The remaining rows are conditional.
  const brokerName = vm.broker.name && vm.broker.name !== '—'
    ? vm.broker.name
    : (vm.brokerProvenance?.canonicalName ?? null)
  const hasBrokerRow = brokerName !== null
  const hasSenderRow = vm.brokerSender !== null
    && (vm.brokerSender.name !== null || vm.brokerSender.email !== null
        || vm.brokerSender.raw !== '')
  const hasForwarderRow = vm.forwardedBy !== null
    && (vm.forwardedBy.name !== null || vm.forwardedBy.email !== null)
  // Resolution detail is shown only when we don't already have a sender
  // row — the sub-line under "Broker" already names the source there.
  const provSource = vm.brokerProvenance?.source ?? null
  const hasResolutionDetailRow = !hasSenderRow && provSource !== null

  if (!hasBrokerRow && !hasSenderRow && !hasForwarderRow && !hasResolutionDetailRow) {
    return null
  }

  return (
    <Section title="Source">
      <div className="flex flex-col gap-2">
        {hasBrokerRow && (
          <SourceRow
            label="Broker"
            value={brokerName}
            sub={provSource ? `Resolved from ${PROVENANCE_LABEL_SHORT[provSource]}` : null}
          />
        )}
        {hasSenderRow && <BrokerSenderRow sender={vm.brokerSender!}/>}
        {hasForwarderRow && (
          <SourceRow
            label="Forwarded by"
            value={vm.forwardedBy!.name ?? vm.forwardedBy!.email ?? '—'}
            sub={vm.forwardedBy!.name && vm.forwardedBy!.email ? vm.forwardedBy!.email : null}
          />
        )}
        {hasResolutionDetailRow && (
          <SourceRow label="Resolution detail" value={PROVENANCE_LABEL_SHORT[provSource!]}/>
        )}
      </div>
    </Section>
  )
}

function SourceRow({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-slate-200">{value}</span>
        {sub && <span className="text-[11px] text-slate-500 truncate">{sub}</span>}
      </div>
    </div>
  )
}

function BrokerSenderRow({ sender }: { sender: NonNullable<ReportDetailViewModel['brokerSender']> }) {
  // Three modes: clean parse (name present), email-only (no name parsed),
  // or full failure (raw evidence preserved but no name/email). For
  // failure we still surface a muted "Could not parse sender cleanly"
  // line so the user understands why nothing useful renders — instead of
  // a silent omission.
  if (sender.name) {
    return (
      <div className="flex gap-2 text-[12px]">
        <span className="text-slate-500 w-28 shrink-0">Broker sender</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-slate-200">
            {sender.name}
            {sender.organizationHint && (
              <span className="text-slate-500"> · {sender.organizationHint}</span>
            )}
          </span>
          {sender.email && <span className="text-[11px] text-slate-500 truncate">{sender.email}</span>}
        </div>
      </div>
    )
  }
  if (sender.email) {
    // We have an email but no clean name — surface the email as the
    // primary value so it's still useful.
    return (
      <div className="flex gap-2 text-[12px]">
        <span className="text-slate-500 w-28 shrink-0">Broker sender</span>
        <span className="text-slate-200 truncate">{sender.email}</span>
      </div>
    )
  }
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="text-slate-500 w-28 shrink-0">Broker sender</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-slate-400 italic">Could not parse sender cleanly</span>
        <span className="text-[11px] text-slate-500 font-mono truncate" title={sender.raw}>
          {sender.raw}
        </span>
      </div>
    </div>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}

function EvidenceList({ snippets, indent }: { snippets: readonly EvidenceSnippet[]; indent?: boolean }) {
  if (snippets.length === 0) return null
  return (
    <div className={`flex flex-col gap-1.5 ${indent ? 'ml-7' : ''}`}>
      {snippets.map((s) => (
        <div key={s.id} className="rounded border border-line/5 bg-line/[0.02] px-3 py-2 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
            <span className="chip border border-accent/30 text-accent/90">Evidence</span>
            <span className="num">p.{s.pageNumber}</span>
          </div>
          <div className="text-[12px] text-slate-300 italic leading-relaxed">“{s.textSnippet}”</div>
        </div>
      ))}
    </div>
  )
}

// ── Figure highlighting ─────────────────────────────────────────────────────
// Bold the data a reader scans for in note prose — percentages, prices,
// multiples, bps, and the call verb (upgrade / downgrade / maintain /
// initiate). Period markers like FY26 or 4Q are left plain so the emphasis
// stays meaningful.

const SCAN_TOKEN =
  /~?(?:₹|Rs\.?|US\$|\$|INR)\s?\d[\d.,/–-]*(?:bn|cr|mn|m|k|trn|lakh)?|~?\d[\d.,/–-]*\s?%|~?\d[\d.,/–-]*\s?bps|~?\d[\d.,/]*\s?x(?![A-Za-z])|\b(?:up|down)grad(?:e|ed|es|ing)\b|\bmaintain(?:s|ed|ing)?\b|\binitiat(?:e|ed|es|ing|ion)\b/gi

/** Render note prose with scannable data — figures and the call verb — wrapped
 *  in <strong>. Display only: the stored thesis / key points stay verbatim. */
function highlightFigures(text: string): React.ReactNode {
  const out: React.ReactNode[] = []
  const re = new RegExp(SCAN_TOKEN)
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <strong key={m.index} className="font-semibold text-slate-100">{m[0]}</strong>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Compact label + value chip used by `NumbersTable` when there are ≤2
 *  metrics to surface. Deliberately not the global `.chip` class — that
 *  is uppercase and would mangle values like "23.7%" or "21/16x EBITDA". */
function KeyNumberChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/5 bg-line/[0.04]">
      <span className="text-[10.5px] text-slate-400">{label}</span>
      <span className="num text-[11.5px] font-medium text-slate-200">{value}</span>
    </span>
  )
}
