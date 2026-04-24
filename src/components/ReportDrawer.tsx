import React, { useEffect } from 'react'
import type { ReportId, EvidenceSnippet } from '../domain'
import { useReportDetailViewModel } from '../viewModels/reportDetail'
import { STANCE_TEXT_COLOR, RATING_TEXT_COLOR, formatShortDate, formatTargetDelta, formatPrice } from '../viewModels/shared'
import type { ReportDetailViewModel } from '../viewModels/reportDetail'

interface ReportDrawerProps {
  readonly reportId: ReportId | null
  readonly onClose: () => void
}

export default function ReportDrawer({ reportId, onClose }: ReportDrawerProps) {
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
        <DrawerBody reportId={reportId} onClose={onClose}/>
      </aside>
    </div>
  )
}

function DrawerBody({ reportId, onClose }: { reportId: ReportId; onClose: () => void }) {
  const { data, loading, error } = useReportDetailViewModel(reportId)

  if (loading) return <DrawerMessage onClose={onClose} tone="loading" text="Loading report…"/>
  if (error)   return <DrawerMessage onClose={onClose} tone="error" text={`Error: ${error.message}`}/>
  if (!data)   return <DrawerMessage onClose={onClose} tone="loading" text="Loading report…"/>

  return <DrawerContent vm={data} onClose={onClose}/>
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

function DrawerContent({ vm, onClose }: { vm: ReportDetailViewModel; onClose: () => void }) {
  const targetChangeFormat = formatTargetDelta(vm.targetPrice, vm.priorTargetPrice)

  return (
    <>
      <DrawerHeader title={`${vm.broker.shortName} · ${vm.stocks[0]?.ticker ?? 'Report'}`} onClose={onClose}/>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 flex flex-col gap-5">
          {/* Title + metadata */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold text-ink-950"
                style={{ background: vm.broker.color ?? '#94a3b8' }}
              >{vm.broker.shortName.slice(0, 3).toUpperCase()}</span>
              <span className="text-slate-300 text-[12px]">{vm.broker.name}</span>
              <span className="chip border border-line/10 text-slate-400 ml-auto">{vm.reportType}</span>
            </div>
            <h2 className="text-slate-100 text-[16px] font-semibold leading-snug">{vm.title}</h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 num">
              <span>Published {formatShortDate(vm.publishedAt)}</span>
              <span>·</span>
              <span>Received {formatShortDate(vm.receivedAt)}</span>
              {vm.pageCount !== null && (<><span>·</span><span>{vm.pageCount} pages</span></>)}
              {vm.language && (<><span>·</span><span className="uppercase">{vm.language}</span></>)}
            </div>
          </div>

          {/* Rating / target band */}
          <div className="grid grid-cols-3 gap-2">
            <CalloutCell label="Stance"
              value={vm.stance ?? '—'}
              valueClass={vm.stance ? STANCE_TEXT_COLOR[vm.stance] : 'text-slate-500'}/>
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

          {/* Thesis */}
          {vm.thesis && (
            <Section title="Thesis">
              <p className="text-[13px] text-slate-200 leading-relaxed">{vm.thesis}</p>
              <EvidenceList snippets={vm.evidence.thesis}/>
            </Section>
          )}

          {/* Key points */}
          {vm.keyPoints.length > 0 && (
            <Section title="Key points">
              <ul className="flex flex-col gap-3">
                {vm.keyPoints.map((kp, idx) => (
                  <li key={idx} className="flex flex-col gap-1.5">
                    <div className="flex gap-2 text-[13px] text-slate-200">
                      <span className="text-slate-500 num w-5">{idx + 1}.</span>
                      <span className="flex-1 leading-relaxed">{kp}</span>
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

          {/* Provenance */}
          <Section title="Provenance">
            <div className="flex flex-col gap-1.5 text-[11.5px]">
              <ProvenanceRow label="Sectors" value={vm.sectors.map((s) => s.name).join(' · ') || '—'}/>
              <ProvenanceRow label="Tickers" value={vm.stocks.map((s) => s.ticker).join(' · ') || '—'}/>
              {vm.sourceEmail && (
                <>
                  <ProvenanceRow label="Source email" value={vm.sourceEmail.subject}/>
                  <ProvenanceRow label="Sender" value={vm.sourceEmail.senderName}/>
                </>
              )}
              <ProvenanceRow
                label="Processing"
                value={vm.processingStatus}
                valueClass={vm.processingStatus === 'ready' ? 'text-emerald-400' : 'text-amber-400'}
              />
              <ProvenanceRow
                label="Confidence"
                value={vm.confidence !== null ? `${(vm.confidence * 100).toFixed(0)}%` : '—'}
                valueClass="num"
              />
              <ProvenanceRow label="Evidence snippets" value={String(vm.evidenceCount)} valueClass="num"/>
            </div>
          </Section>
        </div>
      </div>
    </>
  )
}

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

function ProvenanceRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-200 truncate max-w-[380px] text-right ${valueClass ?? ''}`}>{value}</span>
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
