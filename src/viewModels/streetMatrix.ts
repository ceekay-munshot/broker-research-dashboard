// Flattens a DivergenceCardViewModel into a topic × broker matrix — the
// Excel-like layout used by the Agreements & disagreements tab. One row per
// topic, one column per broker covering the stock; each cell summarises that
// broker's stance on that topic (or "—" when the broker didn't comment).
//
// Pure transform — no React, no data fetching. The component layer just
// reads `rows` and `brokers` to render the table.

import type {
  DivergenceCardViewModel, ConsensusPointVM, DisagreementPointVM, BrokerRef,
} from './divergence'
import type { DisagreementDimension } from '../engine/types'

export type MatrixSide = 'agree' | 'disagree'
export type CellStance = 'bull' | 'bear' | 'agree' | 'absent'

export interface MatrixCell {
  readonly stance: CellStance
  readonly summary: string
  /** Fuller excerpt shown inside the popover — may equal `summary`. */
  readonly excerpt: string
}

export type TopicCategory = 'Growth' | 'Margins' | 'Demand' | 'Catalysts' | 'Management' | 'Other'

export interface MatrixRow {
  readonly key: string
  readonly topic: string
  readonly category: TopicCategory
  /** Optional headline-style spread label, e.g. "120 bps" — null if unknown. */
  readonly spread: string | null
  readonly cellsByBrokerId: Readonly<Record<string, MatrixCell>>
}

export interface StreetMatrix {
  readonly side: MatrixSide
  readonly brokers: readonly BrokerRef[]
  readonly rows: readonly MatrixRow[]
}

const CATEGORY_BY_DIMENSION: Readonly<Record<DisagreementDimension, TopicCategory>> = {
  stance:               'Other',
  rating:               'Other',
  target_price:         'Other',
  growth:               'Growth',
  margin:               'Margins',
  demand_or_pricing:    'Demand',
  order_book:           'Demand',
  timing_or_catalyst:   'Catalysts',
  management_execution: 'Management',
}

const CATEGORY_ORDER: readonly TopicCategory[] = [
  'Growth', 'Margins', 'Demand', 'Catalysts', 'Management', 'Other',
]

/** Stance/rating/target_price are already shown in the header (verdict +
 *  target-price scale) — drop them from the matrix to avoid double-counting. */
function isShownInHeader(dim: DisagreementDimension): boolean {
  return dim === 'stance' || dim === 'rating' || dim === 'target_price'
}

