// Small presentational primitives shared across the Disagreements tab.
// Kept in one file so the bigger components stay focused on layout.

import { useState } from 'react'
import type { Stance } from '../../domain'
import type { ResultantState, StrengthBand } from '../../engine/types'
import type { OutlierVM } from '../../viewModels/divergence'
import type { ConsensusRating } from '../../viewModels/arb'
import { TIER_LABEL, type BrokerTier } from '../../viewModels/disagreementInsight'
import { RESULTANT_STATE_CHIP_CLASS } from '../../lib/semanticColor'
import { RESULTANT_STATE_LABEL } from '../../lib/signalVocab'
import { RATING_TEXT_COLOR } from '../../viewModels/shared'

// ── Verdict (resultant state) ─────────────────────────────────────────
// Labels live in src/lib/signalVocab.ts so the Disagreements tab, By Stock,
// Stock Drawer and Report Drawer all read the same wording. Re-export the
// shared map for any disagreements-internal callers that still import it.

export const STATE_LABEL = RESULTANT_STATE_LABEL

export function VerdictBadge({ state, strength }: {
  state: ResultantState
  strength: StrengthBand
}) {
  return (
    <span className={`chip border ${RESULTANT_STATE_CHIP_CLASS[state]} inline-flex items-center gap-1 text-[10px]`}>
      {RESULTANT_STATE_LABEL[state]}
      <span className="text-slate-500">·</span>
      <span className="uppercase tracking-widest text-[9px] text-slate-500">{strength}</span>
    </span>
  )
}

// ── Call badge ────────────────────────────────────────────────────────
// The Street's call in plain words — the consensus rating with how many
// brokers back it (Buy · 5 of 8), "Mixed" when split, or "No rating yet".
// Same wording as the By Stock "Call" column; replaces the jargon verdict.

export function CallBadge({ cr }: { cr: ConsensusRating }) {
  if (cr.kind === 'clear') {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className={`text-[13px] font-semibold ${RATING_TEXT_COLOR[cr.rating]}`}>{cr.rating}</span>
        <span className="text-[10px] text-slate-500 num">{cr.agree} of {cr.total}</span>
      </span>
    )
  }
  if (cr.kind === 'tie') {
    return <span className="text-[13px] font-semibold text-amber-500 dark:text-amber-400">Mixed</span>
  }
  return <span className="text-[13px] font-medium text-slate-400">No rating yet</span>
}

// ── Severity bar ──────────────────────────────────────────────────────
// Encodes the target-price spread as a coloured fill. Caps at 100% so a
// runaway spread (e.g. 794%) still renders as a full, max-severity bar.

export function SeverityBar({ spreadPct }: { spreadPct: number | null }) {
  const fill = spreadPct === null ? 4 : Math.max(Math.min(spreadPct, 100), 4)
  const tone =
    spreadPct === null    ? 'bg-slate-600'
    : spreadPct >= 60     ? 'bg-rose-500'
    : spreadPct >= 25     ? 'bg-amber-500'
    :                       'bg-slate-500'
  return (
    <div className="h-1 w-full rounded-full bg-line/10 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${fill}%` }}/>
    </div>
  )
}

// ── Stance mix ────────────────────────────────────────────────────────

export function StanceMix({ dist }: { dist: Readonly<Record<Stance, number>> }) {
  return (
    <span className="num inline-flex items-center gap-0.5" title="Bullish / neutral / bearish brokers">
      <span className="text-emerald-400">{dist.bullish}</span>
      <span className="text-slate-600">/</span>
      <span className="text-slate-400">{dist.neutral}</span>
      <span className="text-slate-600">/</span>
      <span className="text-rose-400">{dist.bearish}</span>
    </span>
  )
}

// ── Confidence meter ──────────────────────────────────────────────────

export function ConfidenceMeter({ score, band }: { score: number; band: StrengthBand }) {
  const pct = Math.round(score * 100)
  const color = band === 'strong' ? 'bg-emerald-400' : band === 'moderate' ? 'bg-amber-400' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2 text-[10px]" title={`Closure confidence: ${pct}% (${band})`}>
      <span className="text-slate-500 uppercase tracking-widest">Confidence</span>
      <div className="w-20 h-1 rounded-full bg-line/10 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="num text-slate-300">{pct}%</span>
    </div>
  )
}

// ── Broker track-record dot ───────────────────────────────────────────
// A glanceable credibility hint joined from calibration data. The exact
// score lives in the "Who's been right" mode; this is just a tier cue.

const TIER_DOT: Readonly<Record<BrokerTier, string>> = {
  strong:   'bg-emerald-400',
  solid:    'bg-emerald-400/55',
  mixed:    'bg-slate-500',
  weak:     'bg-rose-400',
  unproven: 'bg-transparent border border-slate-600',
}

export function BrokerTierDot({ tier }: { tier: BrokerTier }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT[tier]}`}
      title={TIER_LABEL[tier]}
    />
  )
}

/** A broker name prefixed with its track-record dot. */
export function BrokerChip({ name, tier }: { name: string; tier: BrokerTier }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 whitespace-nowrap" title={TIER_LABEL[tier]}>
      <BrokerTierDot tier={tier}/>
      {name}
    </span>
  )
}

/** Calibration score badge — a broker's bottom-line "usefulness" in [-100, 100]. */
export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 30   ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
    : score >= 10  ? 'border-slate-400/30 text-slate-200 bg-line/[0.04]'
    : score >= -10 ? 'border-line/10 text-slate-400'
    :                 'border-rose-500/40 text-rose-300 bg-rose-500/10'
  return (
    <span
      className={`chip border ${tone} text-[11px] font-semibold num`}
      title="Calibration score: hit-rate vs 50% plus benchmark-relative magnitude, discounted for sample size"
    >
      {score >= 0 ? '+' : ''}{score.toFixed(0)}
    </span>
  )
}

// ── Outlier row ───────────────────────────────────────────────────────

export function OutlierRow({ outlier, tier }: { outlier: OutlierVM; tier: BrokerTier }) {
  const tone = outlier.direction === 'bullish' ? 'text-emerald-400' : 'text-rose-400'
  return (
    <li className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12px] flex-wrap">
        <span className="chip border border-amber-500/40 text-amber-300 text-[9.5px]">Outlier</span>
        <BrokerTierDot tier={tier}/>
        <span className="text-slate-100 font-semibold">{outlier.brokerName}</span>
        <span className={`${tone} uppercase text-[9.5px] tracking-widest`}>{outlier.direction}</span>
      </div>
      {outlier.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {outlier.reasons.map((r, idx) => (
            <span key={idx} className="chip bg-line/[0.04] border border-line/5 text-slate-400 text-[10px]">{r}</span>
          ))}
        </div>
      )}
    </li>
  )
}

// ── More-detail disclosure ────────────────────────────────────────────

export function MoreDetail({ children, label = 'More detail' }: {
  children: React.ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-line/5 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        {open ? `Hide ${label.toLowerCase()}` : label}
      </button>
      {open && <div className="mt-3 flex flex-col gap-4">{children}</div>}
    </div>
  )
}

// ── Loading / error / empty ───────────────────────────────────────────

export function ViewMessage({ tone, text }: { tone: 'loading' | 'error'; text: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm">
      <span className={tone === 'error' ? 'text-rose-400' : 'text-slate-500 animate-pulse'}>{text}</span>
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-line/[0.02] py-12 px-6 text-center">
      <div className="text-slate-200 font-medium text-[14px] mb-1">{title}</div>
      <p className="text-slate-500 text-[12.5px] max-w-md mx-auto">{body}</p>
    </div>
  )
}
