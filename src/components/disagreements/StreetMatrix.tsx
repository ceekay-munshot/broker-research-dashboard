// The spreadsheet-style view of a stock's Street picture: topics down the
// rows, brokers across the columns, each cell a one-line stance summary.
// Clicking a cell opens a popover with a slightly longer excerpt. The
// outer toggle swaps agree vs disagree topics — content changes, not nav.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReportId, StockTicker } from '../../domain'
import type { DivergenceCardViewModel, BrokerRef, OutlierVM } from '../../viewModels/divergence'
import {
  buildStreetMatrix, type MatrixSide, type MatrixCell, type MatrixRow, type TopicCategory,
} from '../../viewModels/streetMatrix'
import { useStockStreetView } from '../../viewModels/stockStreetView'
import type { BrokerTier } from '../../viewModels/disagreementInsight'
import { BrokerTierDot } from './shared'
import BrokerViewCard from './BrokerViewCard'

/** The matrix has the two closure views plus a "Broker views" tab that lists
 *  each broker's full note — the detail block that used to live in the Stock
 *  drawer, now consolidated here. */
type Tab = MatrixSide | 'brokers'

interface Props {
  readonly c: DivergenceCardViewModel
  readonly tierFor: (brokerId: string) => BrokerTier
  readonly onSelectReport: (id: ReportId) => void
}

export default function StreetMatrix({ c, tierFor, onSelectReport }: Props) {
  const [tab, setTab] = useState<Tab>('disagree')
  const side: MatrixSide = tab === 'agree' ? 'agree' : 'disagree'
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
          tab={tab}
          onChange={setTab}
          disagreeCount={disagreeCount}
          agreeCount={agreeCount}
          brokerCount={c.brokerCount}
        />
        {tab !== 'brokers' && <Legend side={side}/>}
      </div>

      {tab === 'brokers' ? (
        <BrokerViewsPanel ticker={c.ticker} outliers={c.outliers} onSelectReport={onSelectReport}/>
      ) : matrix.rows.length === 0 ? (
        <EmptyMatrix side={side}/>
      ) : (
        <MatrixTable matrix={matrix} tierFor={tierFor}/>
      )}
    </div>
  )
}

// ── Broker views panel ──────────────────────────────────────────────────
// Each broker's full note on this stock — moved here from the Stock drawer so
// the detailed views live alongside the agree/disagree breakdown.

function BrokerViewsPanel({ ticker, outliers, onSelectReport }: {
  ticker: StockTicker
  outliers: readonly OutlierVM[]
  onSelectReport: (id: ReportId) => void
}) {
  const { data, loading, error } = useStockStreetView(ticker)
  const outlierByBroker = useMemo(
    () => new Map(outliers.map((o) => [o.brokerId, o])),
    [outliers],
  )
  if (loading) {
    return <div className="px-2 py-6 text-[12px] text-slate-500 animate-pulse">Loading broker views…</div>
  }
  if (error) {
    return <div className="px-2 py-6 text-[12px] text-rose-400">Could not load broker views: {error.message}</div>
  }
  const details = data?.brokerDetails ?? []
  if (details.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line/10 bg-line/[0.02] p-8 text-center">
        <div className="text-slate-300 text-[13px] font-medium mb-1">No broker notes yet</div>
        <p className="text-slate-500 text-[12px]">No broker coverage on this stock in the current window.</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {details.map((d) => (
        <BrokerViewCard
          key={d.reportId as unknown as string}
          detail={d}
          outlier={outlierByBroker.get(d.brokerId as unknown as string) ?? null}
          onSelectReport={onSelectReport}
        />
      ))}
    </ul>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────

function Toggle({ tab, onChange, disagreeCount, agreeCount, brokerCount }: {
  tab: Tab
  onChange: (t: Tab) => void
  disagreeCount: number
  agreeCount: number
  brokerCount: number
}) {
  const options: ReadonlyArray<readonly [Tab, string, number]> = [
    ['disagree', 'Where they disagree', disagreeCount],
    ['agree',    'Where they agree',    agreeCount],
    ['brokers',  'Broker views',        brokerCount],
  ]
  return (
    <div className="inline-flex rounded-lg border border-line/10 bg-line/[0.02] p-0.5">
      {options.map(([id, label, n]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors inline-flex items-center gap-1.5 ${
            tab === id ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {label}
          <span className={`num text-[10.5px] ${tab === id ? 'text-accent/80' : 'text-slate-500'}`}>{n}</span>
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

  // Bounded 2-D scroll region so the header row and first column can freeze
  // (spreadsheet-style). A plain overflow-x wrapper can't do this: once
  // overflow-x is auto, overflow-y computes to auto too, and without a height
  // bound there's no vertical scroll for `sticky top-0` to grab.
  return (
    <div className="rounded-md border border-line/20 bg-line/[0.02] overflow-auto max-h-[70vh]">
      <table className="w-full border-collapse text-[12px]">
        <colgroup>
          <col style={{ width: '220px' }}/>
          {matrix.brokers.map((b) => <col key={b.id}/>)}
        </colgroup>
        <thead>
          <tr className="border-b border-line/20">
            <th className="text-left px-3 py-2.5 font-medium text-slate-500 text-[10.5px] uppercase tracking-[0.12em] sticky top-0 left-0 bg-ink-900 z-30">
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
          className="px-3 pt-3 pb-1 bg-line/[0.04] border-t border-line/15"
        >
          <span className="sticky left-3 inline-block text-[10px] uppercase tracking-[0.16em] text-slate-500">
            {category}
          </span>
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
      className="text-left px-3 py-2 font-medium text-slate-200 text-[12px] border-l border-line/15 whitespace-nowrap sticky top-0 z-20 bg-ink-900"
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
      <td className="px-3 py-2.5 sticky left-0 bg-ink-900 z-10 border-r border-line/15">
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

  // The cell carries just the headline — the one clear thing this broker said
  // on this topic. The fuller wording (the "why" and any other claims) lives
  // in the click-to-expand popover so the grid stays scannable.
  const { kpi } = splitKpiWhy(cell.summary)

  return (
    <td className="border-l border-line/15 p-0 align-top min-w-[200px]">
      <button
        ref={triggerRef}
        onClick={isInteractive ? onOpen : undefined}
        disabled={!isInteractive}
        title={isInteractive ? 'Click for the full note' : undefined}
        className={`group relative block w-full text-left px-3 py-2.5 transition-colors ${cellTone} ${
          isInteractive ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {isInteractive ? (
          <>
            <span className="text-[12px] font-medium leading-snug line-clamp-2">{kpi}</span>
            <span className="pointer-events-none absolute bottom-1 right-1.5 text-[11px] leading-none opacity-0 group-hover:opacity-60 transition-opacity">⤢</span>
          </>
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
      <p className="text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
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
