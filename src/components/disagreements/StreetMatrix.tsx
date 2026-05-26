// The spreadsheet-style view of a stock's Street picture: topics down the
// rows, brokers across the columns, each cell a one-line stance summary.
// Clicking a cell opens a popover with a slightly longer excerpt. The
// outer toggle swaps agree vs disagree topics — content changes, not nav.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DivergenceCardViewModel, BrokerRef } from '../../viewModels/divergence'
import {
  buildStreetMatrix, type MatrixSide, type MatrixCell, type MatrixRow, type TopicCategory,
} from '../../viewModels/streetMatrix'
import type { BrokerTier } from '../../viewModels/disagreementInsight'
import { BrokerTierDot } from './shared'

interface Props {
  readonly c: DivergenceCardViewModel
  readonly tierFor: (brokerId: string) => BrokerTier
}

export default function StreetMatrix({ c, tierFor }: Props) {
  const [side, setSide] = useState<MatrixSide>('disagree')
  const matrix = useMemo(() => buildStreetMatrix(c, side), [c, side])

  // Counts label the toggle so the reader knows whether either side is
  // empty before they switch — saves a click.
  const disagreeCount = useMemo(
    () => buildStreetMatrix(c, 'disagree').rows.length,
    [c],
  )
  const agreeCount = useMemo(
    () => buildStreetMatrix(c, 'agree').rows.length,
    [c],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Toggle
          side={side}
          onChange={setSide}
          disagreeCount={disagreeCount}
          agreeCount={agreeCount}
        />
        <Legend side={side}/>
      </div>

      {matrix.rows.length === 0 ? (
        <EmptyMatrix side={side}/>
      ) : (
        <MatrixTable matrix={matrix} tierFor={tierFor}/>
      )}
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────

function Toggle({ side, onChange, disagreeCount, agreeCount }: {
  side: MatrixSide
  onChange: (s: MatrixSide) => void
  disagreeCount: number
  agreeCount: number
}) {
  const options: ReadonlyArray<readonly [MatrixSide, string, number]> = [
    ['disagree', 'Where they disagree', disagreeCount],
    ['agree',    'Where they agree',    agreeCount],
  ]
  return (
    <div className="inline-flex rounded-lg border border-line/10 bg-line/[0.02] p-0.5">
      {options.map(([id, label, n]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors inline-flex items-center gap-1.5 ${
            side === id ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {label}
          <span className={`num text-[10.5px] ${side === id ? 'text-accent/80' : 'text-slate-500'}`}>{n}</span>
        </button>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────

function Legend({ side }: { side: MatrixSide }) {
  if (side === 'disagree') {
    return (
      <div className="flex items-center gap-3 text-[10.5px] text-slate-500">
        <LegendChip cls="bg-emerald-500/25 border-emerald-500/50 dark:bg-emerald-500/15 dark:border-emerald-500/30" label="Bullish"/>
        <LegendChip cls="bg-rose-500/25 border-rose-500/50 dark:bg-rose-500/15 dark:border-rose-500/30" label="Bearish"/>
        <LegendChip cls="bg-line/[0.04] border-line/15" label="No view"/>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 text-[10.5px] text-slate-500">
      <LegendChip cls="bg-accent/25 border-accent/50 dark:bg-accent/15 dark:border-accent/30" label="Agreed view"/>
      <LegendChip cls="bg-line/[0.04] border-line/15" label="No view"/>
    </div>
  )
}

function LegendChip({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-sm border ${cls}`}/>
      {label}
    </span>
  )
}

// ── Table ─────────────────────────────────────────────────────────────

function MatrixTable({ matrix, tierFor }: {
  matrix: ReturnType<typeof buildStreetMatrix>
  tierFor: (brokerId: string) => BrokerTier
}) {
  const [open, setOpen] = useState<{ rowKey: string; brokerId: string } | null>(null)

  // Group rows by category so the spreadsheet reads with quiet section
  // headers — keeps the layout scannable when there are many topics.
  const groups = useMemo(() => {
    const map = new Map<TopicCategory, MatrixRow[]>()
    for (const r of matrix.rows) {
      const list = map.get(r.category) ?? []
      list.push(r)
      map.set(r.category, list)
    }
    return [...map.entries()]
  }, [matrix.rows])

  return (
    <div className="rounded-md border border-line/20 bg-line/[0.02] overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <colgroup>
          <col style={{ width: '220px' }}/>
          {matrix.brokers.map((b) => <col key={b.id}/>)}
        </colgroup>
        <thead>
          <tr className="border-b border-line/20">
            <th className="text-left px-3 py-2.5 font-medium text-slate-500 text-[10.5px] uppercase tracking-[0.12em] sticky left-0 bg-ink-900 z-[1]">
              Topic
            </th>
            {matrix.brokers.map((b) => (
              <BrokerHeader key={b.id} broker={b} tier={tierFor(b.id)}/>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(([category, rows]) => (
            <CategoryGroup
              key={category}
              category={category}
              rows={rows}
              brokers={matrix.brokers}
              open={open}
              onOpen={setOpen}
              onClose={() => setOpen(null)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CategoryGroup({ category, rows, brokers, open, onOpen, onClose }: {
  category: TopicCategory
  rows: readonly MatrixRow[]
  brokers: readonly BrokerRef[]
  open: { rowKey: string; brokerId: string } | null
  onOpen: (k: { rowKey: string; brokerId: string }) => void
  onClose: () => void
}) {
  return (
    <>
      <tr>
        <td
          colSpan={brokers.length + 1}
          className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 bg-line/[0.04] border-t border-line/15"
        >
          {category}
        </td>
      </tr>
      {rows.map((r) => (
        <Row
          key={r.key}
          row={r}
          brokers={brokers}
          openBrokerId={open?.rowKey === r.key ? open.brokerId : null}
          onOpen={(brokerId) => onOpen({ rowKey: r.key, brokerId })}
          onClose={onClose}
        />
      ))}
    </>
  )
}

function BrokerHeader({ broker, tier }: { broker: BrokerRef; tier: BrokerTier }) {
  return (
    <th
      className="text-left px-3 py-2 font-medium text-slate-200 text-[12px] border-l border-line/15 whitespace-nowrap"
      title={broker.name}
    >
      <span className="inline-flex items-center gap-1.5">
        <BrokerTierDot tier={tier}/>
        {broker.name}
      </span>
    </th>
  )
}

function Row({ row, brokers, openBrokerId, onOpen, onClose }: {
  row: MatrixRow
  brokers: readonly BrokerRef[]
  openBrokerId: string | null
  onOpen: (brokerId: string) => void
  onClose: () => void
}) {
  return (
    <tr className="border-t border-line/15 align-top">
      <td className="px-3 py-2.5 sticky left-0 bg-ink-900 z-[1] border-r border-line/15">
        <div className="flex flex-col gap-0.5 max-w-[200px]">
          <span className="text-slate-100 font-semibold text-[12.5px] leading-snug">{row.topic}</span>
          {row.spread !== null && (
            <span className="text-[10px] text-slate-500 num">{row.spread}</span>
          )}
        </div>
      </td>
      {brokers.map((b) => {
        const cell = row.cellsByBrokerId[b.id] ?? {
          stance: 'absent' as const,
          summary: '—',
          excerpt: 'No view extracted.',
        }
        return (
          <Cell
            key={b.id}
            cell={cell}
            broker={b}
            topic={row.topic}
            open={openBrokerId === b.id}
            onOpen={() => onOpen(b.id)}
            onClose={onClose}
          />
        )
      })}
    </tr>
  )
}

function Cell({ cell, broker, topic, open, onOpen, onClose }: {
  cell: MatrixCell
  broker: BrokerRef
  topic: string
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // Tailwind's emerald/rose/accent palettes don't auto-invert with the theme
  // (only the slate scale does — see tailwind.config.js). Use dark-on-tint in
  // light mode and light-on-tint in dark so the text reads either way.
  const cellTone =
    cell.stance === 'bull'
      ? 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:bg-emerald-500/[0.10] dark:text-emerald-200 dark:hover:bg-emerald-500/20'
      : cell.stance === 'bear'
      ? 'bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:bg-rose-500/[0.10] dark:text-rose-200 dark:hover:bg-rose-500/20'
      : cell.stance === 'agree'
      ? 'bg-accent/15 text-accent hover:bg-accent/25 dark:bg-accent/[0.10] dark:hover:bg-accent/20'
      : 'text-slate-500'

  const isInteractive = cell.stance !== 'absent'

  const { kpi, why } = splitKpiWhy(cell.summary)

  return (
    <td className="border-l border-line/15 p-0 align-top min-w-[200px]">
      <button
        ref={triggerRef}
        onClick={isInteractive ? onOpen : undefined}
        disabled={!isInteractive}
        className={`block w-full text-left px-3 py-2.5 transition-colors ${cellTone} ${
          isInteractive ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {isInteractive ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold leading-snug line-clamp-2">{kpi}</span>
            {why && (
              <span className="text-[11px] leading-snug line-clamp-2 opacity-75">{why}</span>
            )}
          </div>
        ) : (
          <span className="text-[12px] leading-snug">{cell.summary}</span>
        )}
      </button>
      {open && (
        <CellPopover
          cell={cell}
          broker={broker}
          topic={topic}
          anchor={triggerRef.current}
          onClose={onClose}
        />
      )}
    </td>
  )
}

// Anchor tags used by the fixture generator to nudge the classifier when the
// natural prose doesn't mention a dimension's keyword — strip them from the
// cell display so the KPI reads cleanly.
const ANCHOR_TAG_RE = /\s*\((?:margin|growth|demand|order pipeline|management|catalyst)\)\s*/gi

/** Split a cell claim into a tight KPI sentence (first sentence) and the
 *  "why" clause (rest). The generator deliberately writes paragraphs as
 *  "<KPI>. <Why>." — falling back to dash/em-dash separators when there's
 *  no period, and to the whole string as KPI when there's nothing to split. */
function splitKpiWhy(text: string): { kpi: string; why: string | null } {
  const t = text.replace(ANCHOR_TAG_RE, ' ').replace(/\s+/g, ' ').trim()
  // First period followed by a space and an uppercase letter — that's a
  // sentence boundary, not a decimal or an abbreviation.
  const periodIdx = t.search(/\.\s+(?=[A-Z(])/)
  if (periodIdx > 0) {
    return { kpi: t.slice(0, periodIdx), why: t.slice(periodIdx + 1).trim() }
  }
  // Em-dash fallback for one-clause paragraphs like "Margin tailwind from …".
  const dashIdx = t.indexOf(' — ')
  if (dashIdx > 0 && dashIdx < 80) {
    return { kpi: t.slice(0, dashIdx), why: t.slice(dashIdx + 3).trim() }
  }
  return { kpi: t, why: null }
}

function CellPopover({ cell, broker, topic, anchor, onClose }: {
  cell: MatrixCell
  broker: BrokerRef
  topic: string
  anchor: HTMLElement | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Position the popover via the anchor's bounding rect on every layout
  // tick — keeps it pinned through scroll / resize so the dropdown doesn't
  // get clipped by table-level overflow.
  useEffect(() => {
    if (!anchor) return
    const POPOVER_W = 320
    const update = () => {
      const r = anchor.getBoundingClientRect()
      const left = Math.max(8, Math.min(window.innerWidth - POPOVER_W - 8, r.left))
      const top = r.bottom + 6
      setPos({ top, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchor])

  // Dismiss on outside click / Escape — popover behaviour the user
  // already expects from menus in this app.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && anchor && !anchor.contains(target)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchor])

  if (!pos) return null

  const stanceLabel =
    cell.stance === 'bull'   ? 'Bullish'
    : cell.stance === 'bear' ? 'Bearish'
    : cell.stance === 'agree' ? 'Agreed view'
    : 'No view'
  const stanceCls =
    cell.stance === 'bull'   ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
    : cell.stance === 'bear' ? 'border-rose-500/40 text-rose-700 dark:text-rose-300'
    : cell.stance === 'agree' ? 'border-accent/40 text-accent'
    : 'border-line/10 text-slate-500'

  return createPortal(
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left, width: 320 }}
      className="fixed z-50 rounded-lg border border-line/15 bg-slate-900 shadow-xl p-3 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          <span className="text-slate-200 font-medium">{broker.name}</span>
          <span className="text-slate-600"> · </span>
          {topic}
        </span>
        <span className={`chip border ${stanceCls} text-[9.5px] shrink-0`}>{stanceLabel}</span>
      </div>
      <p className="text-[12px] text-slate-200 leading-relaxed line-clamp-5 whitespace-pre-wrap">
        {cell.excerpt.replace(ANCHOR_TAG_RE, ' ').replace(/\s+/g, ' ').trim()}
      </p>
      <div className="flex items-center justify-end pt-1 border-t border-line/15">
        <button
          onClick={onClose}
          className="text-[11px] text-slate-500 hover:text-slate-300"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyMatrix({ side }: { side: MatrixSide }) {
  const label = side === 'agree' ? 'agreement' : 'disagreement'
  return (
    <div className="rounded-md border border-dashed border-line/10 bg-line/[0.02] p-8 text-center">
      <div className="text-slate-300 text-[13px] font-medium mb-1">No {label} topics yet</div>
      <p className="text-slate-500 text-[12px] max-w-md mx-auto leading-relaxed">
        Needs 2+ broker notes with extracted topics. Once the server has tagged
        themes on enough reports for this stock, rows will appear here.
      </p>
    </div>
  )
}
