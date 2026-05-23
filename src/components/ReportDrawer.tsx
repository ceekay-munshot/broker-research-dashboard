import React, { useEffect } from 'react'
import type { ReportId, EvidenceSnippet, ReportType, StockTicker, BrokerSource } from '../domain'
import { useReportDetailViewModel } from '../viewModels/reportDetail'
import type { ReportDetailViewModel, ReportStreetContext } from '../viewModels/reportDetail'
import { RATING_TEXT_COLOR, formatShortDate, formatTargetDelta, formatPrice } from '../viewModels/shared'
import { ARB_LABEL, ARB_COLOR, ARB_TOOLTIP } from '../viewModels/arb'
import { TONE_CHIP_CLASS, getActionLabelTone, BROKER_GLYPH_CLASS } from '../lib/semanticColor'
import { NOTE_SIGNAL_LABEL, NOTE_SIGNAL_SOURCE_BLURB, formatConsensusRating } from '../lib/signalVocab'
import { resolveSummaryNoteSignal, type NoteSignalInput } from '../lib/signalPolicy'

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

// Plain-language labels for how a note's broker was resolved.
const PROVENANCE_LABEL: Record<BrokerSource, string> = {
  metadata:                'from broker metadata',
  forwarded_body_header:   'from a forwarded “From:” header',
  signature_or_disclaimer: 'from the body / disclaimer',
  original_sender_domain:  'from the sender’s email domain',
  subject_prefix:          'from the subject prefix',
  llm_extraction:          'by extraction',
  unknown:                 'could not be resolved',
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
  const targetChangeFormat = formatTargetDelta(vm.targetPrice, vm.priorTargetPrice)
  const primaryTicker = vm.stocks[0]?.ticker ?? null

  return (
    <>
      <DrawerHeader title={`${vm.broker.shortName} · ${primaryTicker ?? 'Report'}`} onClose={onClose}/>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 flex flex-col gap-5">
          {/* Title + metadata */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold ${BROKER_GLYPH_CLASS}`}
              >{vm.broker.shortName.slice(0, 3).toUpperCase()}</span>
              <span className="text-slate-300 text-[12px]">{vm.broker.name}</span>
              {(() => {
                // Prefer the typed kind; fall back through the legacy mapper.
                // Renderers never display the raw legacy string.
                const sig = resolveNoteSignalChip(vm)
                if (sig === null || sig.noteSignalKind === null) {
                  return (
                    <span className="chip border border-line/10 text-slate-400 ml-auto">
                      {REPORT_TYPE_LABEL[vm.reportType]}
                    </span>
                  )
                }
                const label = NOTE_SIGNAL_LABEL[sig.noteSignalKind]
                return (
                  <>
                    <span
                      className={`ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TONE_CHIP_CLASS[getActionLabelTone(label)]}`}
                      title={sig.noteSignalSource ? NOTE_SIGNAL_SOURCE_BLURB[sig.noteSignalSource] : undefined}
                    >
                      {label}
                    </span>
                    <span className="chip border border-line/10 text-slate-400">
                      {REPORT_TYPE_LABEL[vm.reportType]}
                    </span>
                  </>
                )
              })()}
            </div>
            <h2 className="text-slate-100 text-[16px] font-semibold leading-snug">{vm.title}</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 num">
              <span>Published {formatShortDate(vm.publishedAt)}</span>
              <span>·</span>
              <span>Received {formatShortDate(vm.receivedAt)}</span>
              {vm.pageCount !== null && (<><span>·</span><span>{vm.pageCount} pages</span></>)}
            </div>
          </div>

          {/* This broker's call */}
          <div className="grid grid-cols-2 gap-2">
            <CalloutCell label="Rating"
              value={vm.rating ?? 'Not rated'}
              valueClass={vm.rating ? RATING_TEXT_COLOR[vm.rating] : 'text-slate-500'}/>
            <CalloutCell label="Target"
              value={formatPrice(vm.targetPrice, vm.targetCurrency, 0)}
              sub={
                vm.targetChanged
                  ? `${targetChangeFormat.direction === 'up' ? '▲ +' : targetChangeFormat.direction === 'down' ? '▼ ' : ''}${targetChangeFormat.delta}${vm.priorTargetPrice != null ? ` from ${formatPrice(vm.priorTargetPrice, vm.targetCurrency, 0)}` : ''}`
                  : vm.priorTargetPrice != null ? 'unchanged' : undefined
              }
              subClass={
                targetChangeFormat.direction === 'up' ? 'text-emerald-400'
                : targetChangeFormat.direction === 'down' ? 'text-rose-400'
                : 'text-slate-500'
              }/>
          </div>

          {/* How this call sits with the Street */}
          {vm.streetContext ? (
            <StreetContext ctx={vm.streetContext} currency={vm.targetCurrency} onOpenStreet={onSelectTicker}/>
          ) : primaryTicker ? (
            <div className="rounded border border-line/10 bg-line/[0.02] p-3 text-[12px] text-slate-400">
              No other broker covers {primaryTicker} in this feed yet — no Street comparison.
            </div>
          ) : null}

          {/* Broker note snapshot — absorbs the old standalone Thesis section */}
          <BrokerNoteSnapshot vm={vm}/>

          {/* Key points */}
          {vm.keyPoints.length > 0 && (
            <Section title="Key points">
              <ul className="flex flex-col gap-3">
                {vm.keyPoints.map((kp, idx) => (
                  <li key={idx} className="flex flex-col gap-1.5">
                    <div className="flex gap-2 text-[13px] text-slate-200">
                      <span className="text-slate-500 num w-5">{idx + 1}.</span>
                      <span className="flex-1 leading-relaxed">{highlightFigures(kp)}</span>
                    </div>
                    <EvidenceList snippets={vm.evidence.keyPointByIndex.get(idx) ?? []} indent/>
                  </li>
                ))}
              </ul>
            </Section>
          )}

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

          {/* Where this note came from — forwarder + broker provenance */}
          {(vm.receivedVia || vm.brokerProvenance) && (
            <Section title="Source">
              <div className="flex flex-col gap-1.5">
                {vm.receivedVia && (
                  <div className="flex gap-2 text-[12px]">
                    <span className="text-slate-500 w-28 shrink-0">Received via</span>
                    <span className="text-slate-300">{vm.receivedVia}</span>
                  </div>
                )}
                {vm.brokerProvenance && (
                  <div className="flex gap-2 text-[12px]">
                    <span className="text-slate-500 w-28 shrink-0">Broker resolved</span>
                    <span className="text-slate-300">
                      {PROVENANCE_LABEL[vm.brokerProvenance.source]}
                      {vm.brokerProvenance.evidence && (
                        <span className="text-slate-500"> — {vm.brokerProvenance.evidence}</span>
                      )}
                    </span>
                  </div>
                )}
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
            </Section>
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

// ── The Street context ──────────────────────────────────────────────────────

function StreetContext({ ctx, currency, onOpenStreet }: {
  ctx: ReportStreetContext
  currency: string | null
  onOpenStreet: (t: StockTicker) => void
}) {
  return (
    <section className="rounded border border-line/10 bg-line/[0.02] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">The Street on {ctx.ticker}</h3>
        <span
          className={`chip border ${ARB_COLOR[ctx.arb.band]} text-[10px] cursor-help`}
          title={ARB_TOOLTIP}
        >{ARB_LABEL[ctx.arb.band]}</span>
      </div>

      <div className="text-[12.5px] text-slate-200">
        {formatConsensusRating(ctx.consensusRating)}
        {ctx.consensusTarget !== null && (
          <span className="text-slate-400"> · median target {formatPrice(ctx.consensusTarget, currency, 0)}</span>
        )}
      </div>

      {ctx.targetLow !== null && ctx.targetHigh !== null && (
        <div className="text-[11.5px] text-slate-500 num">
          Range {formatPrice(ctx.targetLow, currency, 0)} – {formatPrice(ctx.targetHigh, currency, 0)}
          {' '}across {ctx.brokerCount} broker{ctx.brokerCount === 1 ? '' : 's'}
        </div>
      )}

      <StandingLine ctx={ctx}/>

      <button
        onClick={() => onOpenStreet(ctx.ticker)}
        className="self-start text-[11px] text-accent hover:text-accent-soft transition-colors"
      >Open Street view →</button>
    </section>
  )
}

function StandingLine({ ctx }: { ctx: ReportStreetContext }) {
  if (ctx.isOutlier) {
    const extremity =
      ctx.targetStanding === 'highest' ? ' It holds the highest target on the Street.'
      : ctx.targetStanding === 'lowest' ? ' It holds the lowest target on the Street.'
      : ''
    return (
      <div className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11.5px] text-amber-200">
        Outlier call — this broker breaks from the Street
        {ctx.outlierDirection ? ` (${ctx.outlierDirection})` : ''}.{extremity}
      </div>
    )
  }
  if (ctx.targetStanding === 'highest' || ctx.targetStanding === 'lowest') {
    return (
      <div className="text-[11.5px] text-slate-400">
        This is the {ctx.targetStanding} target on the Street.
      </div>
    )
  }
  if (ctx.targetStanding === 'mid') {
    return <div className="text-[11.5px] text-slate-500">This call sits within the Street's range.</div>
  }
  return null
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

function CalloutCell({
  label, value, valueClass, sub, subClass,
}: {
  label: string; value: string; valueClass?: string; sub?: string; subClass?: string;
}) {
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <div className="section-title">{label}</div>
      <div className={`text-[14px] font-semibold ${valueClass ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className={`text-[10.5px] num ${subClass ?? 'text-slate-500'}`}>{sub}</div>}
    </div>
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

// ── Broker note snapshot ────────────────────────────────────────────────────
// Progressive-disclosure detail mined from the forwarded email body: why the
// note matters, the numbers, and what to monitor. Absorbs the old standalone
// "Thesis" section so the thesis renders exactly once.

function BrokerNoteSnapshot({ vm }: { vm: ReportDetailViewModel }) {
  const whyItMatters = vm.thesis?.trim() || null
  const numbers = vm.keyNumbers
  const watch = vm.watchpoints
  const noteSignal = resolveNoteSignalChip(vm)
  const upsideChip = vm.upsideChipPct
  const nothingExtracted =
    !whyItMatters
    && numbers.length === 0
    && watch.length === 0
    && (noteSignal === null || noteSignal.noteSignalKind === null)
    && upsideChip === null

  // Nothing mined and no PDF to fall back to — render nothing.
  if (nothingExtracted && !vm.sourceDocument) return null

  return (
    <Section title="Broker note snapshot">
      {nothingExtracted ? (
        <p className="text-[12px] text-slate-400">
          Deep note details not extracted yet — open original PDF.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Note signal — typed chip + plain-language source blurb. The
              transform already suppressed redundant signals where the
              formal Call covers them, so anything we render here adds
              information beyond the Rating column. */}
          {noteSignal !== null && noteSignal.noteSignalKind !== null && (
            <div className="flex flex-col gap-1">
              <div className="section-title">Note signal</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded border ${TONE_CHIP_CLASS[getActionLabelTone(NOTE_SIGNAL_LABEL[noteSignal.noteSignalKind])]}`}
                >
                  {NOTE_SIGNAL_LABEL[noteSignal.noteSignalKind]}
                </span>
                {noteSignal.noteSignalSource && (
                  <span className="text-[11px] text-slate-500">
                    {NOTE_SIGNAL_SOURCE_BLURB[noteSignal.noteSignalSource]}
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Implied upside — independent of Note signal. Renders whenever
              the body produced a ≥15% upside, even if no note-signal chip
              fires and no other key-numbers were extracted. */}
          {upsideChip !== null && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="shrink-0 num text-[10.5px] font-semibold px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                title="Extracted from the note body"
              >
                +{Math.round(upsideChip)}% upside
              </span>
              <span className="text-[11px] text-slate-500">Extracted from the note body</span>
            </div>
          )}
          {whyItMatters && (
            <div className="flex flex-col gap-1.5">
              <div className="section-title">Why it matters</div>
              <p className="text-[13px] text-slate-200 leading-relaxed">{highlightFigures(whyItMatters)}</p>
              <EvidenceList snippets={vm.evidence.thesis}/>
            </div>
          )}
          {numbers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="section-title">Numbers that matter</div>
              <div className="flex flex-wrap gap-1.5">
                {vm.upsidePct !== null && (
                  <KeyNumberChip label="Upside" value={`+${Math.round(vm.upsidePct)}%`}/>
                )}
                {numbers.map((n) => (
                  <KeyNumberChip key={n.label} label={n.label} value={n.value}/>
                ))}
              </div>
            </div>
          )}
          {watch.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="section-title">What to watch</div>
              <div className="flex flex-wrap gap-1.5">
                {watch.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] border border-line/5 bg-line/[0.04] text-slate-300"
                  >{w}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

/** Resolve the Note signal chip for the drawer. Delegates to the shared
 *  `resolveSummaryNoteSignal` so the precedence (typed kind → legacy
 *  fallback) AND the non-duplication rule against `vm.rating` are
 *  applied in one place. Defence in depth: the transform already nulls
 *  `actionLabel` when it suppresses `noteSignalKind`, but re-applying
 *  here means OLD summaries on disk that still carry a legacy string
 *  can't revive a suppressed chip either. */
function resolveNoteSignalChip(vm: ReportDetailViewModel): NoteSignalInput | null {
  return resolveSummaryNoteSignal(
    {
      noteSignalKind: vm.noteSignalKind,
      noteSignalSource: vm.noteSignalSource,
      actionLabel: vm.actionLabel,
    },
    vm.rating,
  )
}

/** Compact label + value chip for "Numbers that matter". Deliberately not the
 *  global `.chip` class — that is uppercase and would mangle values like
 *  "23.7%" or "21/16x EBITDA". */
function KeyNumberChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2 py-1 rounded border border-line/5 bg-line/[0.04]">
      <span className="text-[10.5px] text-slate-400">{label}</span>
      <span className="num text-[11.5px] font-medium text-slate-200">{value}</span>
    </span>
  )
}