function shortenClaim(text: string, max = 140): string {
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

/** Pick the bull/bear-side cell summary: the first non-empty claim, falling
 *  back to a generic "Bullish / Bearish view" when no extracted thesis text
 *  is attached. Keeps the cell scannable — one line is plenty. */
function sideSummary(claims: readonly string[], stance: 'bull' | 'bear'): { summary: string; excerpt: string } {
  const cleaned = claims.map((c) => c.trim()).filter((c) => c.length > 0)
  const first = cleaned[0]
  if (!first) {
    const label = stance === 'bull' ? 'Bullish view' : 'Cautious view'
    return { summary: label, excerpt: label }
  }
  const top = cleaned.slice(0, 3).join(' · ')
  return {
    summary: shortenClaim(first, 110),
    excerpt: shortenClaim(top, 400),
  }
}

function consensusSummary(p: ConsensusPointVM): { summary: string; excerpt: string } {
  const claim = p.claim.trim()
  const supporting = p.supportingClaims.map((s) => s.trim()).filter(Boolean).slice(0, 3)
  const summary = shortenClaim(claim.length > 0 ? claim : 'Agreed', 110)
  const excerpt = shortenClaim([claim, ...supporting].filter(Boolean).join(' · '), 400)
  return { summary, excerpt }
}

function disagreementRow(d: DisagreementPointVM, brokers: readonly BrokerRef[]): MatrixRow {
  const bull = sideSummary(d.bullClaims, 'bull')
  const bear = sideSummary(d.bearClaims, 'bear')

  const cells: Record<string, MatrixCell> = {}
  for (const b of brokers) {
    cells[b.id] = { stance: 'absent', summary: '—', excerpt: 'No view extracted from this broker on this topic.' }
  }
  for (const b of d.bullBrokers) {
    cells[b.id] = { stance: 'bull', summary: bull.summary, excerpt: bull.excerpt }
  }
  for (const b of d.bearBrokers) {
    cells[b.id] = { stance: 'bear', summary: bear.summary, excerpt: bear.excerpt }
  }

  const spread = spreadLabel(d.bullBrokers.length, d.bearBrokers.length)

  return {
    key: `dis-${d.dimension}-${d.topic}`,
    topic: d.topic,
    category: CATEGORY_BY_DIMENSION[d.dimension] ?? 'Other',
    spread,
    cellsByBrokerId: cells,
  }
}

function consensusRow(p: ConsensusPointVM, brokers: readonly BrokerRef[]): MatrixRow {
  const { summary, excerpt } = consensusSummary(p)
  const cells: Record<string, MatrixCell> = {}
  for (const b of brokers) {
    cells[b.id] = { stance: 'absent', summary: '—', excerpt: 'No view extracted from this broker on this topic.' }
  }
  for (const b of p.brokers) {
    cells[b.id] = { stance: 'agree', summary, excerpt }
  }
  return {
    key: `con-${p.dimension}-${p.topic}`,
    topic: p.topic,
    category: CATEGORY_BY_DIMENSION[p.dimension] ?? 'Other',
    spread: null,
    cellsByBrokerId: cells,
  }
}

function spreadLabel(bullCount: number, bearCount: number): string | null {
  if (bullCount === 0 || bearCount === 0) return null
  return `${bullCount} bull / ${bearCount} bear`
}

function categoryRank(c: TopicCategory): number {
  const idx = CATEGORY_ORDER.indexOf(c)
  return idx < 0 ? CATEGORY_ORDER.length : idx
}

/** Order brokers so the ones with the most coverage on the visible rows
 *  appear first — the table reads left-to-right by signal density. */
function orderBrokers(brokers: readonly BrokerRef[], rows: readonly MatrixRow[]): readonly BrokerRef[] {
  const coverage = new Map<string, number>()
  for (const r of rows) {
    for (const [id, cell] of Object.entries(r.cellsByBrokerId)) {
      if (cell.stance !== 'absent') coverage.set(id, (coverage.get(id) ?? 0) + 1)
    }
  }
  return [...brokers].sort((a, b) => {
    const ca = coverage.get(a.id) ?? 0
    const cb = coverage.get(b.id) ?? 0
    if (cb !== ca) return cb - ca
    return a.name.localeCompare(b.name)
  })
}

export function buildStreetMatrix(c: DivergenceCardViewModel, side: MatrixSide): StreetMatrix {
  const brokers = c.brokers
  const rows: MatrixRow[] = []

  if (side === 'disagree') {
    for (const d of c.disagreements) {
      if (isShownInHeader(d.dimension)) continue
      rows.push(disagreementRow(d, brokers))
    }
  } else {
    for (const p of c.consensus) {
      if (isShownInHeader(p.dimension)) continue
      rows.push(consensusRow(p, brokers))
    }
  }

  // Group by category (Growth → Margins → ...), then by row debate volume
  // within each category, so the spreadsheet reads top-down by importance.
  rows.sort((a, b) => {
    const ca = categoryRank(a.category)
    const cb = categoryRank(b.category)
    if (ca !== cb) return ca - cb
    const va = volumeOf(a)
    const vb = volumeOf(b)
    if (vb !== va) return vb - va
    return a.topic.localeCompare(b.topic)
  })

  return { side, brokers: orderBrokers(brokers, rows), rows }
}

function volumeOf(r: MatrixRow): number {
  let v = 0
  for (const c of Object.values(r.cellsByBrokerId)) {
    if (c.stance !== 'absent') v += 1
  }
  return v
}
